import { BUILTIN_SOURCES } from './sources/index.ts';
import { recordKey } from './store.ts';
import {
  ALL_GROUP_ID,
  type DeviceSettings,
  type Group,
  type Membership,
  type SourceConfig,
  type State,
  type Wallpaper,
} from './types.ts';

export type LibraryItem = Wallpaper & { addedAt: number };

function live<T>(state: State, kind: string): { id: string; data: T; updatedAt: number }[] {
  const out: { id: string; data: T; updatedAt: number }[] = [];
  for (const r of Object.values(state.records)) if (r.kind === kind && !r.deleted) out.push(r);
  return out;
}

export function getDeviceSettings(state: State, deviceId = state.local.deviceId): DeviceSettings {
  const r = state.records[recordKey('deviceSettings', deviceId)];
  return r?.data as DeviceSettings;
}

export function getAllDevices(state: State): { id: string; settings: DeviceSettings; isThisDevice: boolean }[] {
  return live<DeviceSettings>(state, 'deviceSettings').map((r) => ({
    id: r.id,
    settings: r.data,
    isThisDevice: r.id === state.local.deviceId,
  }));
}

/** All saved/downloaded wallpapers (this is the default "All" group). */
export function getLibrary(state: State): LibraryItem[] {
  return live<LibraryItem>(state, 'wallpaper')
    .map((r) => ({ ...r.data, addedAt: r.data.addedAt ?? r.updatedAt }))
    .sort((a, b) => b.addedAt - a.addedAt);
}

export function getGroups(state: State): Group[] {
  return live<Group>(state, 'group')
    .map((r) => r.data)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getGroupName(state: State, groupId: string): string {
  if (groupId === ALL_GROUP_ID) return 'All';
  const g = state.records[recordKey('group', groupId)];
  return g && !g.deleted ? (g.data as Group).name : 'All';
}

export function getMemberships(state: State): Membership[] {
  const groups = new Set(getGroups(state).map((g) => g.id));
  return live<Membership>(state, 'membership')
    .map((r) => r.data)
    .filter((m) => groups.has(m.groupId));
}

/** Ids of a group and everything below it. */
export function getGroupSubtreeIds(state: State, groupId: string): Set<string> {
  const groups = getGroups(state);
  const ids = new Set<string>([groupId]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const g of groups) {
      if (g.parentId && ids.has(g.parentId) && !ids.has(g.id)) {
        ids.add(g.id);
        grew = true;
      }
    }
  }
  return ids;
}

/** Names from the top level group down to this group, e.g. ['Anime', 'Naruto']. */
export function getGroupPath(state: State, groupId: string): string[] {
  const byId = new Map(getGroups(state).map((g) => [g.id, g]));
  const out: string[] = [];
  let cur = byId.get(groupId);
  for (let n = 0; cur && n < 20; n++) {
    out.unshift(cur.name);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return out;
}

export interface GroupNode {
  group: Group;
  depth: number;
}

/** Groups as a depth-first tree (parents before their sub-groups, siblings by name). */
export function getGroupTree(state: State): GroupNode[] {
  const groups = getGroups(state);
  const ids = new Set(groups.map((g) => g.id));
  const kids = new Map<string, Group[]>();
  for (const g of groups) {
    const p = g.parentId && ids.has(g.parentId) ? g.parentId : '';
    kids.set(p, [...(kids.get(p) ?? []), g]);
  }
  const out: GroupNode[] = [];
  const walk = (parent: string, depth: number) => {
    for (const g of kids.get(parent) ?? []) {
      out.push({ group: g, depth });
      if (depth < 10) walk(g.id, depth + 1);
    }
  };
  walk('', 0);
  return out;
}

/** Wallpapers of a group INCLUDING its sub-groups ('Anime' also shows Naruto, 'All' shows everything). */
export function getGroupWallpapers(state: State, groupId: string): LibraryItem[] {
  const lib = getLibrary(state);
  if (groupId === ALL_GROUP_ID) return lib;
  const rec = state.records[recordKey('group', groupId)];
  if (!rec || rec.deleted) return lib;
  const tree = getGroupSubtreeIds(state, groupId);
  const ids = new Set(getMemberships(state).filter((m) => tree.has(m.groupId)).map((m) => m.wallpaperId));
  return lib.filter((w) => ids.has(w.id));
}

export function getGroupCounts(state: State): Record<string, number> {
  const counts: Record<string, number> = { [ALL_GROUP_ID]: getLibrary(state).length };
  for (const g of getGroups(state)) counts[g.id] = getGroupWallpapers(state, g.id).length;
  return counts;
}

/** Folders (relative to the wallpaper folder) a wallpaper belongs in: one per group it is a direct member of. */
export function getWallpaperFolders(state: State, wallpaperId: string): string[][] {
  return getWallpaperGroupIds(state, wallpaperId).map((g) => getGroupPath(state, g)).filter((p) => p.length);
}

export function getWallpaperGroupIds(state: State, wallpaperId: string): string[] {
  return getMemberships(state).filter((m) => m.wallpaperId === wallpaperId).map((m) => m.groupId);
}

export function isSaved(state: State, wallpaperId: string): boolean {
  const r = state.records[recordKey('wallpaper', wallpaperId)];
  return !!r && !r.deleted;
}

/** Built-in sources (with user overrides) followed by custom sources. API keys come from local secrets. */
export function getSources(state: State): SourceConfig[] {
  const overrides = new Map(live<any>(state, 'source').map((r) => [r.id, r.data]));
  const withSecrets = (s: SourceConfig): SourceConfig => ({
    ...s,
    options: { ...s.options, ...(state.local.secrets[s.id] ?? {}) },
  });
  const builtins = BUILTIN_SOURCES.map((b) => {
    const o = overrides.get(b.id);
    return withSecrets(o ? { ...b, enabled: o.enabled ?? b.enabled, options: { ...b.options, ...(o.options ?? {}) } } : b);
  });
  const builtinIds = new Set(BUILTIN_SOURCES.map((b) => b.id));
  const custom = live<SourceConfig>(state, 'source')
    .filter((r) => !builtinIds.has(r.id) && (r.data.type as string) !== 'tmdb') // TMDB was removed
    .map((r) => withSecrets({ ...r.data, builtin: false }));
  return [...builtins, ...custom];
}

export function getEnabledSources(state: State): SourceConfig[] {
  return getSources(state).filter((s) => s.enabled);
}
