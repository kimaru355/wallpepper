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
  store.setLocal({ rotation: { lastWallpaperId: w.id, lastAt: Date.now() } });
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

export async function rotateNow(store: Store, platform: PlatformActions): Promise<LibraryItem | null> {
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
