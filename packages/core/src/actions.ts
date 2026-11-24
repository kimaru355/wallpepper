import { getGroups, getLibrary, getMemberships, getSources } from './selectors.ts';
import { recordKey, uid, type Store } from './store.ts';
import { SOURCE_TYPE_HELP } from './sources/index.ts';
import { ALL_GROUP_ID, type DeviceSettings, type Group, type SourceConfig, type SourceType, type Wallpaper } from './types.ts';

const membershipId = (groupId: string, wallpaperId: string) => `${groupId}|${wallpaperId}`;

/** Save the wallpaper (image link + metadata) into the account library = the "All" group. */
export function saveToLibrary(store: Store, w: Wallpaper): void {
  const key = recordKey('wallpaper', w.id);
  const existing = store.state.records[key];
  if (existing && !existing.deleted) return;
  store.put('wallpaper', w.id, { ...w, addedAt: Date.now() });
}

export function removeFromLibrary(store: Store, wallpaperId: string): void {
  const items: { kind: 'wallpaper' | 'membership'; id: string; data: unknown; deleted: boolean }[] = [];
  const rec = store.state.records[recordKey('wallpaper', wallpaperId)];
  if (rec) items.push({ kind: 'wallpaper', id: wallpaperId, data: rec.data, deleted: true });
  for (const m of getMemberships(store.state).filter((m) => m.wallpaperId === wallpaperId)) {
    items.push({ kind: 'membership', id: membershipId(m.groupId, m.wallpaperId), data: m, deleted: true });
  }
  if (items.length) store.putMany(items);
}

export function createGroup(store: Store, name: string): Group {
  const clean = name.trim();
  if (!clean) throw new Error('Group name is empty.');
  if (clean.toLowerCase() === 'all') throw new Error('"All" is the default group.');
  const dup = getGroups(store.state).find((g) => g.name.toLowerCase() === clean.toLowerCase());
  if (dup) return dup;
  const g: Group = { id: uid(), name: clean };
  store.put('group', g.id, g);
  return g;
}

export function renameGroup(store: Store, groupId: string, name: string): void {
  const g = getGroups(store.state).find((x) => x.id === groupId);
  if (!g || !name.trim()) return;
  store.put('group', groupId, { ...g, name: name.trim() });
}

export function deleteGroup(store: Store, groupId: string): void {
  const g = getGroups(store.state).find((x) => x.id === groupId);
  if (!g) return;
  const items: any[] = [{ kind: 'group', id: groupId, data: g, deleted: true }];
  for (const m of getMemberships(store.state).filter((m) => m.groupId === groupId)) {
    items.push({ kind: 'membership', id: membershipId(m.groupId, m.wallpaperId), data: m, deleted: true });
  }
  // Devices pointing at this group fall back to "All".
  for (const r of Object.values(store.state.records)) {
    if (r.kind === 'deviceSettings' && !r.deleted && (r.data as DeviceSettings).activeGroupId === groupId) {
      items.push({ kind: 'deviceSettings', id: r.id, data: { ...r.data, activeGroupId: ALL_GROUP_ID } });
    }
  }
  store.putMany(items);
}

/** Add to a group. The wallpaper is saved to the library (All) first if needed. */
export function addToGroup(store: Store, w: Wallpaper, groupId: string): void {
  saveToLibrary(store, w);
  if (groupId === ALL_GROUP_ID) return;
  const id = membershipId(groupId, w.id);
  const rec = store.state.records[recordKey('membership', id)];
  if (rec && !rec.deleted) return;
  store.put('membership', id, { groupId, wallpaperId: w.id });
}

export function removeFromGroup(store: Store, wallpaperId: string, groupId: string): void {
  if (groupId === ALL_GROUP_ID) return removeFromLibrary(store, wallpaperId);
  const id = membershipId(groupId, wallpaperId);
  store.put('membership', id, { groupId, wallpaperId }, true);
}

export function updateDeviceSettings(store: Store, deviceId: string, patch: Partial<DeviceSettings>): void {
  const rec = store.state.records[recordKey('deviceSettings', deviceId)];
  if (!rec) return;
  store.put('deviceSettings', deviceId, { ...(rec.data as DeviceSettings), ...patch });
}

// ---------- sources ----------

/** Persist secret options (apiKey) locally; everything else is synced. */
function splitOptions(type: SourceType, options: Record<string, string>) {
  const secretKeys = new Set((SOURCE_TYPE_HELP[type]?.fields ?? []).filter((f) => f.secret).map((f) => f.key));
  const pub: Record<string, string> = {};
  const secret: Record<string, string> = {};
  for (const [k, v] of Object.entries(options)) (secretKeys.has(k) ? secret : pub)[k] = v;
  return { pub, secret };
}

export function addCustomSource(
  store: Store,
  input: { name: string; type: SourceType; categories: string[]; options: Record<string, string> },
): SourceConfig {
  const missing = (SOURCE_TYPE_HELP[input.type]?.fields ?? []).filter((f) => f.required && !input.options[f.key]?.trim());
  if (!input.name.trim()) throw new Error('Give the source a name.');
  if (missing.length) throw new Error(`Missing: ${missing.map((m) => m.label).join(', ')}`);
  const { pub, secret } = splitOptions(input.type, input.options);
  const id = 'custom-' + uid();
  const src: SourceConfig = { id, name: input.name.trim(), type: input.type, builtin: false, enabled: true, categories: input.categories, options: pub };
  store.put('source', id, src);
  if (Object.keys(secret).length) store.setLocal({ secrets: { ...store.state.local.secrets, [id]: secret } });
  return src;
}

export function setSourceEnabled(store: Store, sourceId: string, enabled: boolean): void {
  const src = getSources(store.state).find((s) => s.id === sourceId);
  if (!src) return;
  const rec = store.state.records[recordKey('source', sourceId)];
  const data = rec && !rec.deleted ? { ...(rec.data as object), enabled } : src.builtin ? { enabled } : { ...src, enabled };
  store.put('source', sourceId, data);
}

/** Update options. Secrets (API keys) stay on this device only. */
export function updateSourceOptions(store: Store, sourceId: string, options: Record<string, string>): void {
  const src = getSources(store.state).find((s) => s.id === sourceId);
  if (!src) return;
  const { pub, secret } = splitOptions(src.type, options);
  const rec = store.state.records[recordKey('source', sourceId)];
  const base = rec && !rec.deleted ? (rec.data as any) : src.builtin ? {} : src;
  const cleanPub = { ...(base.options ?? {}), ...pub };
  store.put('source', sourceId, { ...base, options: cleanPub });
  store.setLocal({ secrets: { ...store.state.local.secrets, [sourceId]: { ...(store.state.local.secrets[sourceId] ?? {}), ...secret } } });
}

/** Built-in sources cannot be removed, only disabled. */
export function removeCustomSource(store: Store, sourceId: string): void {
  const src = getSources(store.state).find((s) => s.id === sourceId);
  if (!src || src.builtin) return;
  const rec = store.state.records[recordKey('source', sourceId)];
  if (rec) store.put('source', sourceId, rec.data, true);
}

export { getLibrary };
