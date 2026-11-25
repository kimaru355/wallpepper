import { useEffect, useState } from 'react';
import { AppState, ScrollView, Text, View } from 'react-native';
import { getDeviceSettings, rotateNow } from '@wallpepper/core';
import { isBatteryUnrestricted, openBatterySettings } from '../battery';
import { DeviceSettingsForm } from '../components';
import { getCtx, toast, useAppState } from '../ctx';
import { clearImageCache, imageCacheSize } from '../imageCache';
import { albumName, platform } from '../platform';
import { UpdateCard } from '../UpdateCard';
import { Btn, Card, Icon, colors, text, IconBtn } from '../ui';
import { SourcesPanel } from './SourcesScreen';

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(n > 1e8 ? 0 : 1)} MB`;

export function SettingsScreen() {
  const state = useAppState();
  const { store } = getCtx();
  const [page, setPage] = useState<'main' | 'sources'>('main');
  const [unrestricted, setUnrestricted] = useState(isBatteryUnrestricted());
  const [cacheSize, setCacheSize] = useState(imageCacheSize());
  const s = getDeviceSettings(state);

  // The battery prompt is a different Android screen: re-check when the user returns to the app.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') setUnrestricted(isBatteryUnrestricted());
    });
    return () => sub.remove();
  }, []);

  if (page === 'sources') {
    return (
      <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <IconBtn name="chevronLeft" label="Back" onPress={() => setPage('main')} style={{ backgroundColor: colors.panel2 }} />
          <Text style={text.small}>Settings</Text>
        </View>
        <SourcesPanel />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <Text style={text.h1}>Settings <Text style={text.small}>this device</Text></Text>
      <Card>
        <DeviceSettingsForm deviceId={state.local.deviceId} />
      </Card>

      <Card>
        <Text style={text.h2}>Wallpaper albums</Text>
        <Text style={text.small}>
          Downloads are saved to the “{albumName([])}” album, plus one album per group (e.g. “{albumName(['Anime', 'Naruto'])}”). {s?.mode === 'folder'
            ? 'Your phone changes the wallpaper: pick the album you want in your gallery or wallpaper settings. “Wallpepper” has everything; a group album only has that group (and its sub-groups).'
            : 'Choose “My phone / gallery” above if you prefer the phone to rotate them.'}
        </Text>
        <Btn
          title="Change wallpaper now"
          icon="refresh"
          style={{ marginTop: 12 }}
          onPress={() => rotateNow(store, platform).then((w) => toast(w ? 'Wallpaper changed' : 'No wallpapers in the selected group yet')).catch((e) => toast(e.message))}
        />
      </Card>

      <Card>
        <Text style={text.h2}>Automatic switching</Text>
        <Text style={text.small}>
          Android runs the playlist in the background about every 15+ minutes. Some phone makers stop background work for apps that were swiped away or that are “optimised”; if the wallpaper stops changing, allow Wallpepper to run in the background.
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
          <Icon name={unrestricted ? 'check' : 'battery'} size={18} color={unrestricted ? colors.ok : colors.warn} />
          <Text style={{ color: unrestricted ? colors.ok : colors.warn, flex: 1 }}>
            {unrestricted ? 'Battery optimisation is off for Wallpepper.' : 'Battery optimisation may delay wallpaper changes.'}
          </Text>
        </View>
        {!unrestricted && (
          <Btn
            title="Disable battery optimisation"
            icon="battery"
            style={{ marginTop: 10 }}
            onPress={() => openBatterySettings().catch((e) => toast(e.message))}
          />
        )}
      </Card>

      <Card>
        <Text style={text.h2}>Sources</Text>
        <Text style={text.small}>Where wallpapers come from. Turn sources on or off, or add your own.</Text>
        <Btn title="Manage sources" icon="globe" style={{ marginTop: 12 }} onPress={() => setPage('sources')} />
      </Card>

      <Card>
        <Text style={text.h2}>Saved images</Text>
        <Text style={text.small}>Thumbnails you browse are kept on this phone so they load fast and still show without a connection ({mb(cacheSize)} used).</Text>
        <Btn title="Clear saved images" icon="trash" style={{ marginTop: 12 }} onPress={() => { clearImageCache(); setCacheSize(0); toast('Saved images cleared'); }} />
      </Card>
      <UpdateCard />
    </ScrollView>
  );
}

