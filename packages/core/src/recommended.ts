import { addToGroup, createGroup } from './actions.ts';
import { cacheGet, cachedFetch } from './cache.ts';
import { getGroups } from './selectors.ts';
import type { Store } from './store.ts';
import { CATEGORIES, DEFAULT_SERVER_URL, type CategoryId, type Group, type Wallpaper } from './types.ts';

/**
 * Author recommendations (served by the backend): one entry per title/topic. Each opens as a browsable collection and can be saved
 * as a sub-group (e.g. Anime › Naruto). `query` is a plain search; `tag` is the exact board tag for Moebooru
 * sites (Konachan / Yande.re) where titles are tagged differently from their English names.
 */
export interface Recommended {
  id: string;
  title: string;
  category: CategoryId;
  query: string;
  tag?: string;
}

export interface RecommendationsDoc {
  updatedAt: number;
  items: Recommended[];
}

/**
 * The list is curated on the server (wallpepper-backend.pcstack.top/recommendations). It is cached, so Home still shows
 * the last list offline; `offline` tells the UI when that happened.
 */
export async function loadRecommendations(
  store: Store,
  onCached?: (items: Recommended[]) => void,
  fetchImpl: typeof fetch = fetch,
): Promise<{ items: Recommended[]; offline: boolean }> {
  const base = (store.state.local.auth?.serverUrl ?? DEFAULT_SERVER_URL).replace(/\/+$/, "");
  const { data, offline } = await cachedFetch<RecommendationsDoc>(
    store,
    "recommendations",
    async () => {
      const res = await fetchImpl(base + "/recommendations", { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error("Recommendations are unavailable (" + res.status + ")");
      return (await res.json()) as RecommendationsDoc;
    },
    (d) => onCached?.(d.items ?? []),
  );
  return { items: data.items ?? [], offline };
}

/** What is cached right now (no network). */
export const cachedRecommendations = (store: Store): Recommended[] => cacheGet<RecommendationsDoc>(store, "recommendations")?.data.items ?? [];

/**
 * "Save as sub-group": puts the given wallpapers into a sub-group named after the recommendation, inside a top level
 * group named after its category (e.g. Anime › Naruto), or inside `parentId` when the user picked one.
 */
export function saveRecommendedAsGroup(store: Store, rec: Recommended, items: Wallpaper[], parentId?: string): Group {
  const parent = parentId
    ? getGroups(store.state).find((g) => g.id === parentId)
    : createGroup(store, CATEGORIES.find((c) => c.id === rec.category)?.label ?? rec.category, { category: rec.category });
  const sub = createGroup(store, rec.title, { parentId: parent?.id, category: rec.category });
  for (const w of items.slice(0, 80)) addToGroup(store, w, sub.id);
  return sub;
}
