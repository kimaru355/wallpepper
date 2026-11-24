import { useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  addToGroup,
  ALL_GROUP_ID,
  applyWallpaper,
  createGroup,
  downloadWallpaper,
  getDeviceSettings,
  getGroups,
  getWallpaperGroupIds,
  isSaved,
  removeFromGroup,
  updateDeviceSettings,
  type DeviceSettings,
  type Wallpaper,
  type WallpaperTarget,
} from '@wallpepper/core';
import { getCtx, toast, useAppState } from './ctx';
import { platform } from './platform';
import { Btn, colors, Field, Segmented, Select, Sheet, Toggle, text } from './ui';

export async function doSet(w: Wallpaper, target?: WallpaperTarget) {
  const { store } = getCtx();
  try {
    const r = await applyWallpaper(store, platform, w, target);
    toast(r === 'applied' ? 'Wallpaper set' : 'Saved to Pictures/Wallpepper');
  } catch (e: any) {
    toast(e?.message ?? 'Could not set wallpaper');
  }
}

export async function doDownload(w: Wallpaper) {
  const { store } = getCtx();
  try {
    await downloadWallpaper(store, platform, w);
    toast('Saved to Pictures/Wallpepper');
  } catch (e: any) {
    toast(e?.message ?? 'Download failed');
  }
}

/** Grid tile with quick actions. */
export function Tile({ w, width, onOpen, onGroup }: { w: Wallpaper; width: number; onOpen: () => void; onGroup: () => void }) {
  const state = useAppState();
  const saved = isSaved(state, w.id);
  return (
    <View style={{ width, aspectRatio: 9 / 16, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.panel }}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onOpen}>
        <Image source={{ uri: w.thumb }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      </Pressable>
      {saved && <Text style={t.star}>★</Text>}
      <View style={t.actions}>
        <Pressable style={t.act} onPress={() => doDownload(w)}><Text style={t.actText}>⬇</Text></Pressable>
        <Pressable style={t.act} onPress={onGroup}><Text style={t.actText}>＋</Text></Pressable>
      </View>
    </View>
  );
}

export function PreviewModal({ w, onClose, onGroup }: { w: Wallpaper | null; onClose: () => void; onGroup: () => void }) {
  const state = useAppState();
  if (!w) return null;
  const folderMode = getDeviceSettings(state).mode === 'folder';
  return (
    <Modal visible animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <Image source={{ uri: w.url }} defaultSource={undefined} style={{ flex: 1 }} resizeMode="contain" />
        <View style={t.bar}>
          {folderMode ? (
            <Btn title="Save to folder" kind="primary" onPress={() => doSet(w)} style={{ flex: 1 }} />
          ) : (
            <>
              <Btn title="Home" kind="primary" onPress={() => doSet(w, 'home')} style={{ flex: 1 }} />
              <Btn title="Lock" kind="primary" onPress={() => doSet(w, 'lock')} style={{ flex: 1 }} />
              <Btn title="Both" kind="primary" onPress={() => doSet(w, 'both')} style={{ flex: 1 }} />
            </>
          )}
        </View>
        <View style={[t.bar, { paddingTop: 0 }]}>
          <Btn title="⬇ Download" onPress={() => doDownload(w)} style={{ flex: 1 }} />
          <Btn title="＋ Group" onPress={onGroup} style={{ flex: 1 }} />
          <Btn title="Close" onPress={onClose} style={{ flex: 1 }} />
        </View>
      </View>
    </Modal>
  );
}

export function GroupSheet({ w, onClose }: { w: Wallpaper | null; onClose: () => void }) {
  const state = useAppState();
  const { store } = getCtx();
  const [name, setName] = useState('');
  if (!w) return null;
  const memberOf = new Set(getWallpaperGroupIds(state, w.id));
  const saved = isSaved(state, w.id);
  const toggle = (id: string, on: boolean) => (on ? removeFromGroup(store, w.id, id) : addToGroup(store, w, id));
  const create = () => {
    try {
      const g = createGroup(store, name);
      addToGroup(store, w, g.id);
      setName('');
      toast(`Added to "${g.name}"`);
    } catch (e: any) {
      toast(e.message);
    }
  };
  const row = (id: string, label: string, on: boolean) => (
    <Pressable key={id} style={t.row} onPress={() => toggle(id, on)}>
      <Text style={{ color: on ? colors.accent : colors.text, fontSize: 16 }}>{on ? '☑ ' : '☐ '}{label}</Text>
    </Pressable>
  );
  return (
    <Sheet visible onClose={onClose} title="Add to group">
      {row(ALL_GROUP_ID, 'All (library)', saved)}
      {getGroups(state).map((g) => row(g.id, g.name, memberOf.has(g.id)))}
      <View style={{ marginTop: 14 }}>
        <Field label="New group" value={name} onChangeText={setName} placeholder="e.g. anime" onSubmitEditing={() => name.trim() && create()} autoCapitalize="sentences" />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Btn title="Create & add" kind="primary" disabled={!name.trim()} onPress={create} style={{ flex: 1 }} />
          <Btn title="Done" onPress={onClose} style={{ flex: 1 }} />
        </View>
      </View>
    </Sheet>
  );
}

export function groupOptions(state: ReturnType<typeof useAppState>) {
  return [{ value: ALL_GROUP_ID, label: 'All' }, ...getGroups(state).map((g) => ({ value: g.id, label: g.name }))];
}

/** Edits the settings of any device in the account (they sync). */
export function DeviceSettingsForm({ deviceId }: { deviceId: string }) {
  const state = useAppState();
  const { store } = getCtx();
  const s = getDeviceSettings(state, deviceId);
  if (!s) return null;
  const set = (patch: Partial<DeviceSettings>) => updateDeviceSettings(store, deviceId, patch);
  const mobile = s.platform === 'android' || s.platform === 'ios';
  return (
    <View>
      <Field label="Device name" value={s.name} onChangeText={(v) => set({ name: v })} autoCapitalize="sentences" />
      <Select label="Wallpaper group (theme)" value={s.activeGroupId} options={groupOptions(state)} onChange={(v) => set({ activeGroupId: v })} />
      <Text style={text.small}>When setting a wallpaper</Text>
      <View style={{ marginVertical: 6 }}>
        <Segmented
          value={s.mode}
          options={[{ value: 'apply', label: 'App sets it' }, { value: 'folder', label: 'Download to folder' }]}
          onChange={(v) => set({ mode: v })}
        />
      </View>
      {s.mode === 'apply' && (
        <>
          <Text style={[text.small, { marginTop: 6 }]}>Apply to</Text>
          <View style={{ marginVertical: 6 }}>
            <Segmented
              value={s.target}
              options={[
                { value: 'both', label: mobile ? 'Home + lock' : 'Desktop + lock' },
                { value: 'home', label: mobile ? 'Home' : 'Desktop' },
                { value: 'lock', label: 'Lock' },
              ]}
              onChange={(v) => set({ target: v })}
            />
          </View>
        </>
      )}
      <Toggle
        label="Switch wallpaper automatically"
        hint={s.mode === 'folder' ? 'Folder mode: the OS rotates, Wallpepper keeps the folder filled.' : undefined}
        value={s.rotationEnabled}
        onChange={(v) => set({ rotationEnabled: v })}
      />
      {s.rotationEnabled && s.mode === 'apply' && (
        <>
          <Select
            label="Every"
            value={String(s.rotationMinutes)}
            options={[15, 30, 60, 180, 360, 720, 1440].map((m) => ({ value: String(m), label: m >= 60 ? `${m / 60} h` : `${m} min` }))}
            onChange={(v) => set({ rotationMinutes: Number(v) })}
          />
          <Select
            label="Order"
            value={s.rotationOrder}
            options={[{ value: 'shuffle', label: 'Shuffle' }, { value: 'sequential', label: 'In order' }]}
            onChange={(v) => set({ rotationOrder: v as DeviceSettings['rotationOrder'] })}
          />
        </>
      )}
      <Toggle label="Sync this device with the account" value={s.syncEnabled} onChange={(v) => set({ syncEnabled: v })} />
    </View>
  );
}

const t = StyleSheet.create({
  star: { position: 'absolute', top: 6, right: 8, color: '#ffd24a', fontSize: 16 },
  actions: { position: 'absolute', bottom: 6, right: 6, flexDirection: 'row', gap: 6 },
  act: { backgroundColor: 'rgba(14,15,19,.8)', borderRadius: 16, width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  actText: { color: '#fff', fontSize: 15 },
  bar: { flexDirection: 'row', gap: 8, padding: 12, backgroundColor: colors.bg },
  row: { paddingVertical: 12, borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth },
});
