import {
  BrowseController,
  getSources,
  rotateNow,
  startRotation,
  Store,
  SyncManager,
  type Http,
  type PlatformActions,
} from '@wallpepper/core';
import { toast } from './toast';

type Info = Awaited<ReturnType<Window['api']['info']>>;

export interface Ctx {
  store: Store;
  sync: SyncManager;
  platform: PlatformActions;
  http: Http;
  browse: BrowseController;
  info: Info;
}

let ctx: Ctx | null = null;
export const getCtx = (): Ctx => {
  if (!ctx) throw new Error('App not ready');
  return ctx;
};

export async function bootstrap(): Promise<Ctx> {
  const api = window.api;
  const info = await api.info();
  const store = new Store(
    { load: api.loadState, save: api.saveState },
    { deviceName: info.hostname, platform: info.platform, folderPath: info.defaultFolder },
  );
  await store.init();

  // Network calls go through the main process so sources are not limited by CORS.
  const http: Http = (url, init) => api.http(url, init?.headers);
  const platform: PlatformActions = {
    download: (w, folder) => api.download({ id: w.id, url: w.url, title: w.title }, folder),
    setWallpaper: async (w, target) => {
      const r = await api.setWallpaper({ id: w.id, url: w.url }, target);
      if (r.note) toast(r.note);
    },
  };

  const sync = new SyncManager(store);
  if (store.state.local.auth) {
    sync.startAuto();
    void sync.sync().catch(() => {});
  }
  const browse = new BrowseController(() => getSources(store.state), http, 'landscape', { category: 'anime' });

  startRotation(store, platform, (e) => toast(`Playlist: ${(e as Error).message}`, 'error'));
  api.onTrayNext(() => {
    rotateNow(store, platform).catch((e) => toast(e.message, 'error'));
  });
  window.addEventListener('beforeunload', () => void store.flush());

  ctx = { store, sync, platform, http, browse, info };
  return ctx;
}
