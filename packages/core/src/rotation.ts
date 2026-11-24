import { saveToLibrary } from './actions.ts';
import { getDeviceSettings, getGroupWallpapers, type LibraryItem } from './selectors.ts';
import type { Store } from './store.ts';
import type { Wallpaper, WallpaperTarget } from './types.ts';

/** Implemented per platform (Electron main process / Android native module). */
export interface PlatformActions {
  /** Download to the device's wallpaper folder; resolves to the saved file path/URI. */
  download(w: Wallpaper, folderPath: string): Promise<string>;
  /** Set as system wallpaper. The platform fetches the image itself. */
  setWallpaper(w: Wallpaper, target: WallpaperTarget): Promise<void>;
}

/** Download a wallpaper: save file, remember path, and add it to the "All" group. */
export async function downloadWallpaper(store: Store, platform: PlatformActions, w: Wallpaper): Promise<string> {
  const path = await platform.download(w, store.state.local.folderPath);
  store.setLocal({ downloads: { ...store.state.local.downloads, [w.id]: path } });
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
    await downloadWallpaper(store, platform, w);
    return 'downloaded';
  }
  await platform.setWallpaper(w, target ?? s.target);
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
    if (store.state.local.downloads[w.id]) continue;
    try {
      await downloadWallpaper(store, platform, w);
      n++;
    } catch {
      /* try again next round */
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
