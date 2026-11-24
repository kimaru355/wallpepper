import { useEffect, useState, useSyncExternalStore } from 'react';
import { ToastAndroid } from 'react-native';
import {
  BrowseController,
  getSources,
  startRotation,
  SyncManager,
  type State,
  type Store,
} from '@wallpepper/core';
import { createStore, http, platform } from './platform';

export interface Ctx {
  store: Store;
  sync: SyncManager;
  browse: BrowseController;
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
  // Phones browse portrait wallpapers.
  const browse = new BrowseController(() => getSources(store.state), http, 'portrait', { category: 'anime' });
  startRotation(store, platform, (e) => toast(`Playlist: ${(e as Error).message}`));
  ctx = { store, sync, browse };
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

export function useSyncStatus() {
  const { sync } = getCtx();
  const [, force] = useState(0);
  useEffect(() => sync.onStatus(() => force((n) => n + 1)), [sync]);
  return sync.status;
}
