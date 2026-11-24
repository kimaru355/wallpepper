import { ScrollView, Text } from 'react-native';
import { getDeviceSettings, rotateNow } from '@wallpepper/core';
import { DeviceSettingsForm } from '../components';
import { getCtx, toast, useAppState } from '../ctx';
import { platform } from '../platform';
import { UpdateCard } from '../UpdateCard';
import { Btn, Card, text } from '../ui';

export function SettingsScreen() {
  const state = useAppState();
  const { store } = getCtx();
  const s = getDeviceSettings(state);
  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <Text style={text.h1}>Settings <Text style={text.small}>this device</Text></Text>
      <Card>
        <DeviceSettingsForm deviceId={state.local.deviceId} />
      </Card>
      <Card>
        <Text style={text.h2}>Wallpaper folder</Text>
        <Text style={text.small}>
          Downloads are saved to the “Wallpepper” album ({state.local.folderPath}). {s?.mode === 'folder'
            ? 'Folder mode is on: pick this album in your gallery / wallpaper app (e.g. Samsung “Gallery” wallpaper slideshow) to let the OS rotate it.'
            : 'Switch to “Download to folder” above if you prefer the OS to manage your wallpaper.'}
        </Text>
        <Btn
          title="Change wallpaper now"
          style={{ marginTop: 12 }}
          onPress={() => rotateNow(store, platform).then((w) => toast(w ? 'Wallpaper changed' : 'No wallpapers in the selected group yet')).catch((e) => toast(e.message))}
        />
      </Card>
      <Card>
        <Text style={text.h2}>Automatic switching</Text>
        <Text style={text.small}>
          Android runs the playlist in the background about every 15+ minutes (battery permitting). Some phone makers stop background work for apps that were swiped away; if the wallpaper stops changing, exclude Wallpepper from battery optimisation.
        </Text>
      </Card>
      <UpdateCard />
    </ScrollView>
  );
}
