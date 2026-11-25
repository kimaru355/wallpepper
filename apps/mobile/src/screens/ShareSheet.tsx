import { useState } from 'react';
import { Text, View } from 'react-native';
import { buildCollection, CATEGORIES, getGroups, getGroupPath, getGroupTree, getGroupWallpapers, type CategoryId } from '@wallpepper/core';
import { getCtx, toast, useAppState } from '../ctx';
import { Btn, Chip, Field, Select, Sheet, text } from '../ui';

/** Share one of your groups (with its sub-groups) with the community. */
export function ShareSheet({ groupId, onClose, onDone }: { groupId?: string; onClose: () => void; onDone?: () => void }) {
  const state = useAppState();
  const { sync, store } = getCtx();
  const username = state.local.auth?.username;
  const groups = getGroupTree(state);
  const [gid, setGid] = useState(groupId ?? groups[0]?.group.id ?? '');
  const g = getGroups(state).find((x) => x.id === gid);
  const [name, setName] = useState(g?.name ?? '');
  const [category, setCategory] = useState<CategoryId>(g?.category ?? 'anime');
  const [description, setDescription] = useState('');
  const [newUser, setNewUser] = useState('');
  const [busy, setBusy] = useState(false);

  const pick = (id: string) => {
    setGid(id);
    const x = getGroups(store.state).find((y) => y.id === id);
    if (x) {
      setName(x.name);
      if (x.category) setCategory(x.category);
    }
  };

  const saveUsername = async () => {
    setBusy(true);
    try {
      await sync.setUsername(newUser.trim());
      toast('Username saved');
    } catch (e: any) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    if (!g) return;
    setBusy(true);
    try {
      await sync.communityPublish({ sourceGroupId: g.id, name: name.trim(), category, description: description.trim(), payload: buildCollection(store, g.id) });
      toast('Shared with the community');
      onDone?.();
      onClose();
    } catch (e: any) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!state.local.auth) {
    return (
      <Sheet visible onClose={onClose} title="Share with the community">
        <Text style={text.muted}>Sign in (Devices tab) to share groups.</Text>
      </Sheet>
    );
  }
  if (!username) {
    return (
      <Sheet visible onClose={onClose} title="Choose a username">
        <Text style={[text.muted, { marginBottom: 12 }]}>Your username is shown next to the collections you share.</Text>
        <Field label="Username" value={newUser} onChangeText={setNewUser} placeholder="e.g. naruto_fan" maxLength={20} />
        <Btn title="Save username" kind="primary" disabled={busy || !/^[A-Za-z0-9_]{3,20}$/.test(newUser.trim())} onPress={saveUsername} />
      </Sheet>
    );
  }
  const count = g ? getGroupWallpapers(state, g.id).length : 0;
  return (
    <Sheet visible onClose={onClose} title="Share with the community">
      {!groups.length ? (
        <Text style={text.muted}>Create a group and add some wallpapers first.</Text>
      ) : (
        <>
          <Select label="Group to share" value={gid} options={groups.map(({ group }) => ({ value: group.id, label: getGroupPath(state, group.id).join(' › ') }))} onChange={pick} />
          <Text style={[text.small, { marginTop: -4, marginBottom: 10 }]}>Includes its sub-groups · {count} wallpapers · shared as @{username}</Text>
          <Field label="Collection name" value={name} onChangeText={setName} autoCapitalize="sentences" maxLength={60} />
          <Text style={[text.small, { marginBottom: 6 }]}>Category (so people can find it)</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {CATEGORIES.map((c) => (
              <Chip key={c.id} label={c.label} on={category === c.id} onPress={() => setCategory(c.id)} />
            ))}
          </View>
          <Field label="Description (optional)" value={description} onChangeText={setDescription} autoCapitalize="sentences" maxLength={300} multiline />
          <Btn title="Share" kind="primary" icon="upload" disabled={busy || !name.trim() || !count} onPress={publish} />
        </>
      )}
    </Sheet>
  );
}
