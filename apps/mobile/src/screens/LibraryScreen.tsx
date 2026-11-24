import { useState } from 'react';
import { Alert, FlatList, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import {
  ALL_GROUP_ID,
  createGroup,
  deleteGroup,
  getDeviceSettings,
  getGroupCounts,
  getGroups,
  getGroupWallpapers,
  renameGroup,
  rotateNow,
  updateDeviceSettings,
  type Wallpaper,
} from '@wallpepper/core';
import { GroupSheet, PreviewModal, Tile } from '../components';
import { getCtx, toast, useAppState } from '../ctx';
import { platform } from '../platform';
import { Btn, Chip, Field, Sheet, text } from '../ui';

export function LibraryScreen() {
  const state = useAppState();
  const { store } = getCtx();
  const { width } = useWindowDimensions();
  const [groupId, setGroupId] = useState(ALL_GROUP_ID);
  const [preview, setPreview] = useState<Wallpaper | null>(null);
  const [grouping, setGrouping] = useState<Wallpaper | null>(null);
  const [editing, setEditing] = useState<'new' | 'rename' | null>(null);
  const [name, setName] = useState('');
  const tile = (width - 16 * 2 - 10) / 2;

  const groups = getGroups(state);
  const counts = getGroupCounts(state);
  const current = groupId === ALL_GROUP_ID || groups.some((g) => g.id === groupId) ? groupId : ALL_GROUP_ID;
  const group = groups.find((g) => g.id === current);
  const items = getGroupWallpapers(state, current);
  const active = getDeviceSettings(state).activeGroupId === current;

  const submit = () => {
    try {
      if (editing === 'new') setGroupId(createGroup(store, name).id);
      else if (group) renameGroup(store, group.id, name);
      setEditing(null);
      setName('');
    } catch (e: any) {
      toast(e.message);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 10 }}>
          <Chip label={`All · ${counts[ALL_GROUP_ID] ?? 0}`} bold on={current === ALL_GROUP_ID} onPress={() => setGroupId(ALL_GROUP_ID)} />
          {groups.map((g) => (
            <Chip key={g.id} label={`${g.name} · ${counts[g.id] ?? 0}`} on={current === g.id} onPress={() => setGroupId(g.id)} />
          ))}
          <Chip label="＋ New group" onPress={() => { setName(''); setEditing('new'); }} />
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <Btn
            title={active ? '✓ Used on this device' : 'Use on this device'}
            kind={active ? undefined : 'primary'}
            disabled={active}
            onPress={() => { updateDeviceSettings(store, store.state.local.deviceId, { activeGroupId: current }); toast('This device now uses this group'); }}
          />
          <Btn title="Next" disabled={!items.length} onPress={() => rotateNow(store, platform).then((w) => toast(w ? 'Wallpaper changed' : 'Nothing to show')).catch((e) => toast(e.message))} />
          {group && <Btn title="Rename" onPress={() => { setName(group.name); setEditing('rename'); }} />}
          {group && (
            <Btn title="Delete" kind="danger" onPress={() => Alert.alert('Delete group', `Delete "${group.name}"? Wallpapers stay in All.`, [{ text: 'Cancel' }, { text: 'Delete', style: 'destructive', onPress: () => deleteGroup(store, group.id) }])} />
          )}
        </View>
      </View>

      <FlatList
        data={items}
        keyExtractor={(w) => w.id}
        numColumns={2}
        columnWrapperStyle={{ gap: 10, paddingHorizontal: 16 }}
        contentContainerStyle={{ gap: 10, paddingBottom: 24 }}
        renderItem={({ item }) => <Tile w={item} width={tile} onOpen={() => setPreview(item)} onGroup={() => setGrouping(item)} />}
        ListEmptyComponent={
          <Text style={[text.muted, { textAlign: 'center', padding: 40 }]}>
            {current === ALL_GROUP_ID ? 'Nothing here yet. Download a wallpaper or add one to a group from Browse.' : 'This group is empty. Use ＋ on any wallpaper to add it.'}
          </Text>
        }
      />
      <PreviewModal w={preview} onClose={() => setPreview(null)} onGroup={() => setGrouping(preview)} />
      <GroupSheet w={grouping} onClose={() => setGrouping(null)} />
      <Sheet visible={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'New group' : 'Rename group'}>
        <Field label="Name" value={name} onChangeText={setName} autoCapitalize="sentences" autoFocus onSubmitEditing={submit} />
        <Btn title="Save" kind="primary" disabled={!name.trim()} onPress={submit} />
      </Sheet>
    </View>
  );
}

