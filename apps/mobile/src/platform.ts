import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import * as Device from 'expo-device';
import { Album, Asset, requestPermissionsAsync } from 'expo-media-library';
import { Store, type Http, type PlatformActions, type Wallpaper } from '@wallpepper/core';
import WallpaperNative from '../modules/wallpaper';

export const ALBUM_NAME = 'Wallpepper';
const STATE_KEY = 'wallpepper-state-v1';

export function createStore(): Store {
  return new Store(
    {
      load: () => AsyncStorage.getItem(STATE_KEY),
      save: (json) => AsyncStorage.setItem(STATE_KEY, json),
    },
    {
      deviceName: Device.deviceName ?? Device.modelName ?? 'Android phone',
      platform: 'android',
      folderPath: `Pictures/${ALBUM_NAME}`,
    },
  );
}

export const http: Http = async (url, init) => {
  const res = await fetch(url, { headers: { 'User-Agent': 'Wallpepper/0.1 (android)', Accept: 'application/json', ...(init?.headers ?? {}) } });
  if (!res.ok) throw new Error(`${new URL(url).hostname} responded ${res.status}`);
  return res.json();
};

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

async function fetchToCache(w: Wallpaper): Promise<File> {
  const dir = new Directory(Paths.cache, 'wallpapers');
  dir.create({ idempotent: true, intermediates: true });
  const file = new File(dir, `${hash(w.id)}.jpg`);
  if (file.exists) return file;
  return File.downloadFileAsync(w.url, file, { idempotent: true });
}

export const platform: PlatformActions = {
  /** "Download": saves into the Pictures/Wallpepper album so gallery/OS wallpaper pickers can use it. */
  async download(w) {
    const perm = await requestPermissionsAsync(true);
    if (perm.status !== 'granted') throw new Error('Allow Wallpepper to save photos to download wallpapers.');
    const cached = await fetchToCache(w);
    const album = await Album.get(ALBUM_NAME);
    if (album) {
      const asset = await Asset.create(cached.uri, album);
      return asset.id;
    }
    const asset = await Asset.create(cached.uri);
    await Album.create(ALBUM_NAME, [asset], false);
    return asset.id;
  },

  async setWallpaper(w, target) {
    const cached = await fetchToCache(w);
    await WallpaperNative.setWallpaper(cached.uri, target);
  },
};
