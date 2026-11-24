import { applyWallpaper, downloadWallpaper, getDeviceSettings, type Wallpaper } from '@wallpepper/core';
import { getCtx } from './ctx';
import { toast } from './toast';

/** Shared UI actions with user feedback. */
export async function uiSet(w: Wallpaper, target?: 'home' | 'lock' | 'both') {
  const { store, platform } = getCtx();
  try {
    const r = await applyWallpaper(store, platform, w, target);
    const folder = store.state.local.folderPath;
    toast(r === 'applied' ? 'Wallpaper set.' : `Saved to ${folder} (folder mode).`, 'ok');
  } catch (e: any) {
    toast(e.message ?? 'Could not set wallpaper', 'error');
  }
}

export async function uiDownload(w: Wallpaper) {
  const { store, platform } = getCtx();
  try {
    const path = await downloadWallpaper(store, platform, w);
    toast(`Downloaded to ${path}`, 'ok');
  } catch (e: any) {
    toast(e.message ?? 'Download failed', 'error');
  }
}

export const thisDevice = () => getDeviceSettings(getCtx().store.state);
