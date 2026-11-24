import { useEffect, useState, useSyncExternalStore } from 'react';
import type { State } from '@wallpepper/core';
import { getCtx } from './ctx';

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
