import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { getDeviceSettings } from '@wallpepper/core';
import { syncBackgroundTask } from './src/background';
import { bootstrap, useAppState } from './src/ctx';
import { useInsets } from './src/insets';
import { AccountScreen } from './src/screens/AccountScreen';
import { BrowseScreen } from './src/screens/BrowseScreen';
import { LibraryScreen } from './src/screens/LibraryScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { SourcesScreen } from './src/screens/SourcesScreen';
import { checkUpdate, downloadAndInstall } from './src/update';
import { colors } from './src/ui';

const TABS = [
  { id: 'browse', label: 'Browse', icon: '🔍', Screen: BrowseScreen },
  { id: 'library', label: 'Library', icon: '🖼️', Screen: LibraryScreen },
  { id: 'sources', label: 'Sources', icon: '🌐', Screen: SourcesScreen },
  { id: 'account', label: 'Devices', icon: '☁️', Screen: AccountScreen },
  { id: 'settings', label: 'Settings', icon: '⚙️', Screen: SettingsScreen },
] as const;

function Main() {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('browse');
  const state = useAppState();
  const insets = useInsets();
  const s = getDeviceSettings(state);

  // Keep the OS background scheduler in line with this device's (possibly remotely edited) settings.
  useEffect(() => {
    void syncBackgroundTask(s);
  }, [s?.rotationEnabled, s?.mode, s?.syncEnabled, s?.rotationMinutes]); // eslint-disable-line react-hooks/exhaustive-deps

  // Offer a new release once per launch (the Settings tab can also check manually).
  useEffect(() => {
    checkUpdate()
      .then((u) => {
        if (!u) return;
        Alert.alert('Update available', `Wallpepper ${u.version} is available (you have ${u.current}).`, [
          { text: 'Later', style: 'cancel' },
          { text: 'Update', onPress: () => void downloadAndInstall(u).catch((e) => Alert.alert('Update failed', String(e?.message ?? e))) },
        ]);
      })
      .catch(() => {});
  }, []);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}><Text style={styles.brand}>Wallpepper</Text></View>
      <View style={{ flex: 1 }}>
        {/* Browse stays mounted to keep its results and scroll position. */}
        <View style={{ flex: 1, display: tab === 'browse' ? 'flex' : 'none' }}><BrowseScreen /></View>
        {TABS.filter((t) => t.id !== 'browse' && t.id === tab).map(({ id, Screen }) => (
          <View key={id} style={{ flex: 1 }}><Screen /></View>
        ))}
      </View>
      <View style={[styles.tabs, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        {TABS.map((t) => (
          <Pressable key={t.id} style={styles.tab} onPress={() => setTab(t.id)}>
            <Text style={{ fontSize: 18, opacity: tab === t.id ? 1 : 0.5 }}>{t.icon}</Text>
            <Text style={{ color: tab === t.id ? colors.accent : colors.muted, fontSize: 11 }}>{t.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    bootstrap().then(() => setReady(true)).catch((e) => setError(String(e?.stack ?? e)));
  }, []);
  if (error) return <View style={styles.center}><Text style={{ color: colors.danger }}>{error}</Text></View>;
  if (!ready) return <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>;
  return <Main />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 24 },
  header: { paddingHorizontal: 16, paddingBottom: 6 },
  brand: { color: colors.accent, fontSize: 22, fontWeight: '800' },
  tabs: { flexDirection: 'row', borderTopColor: colors.line, borderTopWidth: 1, backgroundColor: colors.panel },
  tab: { flex: 1, alignItems: 'center', paddingTop: 8, gap: 2 },
});
