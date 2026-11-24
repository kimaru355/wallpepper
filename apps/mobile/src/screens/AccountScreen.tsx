import { useEffect, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { DEFAULT_SERVER_URL, getAllDevices, type Device } from '@wallpepper/core';
import { DeviceSettingsForm } from '../components';
import { getCtx, toast, useAppState, useSyncStatus } from '../ctx';
import { Btn, Card, Field, text } from '../ui';

const ICON: Record<string, string> = { android: '📱', ios: '📱', windows: '🖥️', mac: '💻', linux: '🐧' };

function SignIn() {
  const { sync, store } = getCtx();
  const [server, setServer] = useState(store.state.local.auth?.serverUrl ?? DEFAULT_SERVER_URL);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async (mode: 'login' | 'register') => {
    setBusy(true);
    try {
      await sync.authenticate(mode, server, email, password);
      toast(mode === 'register' ? 'Account created' : 'Signed in and synced');
    } catch (e: any) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <Text style={[text.muted, { marginBottom: 12 }]}>An account saves your wallpaper links and groups and syncs them to your other devices.</Text>
      <Field label="Sync server" value={server} onChangeText={setServer} keyboardType="url" />
      <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Btn title="Create account" disabled={busy} onPress={() => go('register')} style={{ flex: 1 }} />
        <Btn title="Sign in" kind="primary" disabled={busy} onPress={() => go('login')} style={{ flex: 1 }} />
      </View>
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
    if (auth) sync.listDevices().then(setServer).catch(() => {});
  }, [auth, sync, state.local.lastSyncAt]);

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <Text style={text.h1}>Account & Devices</Text>
      {!auth ? (
        <SignIn />
      ) : (
        <Card>
          <Text style={text.h2}>{auth.email}</Text>
          <Text style={text.small}>{auth.serverUrl}</Text>
          <Text style={text.small}>{status.syncing ? 'Syncing…' : state.local.lastSyncAt ? `Last synced ${new Date(state.local.lastSyncAt).toLocaleTimeString()}` : 'Not synced yet'}</Text>
          {status.error && <Text style={text.warn}>{status.error}</Text>}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <Btn title="Sync now" onPress={() => sync.sync().then(() => toast('Synced')).catch((e) => toast(e.message))} />
            <Btn title="Sign out" kind="danger" onPress={() => Alert.alert('Sign out', 'Your wallpapers stay on this device.', [{ text: 'Cancel' }, { text: 'Sign out', style: 'destructive', onPress: () => sync.logout() }])} />
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
                <Text style={text.h2}>{ICON[d.settings.platform] ?? '📟'} {d.settings.name}{d.isThisDevice ? ' (this device)' : ''}</Text>
                <Text style={text.small}>{d.settings.platform} · {d.settings.mode === 'folder' ? 'folder mode' : 'sets wallpaper'}{seen ? ` · seen ${new Date(seen).toLocaleString()}` : ''}</Text>
              </View>
              <Btn title={open === d.id ? 'Hide' : 'Settings'} onPress={() => setOpen(open === d.id ? null : d.id)} />
            </View>
            {open === d.id && (
              <View style={{ marginTop: 12 }}>
                <DeviceSettingsForm deviceId={d.id} />
                {auth && !d.isThisDevice && (
                  <Btn title="Remove device" kind="danger" onPress={() => sync.removeDevice(d.id).catch((e) => toast(e.message))} />
                )}
              </View>
            )}
          </Card>
        );
      })}
    </ScrollView>
  );
}
