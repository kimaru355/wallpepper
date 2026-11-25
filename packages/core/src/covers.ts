import { cachedFetch } from './cache.ts';
import type { Recommended } from './recommended.ts';
import { fetchPage, sourceSupports } from './sources/index.ts';
import type { Store } from './store.ts';
import type { Http, Orientation, SourceConfig, Wallpaper } from './types.ts';
import { getSources } from './selectors.ts';

const inflight = new Map<string, Promise<Wallpaper | null>>();
let running = 0;
const waiting: (() => void)[] = [];

/** At most a few cover lookups at the same time, so opening Home does not fire dozens of requests at once. */
async function slot<T>(fn: () => Promise<T>): Promise<T> {
  while (running >= 3) await new Promise<void>((r) => waiting.push(r));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

/** A representative image for a recommended collection (cached, so covers also show offline). */
export function loadCover(store: Store, http: Http, rec: Recommended, orientation: Orientation): Promise<Wallpaper | null> {
  const key = `cover|${orientation}|${rec.id}`;
  const running = inflight.get(key);
  if (running) return running;
  const p = slot(async () => {
    const sources = getSources(store.state).filter((s: SourceConfig) => s.enabled && sourceSupports(s, rec.category));
    const { data } = await cachedFetch<Wallpaper | null>(store, key, async () => {
      for (const s of sources) {
        try {
          const page = await fetchPage(s, { category: rec.category, query: rec.query, tag: rec.tag, page: 1, sort: 'popular', orientation }, http);
          if (page.items[0]) return page.items[0];
        } catch {
          /* try the next source */
        }
      }
      throw new Error('no cover');
    }).catch(() => ({ data: null }));
    return data;
  }).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}
