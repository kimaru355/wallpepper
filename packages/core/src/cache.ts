import type { Store } from './store.ts';

const MAX_ENTRIES = 300;

/** Cached JSON for `key` (any age), or undefined. Stored with the local state, never synced. */
export function cacheGet<T>(store: Store, key: string): { data: T; at: number } | undefined {
  const e = store.state.local.cache?.[key];
  return e ? { data: e.data as T, at: e.at } : undefined;
}

/** Remembers `data` under `key`; the oldest entries are dropped beyond a small limit. */
export function cachePut(store: Store, key: string, data: unknown): void {
  const cache = { ...(store.state.local.cache ?? {}), [key]: { at: Date.now(), data } };
  const keys = Object.keys(cache);
  if (keys.length > MAX_ENTRIES) {
    keys.sort((a, b) => cache[a].at - cache[b].at);
    for (const k of keys.slice(0, keys.length - MAX_ENTRIES)) delete cache[k];
  }
  store.setLocal({ cache });
}

/**
 * Stale-while-revalidate: calls `onCached` right away with what is cached (if anything), then fetches fresh data,
 * stores it and returns it. When the network fails and there is cached data, the cached data is returned with `offline: true`.
 */
export async function cachedFetch<T>(
  store: Store,
  key: string,
  fetcher: () => Promise<T>,
  onCached?: (data: T) => void,
): Promise<{ data: T; offline: boolean }> {
  const hit = cacheGet<T>(store, key);
  if (hit) onCached?.(hit.data);
  try {
    const data = await fetcher();
    cachePut(store, key, data);
    return { data, offline: false };
  } catch (e) {
    if (hit) return { data: hit.data, offline: true };
    throw e;
  }
}
