import { useState } from 'react';
import { Text } from 'react-native';
import type { UpdateInfo } from '@wallpepper/core';
import { toast } from './ctx';
import { checkUpdate, downloadAndInstall, installedVersion } from './update';
import { Btn, Card, text } from './ui';

export function UpdateCard() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [busy, setBusy] = useState<'check' | 'install' | null>(null);

  const check = async () => {
    setBusy('check');
    try {
      const u = await checkUpdate();
      setUpdate(u);
      if (!u) toast('Wallpepper is up to date');
    } catch (e) {
      toast(`Could not check for updates: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const install = async () => {
    if (!update) return;
    setBusy('install');
    try {
      await downloadAndInstall(update);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <Text style={text.h2}>App updates</Text>
      <Text style={text.small}>
        Wallpepper {installedVersion}
        {update ? ` · version ${update.version} is available (${(update.file.size / 1048576).toFixed(0)} MB)` : ''}
      </Text>
      {update ? (
        <Btn
          kind="primary"
          title={busy === 'install' ? 'Downloading…' : `Update to ${update.version}`}
          disabled={busy !== null}
          style={{ marginTop: 12 }}
          onPress={() => void install()}
        />
      ) : (
        <Btn title={busy === 'check' ? 'Checking…' : 'Check for updates'} disabled={busy !== null} style={{ marginTop: 12 }} onPress={() => void check()} />
      )}
    </Card>
  );
}
