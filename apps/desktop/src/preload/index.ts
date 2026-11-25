import { contextBridge, ipcRenderer } from 'electron';

export interface UpdateStatus { version: string; current: string; how: 'install' | 'open'; size: number }

const api = {
  loadState: (): Promise<string | null> => ipcRenderer.invoke('state:load'),
  saveState: (json: string): Promise<void> => ipcRenderer.invoke('state:save', json),
  http: (url: string, headers?: Record<string, string>): Promise<any> => ipcRenderer.invoke('http:json', url, headers),
  setWallpaper: (w: { id: string; url: string }, target: string, fit: string): Promise<{ note?: string }> =>
    ipcRenderer.invoke('wallpaper:set', w, target, fit),
  download: (w: { id: string; url: string; title?: string }, folder: string, subPath: string[]): Promise<string> =>
    ipcRenderer.invoke('wallpaper:download', w, folder, subPath),
  setWallpaperData: (data: ArrayBuffer, name: string, target: string): Promise<{ note?: string }> =>
    ipcRenderer.invoke('wallpaper:setData', data, name, target),
  setWallpapers: (entries: ({ id: string; url: string } | { data: ArrayBuffer; name: string })[], target: string, fit: string): Promise<{ note?: string }> =>
    ipcRenderer.invoke('wallpaper:setMany', entries, target, fit),
  displays: (): Promise<number> => ipcRenderer.invoke('app:displays'),
  saveWallpaperData: (data: ArrayBuffer, folder: string, subPath: string[], name: string): Promise<string> =>
    ipcRenderer.invoke('wallpaper:saveData', data, folder, subPath, name),
  imageCacheSize: (): Promise<number> => ipcRenderer.invoke('cache:size'),
  clearImageCache: (): Promise<void> => ipcRenderer.invoke('cache:clear'),
  pickFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:folder'),
  info: (): Promise<{
    hostname: string; platform: 'windows' | 'mac' | 'linux'; defaultFolder: string; version: string;
    autostart: boolean; closeToTray: boolean; screen: { width: number; height: number };
  }> => ipcRenderer.invoke('app:info'),
  setAutostart: (on: boolean): Promise<void> => ipcRenderer.invoke('app:autostart', on),
  setCloseToTray: (on: boolean): Promise<void> => ipcRenderer.invoke('app:closeToTray', on),
  showItem: (path: string): Promise<void> => ipcRenderer.invoke('shell:showItem', path),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:openExternal', url),
  checkUpdate: (): Promise<UpdateStatus | null> => ipcRenderer.invoke('update:check'),
  installUpdate: (): Promise<void> => ipcRenderer.invoke('update:install'),
  onUpdateAvailable: (fn: (u: UpdateStatus) => void): (() => void) => {
    const h = (_e: unknown, u: UpdateStatus) => fn(u);
    ipcRenderer.on('update:available', h);
    return () => ipcRenderer.removeListener('update:available', h);
  },
  onUpdateProgress: (fn: (p: { done: number; total: number }) => void): (() => void) => {
    const h = (_e: unknown, p: { done: number; total: number }) => fn(p);
    ipcRenderer.on('update:progress', h);
    return () => ipcRenderer.removeListener('update:progress', h);
  },
  onTrayNext: (fn: () => void): (() => void) => {
    const h = () => fn();
    ipcRenderer.on('tray:next', h);
    return () => ipcRenderer.removeListener('tray:next', h);
  },
};

export type Api = typeof api;
contextBridge.exposeInMainWorld('api', api);
