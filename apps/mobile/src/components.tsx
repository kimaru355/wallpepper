import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, type ImageStyle } from 'react-native';
import {
  addToGroup,
  ALL_GROUP_ID,
  applyWallpaper,
  createGroup,
  downloadWallpaper,
  FIT_MODES,
  getDeviceSettings,
  getGroupPath,
  getGroupTree,
  getWallpaperGroupIds,
  isSaved,
  removeFromGroup,
  updateDeviceSettings,
  type DeviceSettings,
  type Wallpaper,
  type WallpaperTarget,
} from '@wallpepper/core';
import { getCtx, toast, useAppState } from './ctx';
import { CachedImage } from './CachedImage';
import { startCompat, openCompat } from './compat';
import { useInsets } from './insets';
import { platform } from './platform';
import { Btn, colors, Field, Icon, IconBtn, Segmented, Select, Sheet, Toggle, text } from './ui';

export { CachedImage };

export async function doSet(w: Wallpaper, target?: WallpaperTarget) {
  const { store } = getCtx();
  try {
    const r = await applyWallpaper(store, platform, w, target);
    toast(r === 'applied' ? 'Wallpaper set' : 'Saved to your Wallpepper albums');
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
        <CachedImage uri={w.thumb} style={StyleSheet.absoluteFill as ImageStyle} />
      </Pressable>
      {saved && (
        <View style={t.star}>
          <Icon name="star" size={16} color="#ffd24a" />
        </View>
      )}
      <View style={t.actions}>
        <IconBtn name="download" label="Download" onPress={() => doDownload(w)} />
        <IconBtn name="folderPlus" label="Add to group" onPress={onGroup} />
      </View>
    </View>
  );
}

export function PreviewModal({ w, onClose, onGroup }: { w: Wallpaper | null; onClose: () => void; onGroup: () => void }) {
  const state = useAppState();
  const insets = useInsets();
  if (!w) return null;
  const folderMode = getDeviceSettings(state).mode === 'folder';
  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={{ flex: 1, backgroundColor: '#000', paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <View style={{ flex: 1 }}>
          {/* thumbnail first (usually cached), then the full image on top of it */}
          <CachedImage uri={w.thumb} style={StyleSheet.absoluteFill as ImageStyle} resizeMode="contain" />
          <CachedImage uri={w.url} style={StyleSheet.absoluteFill as ImageStyle} resizeMode="contain" />
          <IconBtn name="close" label="Close" onPress={onClose} size={20} style={{ position: 'absolute', top: 10, right: 12 }} />
        </View>
        <View style={t.bar}>
          {folderMode ? (
            <Btn title="Save to folder" kind="primary" icon="download" onPress={() => doSet(w)} style={{ flex: 1 }} />
          ) : (
            <>
              <Btn title="Home" kind="primary" onPress={() => doSet(w, 'home')} style={{ flex: 1 }} />
              <Btn title="Lock" kind="primary" onPress={() => doSet(w, 'lock')} style={{ flex: 1 }} />
              <Btn title="Both" kind="primary" onPress={() => doSet(w, 'both')} style={{ flex: 1 }} />
            </>
          )}
        </View>
        {isSaved(state, w.id) && (
          <View style={[t.bar, { paddingTop: 0 }]}>
            <Btn title="Check compatibility" icon="sliders" onPress={() => openCompat(w)} style={{ flex: 1 }} />
          </View>
        )}
        <View style={[t.bar, { paddingTop: 0 }]}>
          <Btn title="Download" icon="download" onPress={() => doDownload(w)} style={{ flex: 1 }} />
          <Btn title="Group" icon="folderPlus" onPress={onGroup} style={{ flex: 1 }} />
          <Btn title="Close" icon="close" onPress={onClose} style={{ flex: 1 }} />
        </View>
      </View>
    </Modal>
  );
}

/** "Add to group": tick groups (sub-groups are indented), or create a new group / sub-group. */
export function GroupSheet({ w, onClose }: { w: Wallpaper | null; onClose: () => void }) {
  const state = useAppState();
  const { store } = getCtx();
  const [name, setName] = useState('');
  const [parent, setParent] = useState('');
  if (!w) return null;
  const memberOf = new Set(getWallpaperGroupIds(state, w.id));
  const saved = isSaved(state, w.id);
  const toggle = (id: string, on: boolean) => {
    if (on) return removeFromGroup(store, w.id, id);
    addToGroup(store, w, id);
    void startCompat(w);
  };
  const create = () => {
    try {
      const g = createGroup(store, name, { parentId: parent || undefined });
      addToGroup(store, w, g.id);
      setName('');
      toast(`Added to "${getGroupPath(store.state, g.id).join(' › ')}"`);
      void startCompat(w);
    } catch (e: any) {
      toast(e.message);
    }
  };
  const row = (id: string, label: string, on: boolean, depth = 0) => (
    <Pressable key={id} style={[t.row, { paddingLeft: depth * 18 }]} onPress={() => toggle(id, on)}>
      <View style={[t.box, on && { backgroundColor: colors.accent, borderColor: colors.accent }]}>{on ? <Icon name="check" size={14} color="#fff" /> : null}</View>
      <Text style={{ color: on ? colors.accent : colors.text, fontSize: 16 }}>{label}</Text>
    </Pressable>
  );
  return (
    <Sheet visible onClose={onClose} title="Add to group">
      {row(ALL_GROUP_ID, 'All (library)', saved)}
      {getGroupTree(state).map(({ group, depth }) => row(group.id, group.name, memberOf.has(group.id), depth))}
      <View style={{ marginTop: 14 }}>
        <Select label="New group goes in" value={parent} options={groupOptions(state, 'Top level')} onChange={setParent} />
        <Field label="New group" value={name} onChangeText={setName} placeholder="e.g. Naruto" onSubmitEditing={() => name.trim() && create()} autoCapitalize="sentences" />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Btn title="Create & add" kind="primary" icon="plus" disabled={!name.trim()} onPress={create} style={{ flex: 1 }} />
          <Btn title="Done" onPress={onClose} style={{ flex: 1 }} />
        </View>
      </View>
    </Sheet>
  );
}

/** Options for a group picker. Sub-groups show their path ("Anime › Naruto"). `root` is the label of the top entry (value ''), or 'All'. */
export function groupOptions(state: ReturnType<typeof useAppState>, root?: string) {
  const top = root === undefined ? { value: ALL_GROUP_ID, label: 'All' } : { value: '', label: root };
  return [top, ...getGroupTree(state).map(({ group }) => ({ value: group.id, label: getGroupPath(state, group.id).join(' › ') }))];
}

/** Edits the settings of any device in the account (they sync). */
export function DeviceSettingsForm({ deviceId }: { deviceId: string }) {
  const state = useAppState();
  const { store } = getCtx();
  const s = getDeviceSettings(state, deviceId);
  if (!s) return null;
  const set = (patch: Partial<DeviceSettings>) => updateDeviceSettings(store, deviceId, patch);
  const mobile = s.platform === 'android' || s.platform === 'ios';
  const fits = FIT_MODES.filter((f) => !(mobile && f.desktopOnly));
  const fit = fits.find((f) => f.id === (s.fit ?? 'fill')) ?? fits[0];
  return (
    <View>
      <Field label="Device name" value={s.name} onChangeText={(v) => set({ name: v })} autoCapitalize="sentences" />
      <Select label="Wallpaper group (theme)" value={s.activeGroupId} options={groupOptions(state)} onChange={(v) => set({ activeGroupId: v })} />
      <Text style={text.small}>Who changes the wallpaper</Text>
      <View style={{ marginVertical: 6 }}>
        <Segmented
          value={s.mode}
          options={[{ value: 'apply', label: 'Wallpepper (recommended)' }, { value: 'folder', label: mobile ? 'My phone / gallery' : 'My system' }]}
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
          <Text style={[text.small, { marginTop: 6 }]}>Fit</Text>
          <View style={{ marginVertical: 6 }}>
            <Segmented value={fit.id} options={fits.map((f) => ({ value: f.id, label: f.label }))} onChange={(v) => set({ fit: v })} />
            <Text style={[text.small, { marginTop: 6 }]}>{fit.hint}</Text>
          </View>
        </>
      )}
      <Toggle
        label="Switch wallpaper automatically"
        hint={s.mode === 'folder' ? 'Your phone rotates the albums; Wallpepper keeps them filled.' : undefined}
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
  star: { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(14,15,19,.6)', borderRadius: 12, padding: 4 },
  actions: { position: 'absolute', bottom: 6, right: 6, flexDirection: 'row', gap: 6 },
  bar: { flexDirection: 'row', gap: 8, padding: 12, backgroundColor: colors.bg },
  row: { paddingVertical: 12, borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 12 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.muted, alignItems: 'center', justifyContent: 'center' },
});
