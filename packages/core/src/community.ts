import { addToGroup, createGroup } from './actions.ts';
import { getVariant, setVariant, type Choice } from './compat.ts';
import { getGroups, getLibrary, getMemberships } from './selectors.ts';
import type { Store } from './store.ts';
import type { CategoryId, Wallpaper } from './types.ts';

/** Sort orders offered by the community list. */
export type CommunitySort = 'new' | 'popular' | 'largest';

export interface CommunityFilters {
  /** Free text: collection / group / sub-group name or description. */
  q?: string;
  /** Creator username (partial match). */
  user?: string;
  category?: CategoryId | '';
  sort?: CommunitySort;
  /** Only collections that contain sub-groups. */
  hasSubgroups?: boolean;
  /** Minimum number of wallpapers. */
  minCount?: number;
  page?: number;
}

export interface CommunitySummary {
  id: string;
  name: string;
  category: CategoryId;
  description: string;
  username: string;
  wallpaperCount: number;
  subgroupNames: string[];
  /** Up to 4 thumbnails for the card cover. */
  covers: string[];
  imports: number;
  updatedAt: number;
}

export interface CommunityPage {
  items: CommunitySummary[];
  nextPage: number | null;
  total: number;
}

/** A shared group tree: one root group, optional sub-groups and the wallpapers (links) in them. */
export interface CollectionPayload {
  groups: { key: string; name: string; parentKey?: string }[];
  /** `other` = how the wallpaper looks in the opposite orientation (see compat.ts). */
  wallpapers: (Wallpaper & { groupKeys: string[]; other?: Choice })[];
}

export interface CommunityDetail extends CommunitySummary {
  payload: CollectionPayload;
}

export interface CommunityPublishInput {
  /** Local group id; publishing the same group again updates the same collection. */
  sourceGroupId: string;
  name: string;
  category: CategoryId;
  description: string;
  payload: CollectionPayload;
}

export const MAX_PUBLISH_WALLPAPERS = 1500;

/** Builds the shareable payload for a group and all its sub-groups. */
export function buildCollection(store: Store, groupId: string): CollectionPayload {
  const state = store.state;
  const all = getGroups(state);
  const ids = new Set<string>([groupId]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const g of all) {
      if (g.parentId && ids.has(g.parentId) && !ids.has(g.id)) {
        ids.add(g.id);
        grew = true;
      }
    }
  }
  const groups = all.filter((g) => ids.has(g.id)).map((g) => ({ key: g.id, name: g.name, parentKey: g.id === groupId ? undefined : g.parentId }));
  const lib = new Map(getLibrary(state).map((w) => [w.id, w]));
  const byWallpaper = new Map<string, string[]>();
  for (const m of getMemberships(state)) {
    if (!ids.has(m.groupId) || !lib.has(m.wallpaperId)) continue;
    byWallpaper.set(m.wallpaperId, [...(byWallpaper.get(m.wallpaperId) ?? []), m.groupId]);
  }
  const wallpapers = [...byWallpaper.entries()].slice(0, MAX_PUBLISH_WALLPAPERS).map(([id, groupKeys]) => {
    const { addedAt: _addedAt, ...w } = lib.get(id)!;
    const v = getVariant(state, id);
    return { ...w, groupKeys, other: v?.choice };
  });
  return { groups, wallpapers };
}

/**
 * Copies a community collection into the local library as a group (+ sub-groups).
 * `under` makes the collection a sub-group of an existing group. Returns the new root group id.
 */
export function importCollection(
  store: Store,
  c: { name: string; category: CategoryId; payload: CollectionPayload },
  under?: string,
): string {
  const { groups, wallpapers } = c.payload;
  const root = groups.find((g) => !g.parentKey) ?? groups[0];
  const depth = (key: string): number => {
    let d = 0;
    let cur = groups.find((g) => g.key === key);
    while (cur?.parentKey && d < 20) {
      const parent: string = cur.parentKey;
      cur = groups.find((g) => g.key === parent);
      d++;
    }
    return d;
  };
  const idMap = new Map<string, string>();
  for (const g of [...groups].sort((a, b) => depth(a.key) - depth(b.key))) {
    const isRoot = g.key === root?.key;
    const parentId = isRoot ? under : g.parentKey ? idMap.get(g.parentKey) : undefined;
    idMap.set(g.key, createGroup(store, isRoot ? c.name : g.name, { parentId, category: c.category }).id);
  }
  for (const { groupKeys, other, ...w } of wallpapers) {
    for (const k of groupKeys) {
      const gid = idMap.get(k);
      if (gid) addToGroup(store, w as Wallpaper, gid);
    }
    if (other && !getVariant(store.state, w.id)) setVariant(store, w as Wallpaper, other);
  }
  return idMap.get(root?.key ?? '') ?? '';
}
