import {
  BrowseController,
  cacheGet,
  cachePut,
  getSources,
  rotateNow,
  startRotation,
  Store,
  SyncManager,
  type BrowseCache,
  type BrowseFilters,
  type Orientation,
  type Http,
  type PlatformActions,
  type Wallpaper,
} from '@wallpepper/core';
import { composeImage } from './render';
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

function shortName(w: { id: string; title?: string }): string {
  let h = 5381;
  for (let i = 0; i < w.id.length; i++) h = ((h << 5) + h + w.id.charCodeAt(i)) | 0;
  return `${(w.title ?? 'wallpaper').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)}-${(h >>> 0).toString(36)}`;
}

/** Another browse list (e.g. one recommended collection) sharing the saved-results cache. */
export function makeBrowse(filters: Partial<BrowseFilters>, orientation: Orientation = 'landscape'): BrowseController {
  const { store, http } = getCtx();
  const cache: BrowseCache = {
    get: (k) => cacheGet<Wallpaper[]>(store, k)?.data,
    set: (k, v) => cachePut(store, k, v),
  };
  return new BrowseController(() => getSources(store.state), http, orientation, filters, cache);
}

/** Image url served from the on-disk cache (works offline). */
export const img = (url: string) => {
  const bytes = new TextEncoder().encode(url);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return 'wpimg://i/' + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

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
    folderLayout: 'tree',
    download: async (w, folder, subPath, render) => {
      if (!render) return api.download({ id: w.id, url: w.url, title: w.title }, folder, subPath);
      // folder mode with a crop / blurred background: save the finished picture
      const data = await composeImage(w.url, render.fit, render.crop, info.screen.width, info.screen.height);
      return api.saveWallpaperData(data, folder, subPath, `${shortName(w)}-${render.fit}${render.crop ? '-crop' : ''}`);
    },
    setWallpaper: async (w, target, fit, crop) => {
      let r: { note?: string };
      if (fit === 'blur' || crop) {
        const data = await composeImage(w.url, fit, crop, info.screen.width, info.screen.height);
        r = await api.setWallpaperData(data, `${shortName(w)}-${fit}${crop ? '-crop' : ''}`, target);
      } else {
        r = await api.setWallpaper({ id: w.id, url: w.url }, target, fit);
      }
      if (r.note) toast(r.note);
    },
    displays: () => api.displays(),
    setWallpapers: async (items, target) => {
      // crops and blurred backgrounds are drawn here; plain images are fetched by the main process
      const entries = await Promise.all(
        items.map(async ({ w, fit, crop }) =>
          fit === 'blur' || crop
            ? { data: await composeImage(w.url, fit, crop, info.screen.width, info.screen.height), name: `${shortName(w)}-${fit}${crop ? '-crop' : ''}` }
            : { id: w.id, url: w.url },
        ),
      );
      const plain = items.find((i) => i.fit !== 'blur' && !i.crop);
      const r = await api.setWallpapers(entries, target, plain?.fit ?? 'fill');
      if (r.note) toast(r.note);
    },
  };

  const sync = new SyncManager(store);
  if (store.state.local.auth) {
    sync.startAuto();
    void sync.sync().catch(() => {});
  }

  startRotation(store, platform, (e) => toast(`Playlist: ${(e as Error).message}`, 'error'));
  api.onTrayNext(() => {
    rotateNow(store, platform).catch((e) => toast(e.message, 'error'));
  });
  window.addEventListener('beforeunload', () => void store.flush());

  ctx = { store, sync, platform, http, browse: null as unknown as BrowseController, info };
  ctx.browse = makeBrowse({ category: 'anime' });
  return ctx;
}
