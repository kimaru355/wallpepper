import { useEffect, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { getAllDevices, type Device } from '@wallpepper/core';
import { AuthForm } from '../AuthForm';
import { DeviceSettingsForm } from '../components';
import { getCtx, toast, useAppState, useSyncStatus } from '../ctx';
import { Btn, Card, Icon, text } from '../ui';

const ICON: Record<string, 'devices' | 'monitor'> = { android: 'devices', ios: 'devices' };

function SignIn() {
  return (
    <Card>
      <Text style={[text.muted, { marginBottom: 12 }]}>An account saves your wallpaper links and groups and syncs them to your other devices.</Text>
      <AuthForm initial="login" />
    </Card>
  );
}

export function AccountScreen() {
  const state = useAppState();
  const { sync, store } = getCtx();
  const status = useSyncStatus();
  const [server, setServer] = useState<Device[]>([]);
  const [open, setOpen] = useState<string | null>(store.state.local.deviceId);
  const auth = state.local.auth;

  useEffect(() => {
    if (auth) {
      sync.listDevices().then(setServer).catch(() => {});
      if (!auth.username) sync.refreshProfile().catch(() => {});
    }
  }, [auth, sync, state.local.lastSyncAt]);

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <Text style={text.h1}>Account & Devices</Text>
      {!auth ? (
        <SignIn />
      ) : (
        <Card>
          <Text style={text.h2}>{auth.username ? `@${auth.username}` : auth.email}</Text>
          <Text style={text.small}>{auth.username ? auth.email : 'No username yet: set one when you share a group.'}</Text>
          <Text style={text.small}>{status.syncing ? 'Syncing…' : state.local.lastSyncAt ? `Last synced ${new Date(state.local.lastSyncAt).toLocaleTimeString()}` : 'Not synced yet'}</Text>
          {status.error && <Text style={text.warn}>{status.error}</Text>}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <Btn title="Sync now" icon="refresh" onPress={() => sync.sync().then(() => toast('Synced')).catch((e) => toast(e.message))} />
            <Btn title="Sign out" icon="logOut" kind="danger" onPress={() => Alert.alert('Sign out', 'Your wallpapers stay on this device.', [{ text: 'Cancel' }, { text: 'Sign out', style: 'destructive', onPress: () => sync.logout() }])} />
          </View>
        </Card>
      )}

      <Text style={[text.h2, { marginTop: 8 }]}>Devices & sync settings</Text>
      <Text style={[text.muted, { marginBottom: 10 }]}>
        {auth ? 'Edit any device from here, e.g. show “anime” on this phone and “All” on your PC. Changes reach the other device on its next sync.' : 'Sign in to manage your other devices.'}
      </Text>
      {getAllDevices(state).map((d) => {
        const seen = server.find((x) => x.id === d.id)?.lastSeen;
        return (
          <Card key={d.id}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Icon name={ICON[d.settings.platform] ?? 'monitor'} size={18} />
                  <Text style={[text.h2, { marginBottom: 0 }]}>{d.settings.name}{d.isThisDevice ? ' (this device)' : ''}</Text>
                </View>
                <Text style={text.small}>{d.settings.platform} · {d.settings.mode === 'folder' ? 'folder mode' : 'sets wallpaper'}{seen ? ` · seen ${new Date(seen).toLocaleString()}` : ''}</Text>
              </View>
              <Btn title={open === d.id ? 'Hide' : 'Settings'} onPress={() => setOpen(open === d.id ? null : d.id)} />
            </View>
            {open === d.id && (
              <View style={{ marginTop: 12 }}>
                <DeviceSettingsForm deviceId={d.id} />
                {auth && !d.isThisDevice && (
                  <Btn title="Remove device" icon="trash" kind="danger" onPress={() => sync.removeDevice(d.id).catch((e) => toast(e.message))} />
                )}
              </View>
            )}
          </Card>
        );
      })}
    </ScrollView>
  );
}
