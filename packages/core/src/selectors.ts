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

export function getGroupWallpapers(state: State, groupId: string): LibraryItem[] {
  const lib = getLibrary(state);
  if (groupId === ALL_GROUP_ID) return lib;
  if (!state.records[recordKey('group', groupId)] || state.records[recordKey('group', groupId)].deleted) return lib;
  const ids = new Set(getMemberships(state).filter((m) => m.groupId === groupId).map((m) => m.wallpaperId));
  return lib.filter((w) => ids.has(w.id));
}

export function getGroupCounts(state: State): Record<string, number> {
  const lib = getLibrary(state);
  const inLib = new Set(lib.map((w) => w.id));
  const counts: Record<string, number> = { [ALL_GROUP_ID]: lib.length };
  for (const m of getMemberships(state)) {
    if (inLib.has(m.wallpaperId)) counts[m.groupId] = (counts[m.groupId] ?? 0) + 1;
  }
  return counts;
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
    .filter((r) => !builtinIds.has(r.id))
    .map((r) => withSecrets({ ...r.data, builtin: false }));
  return [...builtins, ...custom];
}

export function getEnabledSources(state: State): SourceConfig[] {
  return getSources(state).filter((s) => s.enabled);
}
