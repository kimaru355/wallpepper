import { useEffect, useState, useSyncExternalStore } from 'react';
import { ToastAndroid } from 'react-native';
import {
  BrowseController,
  cacheGet,
  cachePut,
  getSources,
  startRotation,
  SyncManager,
  type BrowseCache,
  type BrowseFilters,
  type State,
  type Store,
  type Wallpaper,
} from '@wallpepper/core';
import { pruneImageCache } from './imageCache';
import { createStore, http, platform } from './platform';

export interface Ctx {
  store: Store;
  sync: SyncManager;
  browse: BrowseController;
}

/** Another browse list (e.g. one recommended collection) that shares the saved-results cache. */
export function makeBrowse(filters: Partial<BrowseFilters>): BrowseController {
  const { store } = getCtx();
  const cache: BrowseCache = {
    get: (k) => cacheGet<Wallpaper[]>(store, k)?.data,
    set: (k, v) => cachePut(store, k, v),
  };
  return new BrowseController(() => getSources(store.state), http, 'portrait', filters, cache);
}

let ctx: Ctx | null = null;
export const getCtx = (): Ctx => {
  if (!ctx) throw new Error('App not ready');
  return ctx;
};

export const toast = (text: string) => ToastAndroid.show(text, ToastAndroid.LONG);

export async function bootstrap(): Promise<Ctx> {
  const store = createStore();
  await store.init();
  const sync = new SyncManager(store);
  if (store.state.local.auth) {
    sync.startAuto();
    void sync.sync().catch(() => {});
  }
  setTimeout(pruneImageCache, 5000);
  startRotation(store, platform, (e) => toast(`Playlist: ${(e as Error).message}`));
  ctx = { store, sync, browse: null as unknown as BrowseController };
  // Phones browse portrait wallpapers.
  ctx.browse = makeBrowse({ category: 'anime' });
  return ctx;
}

export function useAppState(): State {
  const { store } = getCtx();
  return useSyncExternalStore(store.subscribe, store.getState);
}

export function useBrowse() {
  const { browse } = getCtx();
  return useSyncExternalStore(browse.subscribe, browse.getState);
}

/** Subscribes to any BrowseController. */
export function useBrowseOf(c: BrowseController) {
  return useSyncExternalStore(c.subscribe, c.getState);
}

export function useSyncStatus() {
  const { sync } = getCtx();
  const [, force] = useState(0);
  useEffect(() => sync.onStatus(() => force((n) => n + 1)), [sync]);
  return sync.status;
}
