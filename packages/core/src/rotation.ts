import { saveToLibrary } from './actions.ts';
import { resolveForThisDevice, type Crop } from './compat.ts';
import { getDeviceSettings, getGroupPath, getGroupWallpapers, getWallpaperFolders, type LibraryItem } from './selectors.ts';
import type { Store } from './store.ts';
import { ALL_GROUP_ID, type FitMode, type State, type Wallpaper, type WallpaperTarget } from './types.ts';

/** Implemented per platform (Electron main process / Android native module). */
export interface PlatformActions {
  /**
   * How folder mode lays files out: 'tree' = real sub folders (Anime/Naruto), 'albums' = flat albums where a
   * wallpaper is added to the root album and to one album per group it belongs to (Android has no nested albums).
   */
  folderLayout: 'tree' | 'albums';
  /**
   * Download into the device's wallpaper folder (+ `subPath` sub folders); resolves to the saved file path/URI.
   * With `render` the platform must save the image already cropped / on a blurred background.
   */
  download(w: Wallpaper, folderPath: string, subPath: string[], render?: { fit: FitMode; crop?: Crop }): Promise<string>;
  /** Set as system wallpaper. The platform fetches the image itself and applies `fit` (incl. 'blur') and `crop`. */
  setWallpaper(w: Wallpaper, target: WallpaperTarget, fit: FitMode, crop?: Crop): Promise<void>;
  /** Number of displays (computers). Absent = one. */
  displays?(): Promise<number>;
  /** One wallpaper per display, in display order; the first one also goes on the lock screen. */
  setWallpapers?(items: { w: Wallpaper; fit: FitMode; crop?: Crop }[], target: WallpaperTarget): Promise<void>;
}

const sameDir = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Folders a wallpaper should be written to in folder mode. */
export function folderDirs(state: State, platform: PlatformActions, wallpaperId: string): string[][] {
  const groups = getWallpaperFolders(state, wallpaperId);
  if (!groups.length) return [[]];
  if (platform.folderLayout === 'tree') return groups;
  // albums: root + every album on the way to each group (Wallpepper, Wallpepper - Anime, Wallpepper - Anime - Naruto)
  const out: string[][] = [[]];
  for (const g of groups) for (let i = 1; i <= g.length; i++) if (!out.some((d) => sameDir(d, g.slice(0, i)))) out.push(g.slice(0, i));
  return out;
}

/** Path (relative to the wallpaper folder) to point the OS wallpaper slideshow at to get exactly this group. */
export const folderForGroup = (state: State, groupId: string): string[] =>
  groupId === ALL_GROUP_ID ? [] : getGroupPath(state, groupId);

/** Download a wallpaper: save file, remember path, and add it to the "All" group. */
export async function downloadWallpaper(
  store: Store,
  platform: PlatformActions,
  w: Wallpaper,
  subPath: string[] = [],
  /** Folder mode: save the version made for THIS device (its orientation variant) instead of the original. */
  forThisDevice = false,
): Promise<string> {
  let target = w;
  let render: { fit: FitMode; crop?: Crop } | undefined;
  if (forThisDevice) {
    const r = resolveForThisDevice(store.state, w);
    target = r.wallpaper;
    if (r.fit === 'blur' || r.crop) render = { fit: r.fit, crop: r.crop };
  }
  const path = await platform.download(target, store.state.local.folderPath, subPath, render);
  const key = subPath.join('/');
  const dirs = store.state.local.downloadDirs?.[w.id] ?? [];
  store.setLocal({
    downloads: { ...store.state.local.downloads, [w.id]: store.state.local.downloads[w.id] ?? path },
    downloadDirs: { ...(store.state.local.downloadDirs ?? {}), [w.id]: dirs.includes(key) ? dirs : [...dirs, key] },
  });
  saveToLibrary(store, w);
  return path;
}

/**
 * "Set" button. In `apply` mode the app sets the wallpaper itself; in `folder` mode it only
 * downloads the file into the folder the OS reads wallpapers from.
 */
export async function applyWallpaper(
  store: Store,
  platform: PlatformActions,
  w: Wallpaper,
  target?: WallpaperTarget,
): Promise<'applied' | 'downloaded'> {
  const s = getDeviceSettings(store.state);
  if (s.mode === 'folder') {
    for (const d of folderDirs(store.state, platform, w.id)) await downloadWallpaper(store, platform, w, d, true);
    return 'downloaded';
  }
  const r = resolveForThisDevice(store.state, w);
  await platform.setWallpaper(r.wallpaper, target ?? s.target, r.fit, r.crop);
  saveToLibrary(store, w);
  store.setLocal({ rotation: { lastWallpaperId: w.id, lastAt: Date.now(), current: [w.id] } });
  return 'applied';
}

export function pickNext(store: Store): LibraryItem | null {
  const s = getDeviceSettings(store.state);
  const list = getGroupWallpapers(store.state, s.activeGroupId);
  if (!list.length) return null;
  const last = store.state.local.rotation.lastWallpaperId;
  if (s.rotationOrder === 'shuffle') {
    const pool = list.length > 1 ? list.filter((w) => w.id !== last) : list;
    return pool[Math.floor(Math.random() * pool.length)];
  }
  const idx = list.findIndex((w) => w.id === last);
  return list[(idx + 1) % list.length];
}

/** The next `n` wallpapers of the active group, all different when the group is big enough. */
export function pickNextMany(store: Store, n: number): LibraryItem[] {
  const s = getDeviceSettings(store.state);
  const list = getGroupWallpapers(store.state, s.activeGroupId);
  if (!list.length || n < 1) return [];
  const last = store.state.local.rotation.lastWallpaperId;
  let order: LibraryItem[];
  if (s.rotationOrder === 'shuffle') {
    const pool = list.length > n ? list.filter((w) => w.id !== last) : list.slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    order = pool;
  } else {
    const idx = list.findIndex((w) => w.id === last);
    order = list.map((_, k) => list[(idx + 1 + k) % list.length]);
  }
  // fewer wallpapers than displays: repeat them
  return Array.from({ length: n }, (_, k) => order[k % order.length]);
}

/** Displays that should each get their own wallpaper (1 = the same picture everywhere). */
async function differentDisplays(store: Store, platform: PlatformActions): Promise<number> {
  const s = getDeviceSettings(store.state);
  if (s.mode === 'folder' || s.perDisplay === false || s.fit === 'span' || !platform.displays || !platform.setWallpapers) return 1;
  return platform.displays().catch(() => 1);
}

/**
 * Shows the current wallpaper(s) again with the device's current settings, so a change of fit, target or
 * "same / different on each display" takes effect right away. Returns false when nothing was set yet.
 */
export async function reapplyCurrent(store: Store, platform: PlatformActions): Promise<boolean> {
  const s = getDeviceSettings(store.state);
  if (s.mode === 'folder') return false;
  const rot = store.state.local.rotation;
  const lib = new Map(getGroupWallpapers(store.state, ALL_GROUP_ID).map((w) => [w.id, w]));
  const ids = rot.current?.length ? rot.current : rot.lastWallpaperId ? [rot.lastWallpaperId] : [];
  const items = ids.map((id) => lib.get(id)).filter((w): w is LibraryItem => !!w);
  if (!items.length) return false;
  const n = await differentDisplays(store, platform);
  if (n > 1) {
    // not enough pictures for every display yet: pick new ones
    if (items.length < n) return (await rotateNow(store, platform)) !== null;
    await platform.setWallpapers!(
      items.slice(0, n).map((w) => {
        const r = resolveForThisDevice(store.state, w);
        return { w: r.wallpaper, fit: r.fit, crop: r.crop };
      }),
      s.target,
    );
    return true;
  }
  const lastAt = rot.lastAt;
  await applyWallpaper(store, platform, items[0]);
  // re-applying is not a rotation: keep the schedule where it was
  store.setLocal({ rotation: { ...store.state.local.rotation, lastAt } });
  return true;
}

export async function rotateNow(store: Store, platform: PlatformActions): Promise<LibraryItem | null> {
  const s = getDeviceSettings(store.state);
  // Several displays: a different wallpaper on each one (unless the device wants the same one everywhere).
  const n = await differentDisplays(store, platform);
  if (n > 1) {
    const picks = pickNextMany(store, n);
    if (!picks.length) return null;
    await platform.setWallpapers!(
      picks.map((w) => {
        const r = resolveForThisDevice(store.state, w);
        return { w: r.wallpaper, fit: r.fit, crop: r.crop };
      }),
      s.target,
    );
    store.setLocal({ rotation: { lastWallpaperId: picks[picks.length - 1].id, lastAt: Date.now(), current: picks.map((p) => p.id) } });
    return picks[0];
  }
  const next = pickNext(store);
  if (!next) return null;
  await applyWallpaper(store, platform, next);
  return next;
}

/** Folder mode: keep the OS folder filled with the active group's wallpapers. */
export async function syncFolder(store: Store, platform: PlatformActions): Promise<number> {
  const s = getDeviceSettings(store.state);
  if (s.mode !== 'folder') return 0;
  let n = 0;
  for (const w of getGroupWallpapers(store.state, s.activeGroupId)) {
    for (const d of folderDirs(store.state, platform, w.id)) {
      if (store.state.local.downloadDirs?.[w.id]?.includes(d.join('/'))) continue;
      try {
        await downloadWallpaper(store, platform, w, d, true);
        n++;
      } catch {
        /* try again next round */
      }
    }
  }
  return n;
}

/**
 * One scheduling step (used by background workers): switches wallpaper when the interval has
 * elapsed, or refills the OS folder in folder mode. Returns true when the wallpaper changed.
 */
export async function rotateIfDue(store: Store, platform: PlatformActions, toleranceMs = 60_000): Promise<boolean> {
  const s = getDeviceSettings(store.state);
  if (!s) return false;
  if (s.mode === 'folder') {
    await syncFolder(store, platform);
    return false;
  }
  if (!s.rotationEnabled) return false;
  const due = Date.now() - store.state.local.rotation.lastAt >= s.rotationMinutes * 60_000 - toleranceMs;
  if (!due) return false;
  return (await rotateNow(store, platform)) !== null;
}

/**
 * Starts the playlist loop for this device. Re-reads settings every tick so changes made
 * locally or pushed from another device take effect without restarting.
 */
export function startRotation(store: Store, platform: PlatformActions, onError?: (e: unknown) => void): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let lastGroup: string | null = null;

  const tick = async () => {
    if (stopped) return;
    const s = getDeviceSettings(store.state);
    try {
      if (s?.mode === 'folder') {
        await syncFolder(store, platform);
      } else if (s?.rotationEnabled) {
        const due = Date.now() - store.state.local.rotation.lastAt >= s.rotationMinutes * 60_000;
        // Changing the active group (locally or remotely) switches the wallpaper right away.
        if (due || (lastGroup !== null && lastGroup !== s.activeGroupId)) await rotateNow(store, platform);
      }
      lastGroup = s?.activeGroupId ?? null;
    } catch (e) {
      onError?.(e);
    }
    if (!stopped) timer = setTimeout(tick, 30_000);
  };
  timer = setTimeout(tick, 2_000);
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
