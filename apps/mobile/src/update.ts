import * as Application from 'expo-application';
import { Directory, File, Paths } from 'expo-file-system';
import { startActivityAsync } from 'expo-intent-launcher';
import { checkForUpdate, type UpdateInfo } from '@wallpepper/core';

export const installedVersion = Application.nativeApplicationVersion ?? '0.0.0';

const fetchJson = async (url: string) => {
  const res = await fetch(url, { headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' } });
  if (!res.ok) throw new Error(`Update server responded ${res.status}`);
  return res.json();
};

/** Newer release for this phone, or null when up to date. */
export const checkUpdate = (): Promise<UpdateInfo | null> => checkForUpdate(fetchJson, installedVersion, 'android');

/**
 * Downloads the new APK and opens Android's installer for it. Android only installs it when it is signed with the
 * same key as the installed app, and asks the user to allow "install unknown apps" for Wallpepper the first time.
 */
export async function downloadAndInstall(u: UpdateInfo): Promise<void> {
  const dir = new Directory(Paths.cache, 'updates');
  dir.create({ idempotent: true, intermediates: true });
  const file = new File(dir, `Wallpepper-${u.version}.apk`);
  if (file.exists) file.delete();
  await File.downloadFileAsync(u.url, file, { idempotent: true });
  if (file.size !== u.file.size) {
    file.delete();
    throw new Error('The downloaded update is incomplete. Check your connection and try again.');
  }
  await startActivityAsync('android.intent.action.VIEW', {
    data: file.contentUri,
    type: 'application/vnd.android.package-archive',
    flags: 1 /* FLAG_GRANT_READ_URI_PERMISSION */ | 0x10000000 /* FLAG_ACTIVITY_NEW_TASK */,
  });
}
