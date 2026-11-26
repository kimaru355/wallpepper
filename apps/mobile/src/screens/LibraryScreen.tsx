import { useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import {
  ALL_GROUP_ID,
  createGroup,
  deleteGroup,
  ensureDimensions,
  folderForGroup,
  getDeviceSettings,
  getGroupCounts,
  getGroupPath,
  getGroups,
  getGroupWallpapers,
  needsCompat,
  renameGroup,
  shapeOf,
  rotateNow,
  updateDeviceSettings,
  type Group,
  type Wallpaper,
} from '@wallpepper/core';
import { openCompat } from '../compat';
import { albumName, probeImage } from '../platform';
import { GroupSheet, PreviewModal, Tile } from '../components';
import { getCtx, toast, useAppState } from '../ctx';
import { platform } from '../platform';
import { Btn, Chip, colors, Field, Icon, Sheet, text } from '../ui';
import { ShareSheet } from './ShareSheet';

export function LibraryScreen() {
  const state = useAppState();
  const { store } = getCtx();
  const { width } = useWindowDimensions();
  const [groupId, setGroupId] = useState(ALL_GROUP_ID);
  const [preview, setPreview] = useState<Wallpaper | null>(null);
  const [grouping, setGrouping] = useState<Wallpaper | null>(null);
  const [editing, setEditing] = useState<'new' | 'sub' | 'rename' | null>(null);
  const [sharing, setSharing] = useState(false);
  const [name, setName] = useState('');
  const [fixing, setFixing] = useState(false);
  const tile = (width - 16 * 2 - 10) / 2;

  const groups = getGroups(state);
  const counts = getGroupCounts(state);
  const group = groups.find((g) => g.id === groupId);
  const current = group ? group.id : ALL_GROUP_ID;
  const items = getGroupWallpapers(state, current);
  const settings = getDeviceSettings(state);
  const active = settings.activeGroupId === current;

  // One row of chips per level: top level groups, then the sub-groups of the selected group, and so on.
  const trail: (Group | null)[] = [null];
  for (const g of group ? getGroupPath(state, group.id) : []) {
    const parent = trail[trail.length - 1];
    const next = groups.find((x) => (x.parentId ?? null) === (parent?.id ?? null) && x.name === g);
    if (next) trail.push(next);
  }
  const rows = trail.map((parent) => ({ parent, kids: groups.filter((g) => (g.parentId ?? null) === (parent?.id ?? null)) }));

  const submit = () => {
    try {
      if (editing === 'new') setGroupId(createGroup(store, name).id);
      else if (editing === 'sub' && group) setGroupId(createGroup(store, name, { parentId: group.id, category: group.category }).id);
      else if (group) renameGroup(store, group.id, name);
      setEditing(null);
      setName('');
    } catch (e: any) {
      toast(e.message);
    }
  };

  const path = group ? getGroupPath(state, group.id) : [];
  const pending = needsCompat(state, getGroupWallpapers(state, ALL_GROUP_ID));
  const albumHint = settings.mode === 'folder' ? `Pick the album “${albumName(folderForGroup(state, current))}” in your gallery.` : null;

  if (fixing) return <FixCompat onBack={() => setFixing(false)} />;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
        {pending.length > 0 && (
          <Pressable
            onPress={() => setFixing(true)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, marginBottom: 8, borderRadius: 12, backgroundColor: colors.panel, borderColor: colors.warn, borderWidth: 1 }}
          >
            <Icon name="sliders" size={18} color={colors.warn} />
            <Text style={{ color: colors.text, flex: 1 }}>
              {pending.length} wallpaper{pending.length === 1 ? ' has' : 's have'} no version for the other screen shape yet. Tap to review & fix.
            </Text>
            <Icon name="chevronRight" size={18} color={colors.muted} />
          </Pressable>
        )}
        {rows.map(({ parent, kids }, level) => (
          <ScrollView key={parent?.id ?? 'root'} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 8 }}>
            {level === 0 && <Chip label={`All · ${counts[ALL_GROUP_ID] ?? 0}`} bold on={current === ALL_GROUP_ID} onPress={() => setGroupId(ALL_GROUP_ID)} />}
            {level > 0 && parent && <Chip label={`All ${parent.name} · ${counts[parent.id] ?? 0}`} icon="layers" on={current === parent.id} onPress={() => setGroupId(parent.id)} />}
            {kids.map((g) => (
              <Chip key={g.id} label={`${g.name} · ${counts[g.id] ?? 0}`} on={trail.some((t) => t?.id === g.id)} onPress={() => setGroupId(g.id)} />
            ))}
            <Chip
              label={level === 0 ? 'New group' : 'New sub-group'}
              icon="plus"
              onPress={() => {
                setName('');
                if (level === 0) setEditing('new');
                else { setGroupId(parent!.id); setEditing('sub'); }
              }}
            />
          </ScrollView>
        ))}
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
          <Btn
            title={active ? 'Used on this device' : 'Use on this device'}
            icon={active ? 'check' : undefined}
            kind={active ? undefined : 'primary'}
            disabled={active}
            onPress={() => { updateDeviceSettings(store, store.state.local.deviceId, { activeGroupId: current }); toast('This device now uses this group'); }}
          />
          <Btn title="Next" icon="refresh" disabled={!items.length} onPress={() => rotateNow(store, platform).then((w) => toast(w ? 'Wallpaper changed' : 'Nothing to show')).catch((e) => toast(e.message))} />
          {group && <Btn title="Sub-group" icon="folderPlus" onPress={() => { setName(''); setEditing('sub'); }} />}
          {group && <Btn title="Share" icon="upload" onPress={() => setSharing(true)} />}
          {group && <Btn title="Rename" icon="edit" onPress={() => { setName(group.name); setEditing('rename'); }} />}
          {group && (
            <Btn
              title="Delete"
              icon="trash"
              kind="danger"
              onPress={() => {
                const subs = groups.filter((g) => getGroupPath(state, g.id).slice(0, path.length).join('/') === path.join('/') && g.id !== group.id).length;
                Alert.alert('Delete group', `Delete "${group.name}"${subs ? ` and its ${subs} sub-group${subs === 1 ? '' : 's'}` : ''}? Wallpapers stay in All.`, [
                  { text: 'Cancel' },
                  { text: 'Delete', style: 'destructive', onPress: () => { deleteGroup(store, group.id); setGroupId(group.parentId ?? ALL_GROUP_ID); } },
                ]);
              }}
            />
          )}
        </View>
        {albumHint ? <Text style={[text.small, { marginBottom: 6 }]}>{albumHint}</Text> : null}
        {group && <Text style={[text.small, { marginBottom: 6 }]}>{path.join(' › ')} · includes its sub-groups</Text>}
      </View>

      <FlatList
        data={items}
        keyExtractor={(w) => w.id}
        numColumns={2}
        columnWrapperStyle={{ gap: 10, paddingHorizontal: 16 }}
        contentContainerStyle={{ gap: 10, paddingBottom: 24 }}
        renderItem={({ item }) => <Tile w={item} width={tile} asOnDevice onOpen={() => setPreview(item)} onGroup={() => setGrouping(item)} />}
        ListEmptyComponent={
          <Text style={[text.muted, { textAlign: 'center', padding: 40 }]}>
            {current === ALL_GROUP_ID ? 'Nothing here yet. Download a wallpaper or add one to a group from Browse.' : 'This group is empty. Use the group button on any wallpaper to add it.'}
          </Text>
        }
      />
      <PreviewModal w={preview} onClose={() => setPreview(null)} onGroup={() => setGrouping(preview)} />
      <GroupSheet w={grouping} onClose={() => setGrouping(null)} />
      {sharing && group && <ShareSheet groupId={group.id} onClose={() => setSharing(false)} />}
      <Sheet visible={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'New group' : editing === 'sub' ? `New sub-group in “${group?.name}”` : 'Rename group'}>
        <Field label="Name" value={name} onChangeText={setName} autoCapitalize="sentences" autoFocus onSubmitEditing={submit} />
        <Btn title="Save" kind="primary" disabled={!name.trim()} onPress={submit} />
      </Sheet>
    </View>
  );
}

/** Saved wallpapers without a version for the other orientation, each with a button that opens the compatibility dialog. */
function FixCompat({ onBack }: { onBack: () => void }) {
  const state = useAppState();
  const { store } = getCtx();
  const { width } = useWindowDimensions();
  const items = needsCompat(state, getGroupWallpapers(state, ALL_GROUP_ID));
  const [preview, setPreview] = useState<Wallpaper | null>(null);
  const [grouping, setGrouping] = useState<Wallpaper | null>(null);
  const tile = (width - 16 * 2 - 10) / 2;

  // pictures whose size the source did not send: measure them, square ones then drop off the list
  useEffect(() => {
    for (const w of items) if (shapeOf(w) === 'unknown') void ensureDimensions(store, w.id, probeImage);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Btn title="Library" icon="chevronLeft" onPress={onBack} />
          <Text style={[text.h2, { marginBottom: 0 }]}>Compatibility · {items.length}</Text>
        </View>
        <Text style={[text.small, { marginBottom: 8 }]}>
          These only suit one screen shape. Tap Fix to choose how each looks on the other one: another picture, a crop, or the
          whole picture on a blurred background (used until you choose).
        </Text>
      </View>
      <FlatList
        data={items}
        keyExtractor={(w) => w.id}
        numColumns={2}
        columnWrapperStyle={{ gap: 10, paddingHorizontal: 16 }}
        contentContainerStyle={{ gap: 14, paddingBottom: 24 }}
        renderItem={({ item }) => {
          const shape = shapeOf(item);
          return (
            <View style={{ width: tile, gap: 6 }}>
              <Tile w={item} width={tile} onOpen={() => setPreview(item)} onGroup={() => setGrouping(item)} />
              <Text style={text.small} numberOfLines={1}>
                {shape === 'unknown' ? 'Size not known yet' : `Needs a ${shape === 'portrait' ? 'computer' : 'phone'} version`}
              </Text>
              <Btn title="Fix" icon="sliders" kind="primary" onPress={() => openCompat(item)} />
            </View>
          );
        }}
        ListEmptyComponent={<Text style={[text.muted, { textAlign: 'center', padding: 40 }]}>All set: every wallpaper has a version for phones and for computers.</Text>}
      />
      <PreviewModal w={preview} onClose={() => setPreview(null)} onGroup={() => setGrouping(preview)} />
      <GroupSheet w={grouping} onClose={() => setGrouping(null)} />
    </View>
  );
}
