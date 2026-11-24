import { contextBridge, ipcRenderer } from 'electron';

const api = {
  loadState: (): Promise<string | null> => ipcRenderer.invoke('state:load'),
  saveState: (json: string): Promise<void> => ipcRenderer.invoke('state:save', json),
  http: (url: string, headers?: Record<string, string>): Promise<any> => ipcRenderer.invoke('http:json', url, headers),
  setWallpaper: (w: { id: string; url: string }, target: string): Promise<{ note?: string }> =>
    ipcRenderer.invoke('wallpaper:set', w, target),
  download: (w: { id: string; url: string; title?: string }, folder: string): Promise<string> =>
    ipcRenderer.invoke('wallpaper:download', w, folder),
  pickFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:folder'),
  info: (): Promise<{
    hostname: string; platform: 'windows' | 'mac' | 'linux'; defaultFolder: string; version: string;
    autostart: boolean; closeToTray: boolean;
  }> => ipcRenderer.invoke('app:info'),
  setAutostart: (on: boolean): Promise<void> => ipcRenderer.invoke('app:autostart', on),
  setCloseToTray: (on: boolean): Promise<void> => ipcRenderer.invoke('app:closeToTray', on),
  showItem: (path: string): Promise<void> => ipcRenderer.invoke('shell:showItem', path),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:openExternal', url),
  onTrayNext: (fn: () => void): (() => void) => {
    const h = () => fn();
    ipcRenderer.on('tray:next', h);
    return () => ipcRenderer.removeListener('tray:next', h);
  },
};

export type Api = typeof api;
contextBridge.exposeInMainWorld('api', api);
