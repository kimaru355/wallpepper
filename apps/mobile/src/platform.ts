import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import * as Device from 'expo-device';
import { Album, Asset, requestPermissionsAsync } from 'expo-media-library';
import { Image } from 'react-native';
import { Store, type Crop, type Http, type ImageProbe, type PlatformActions, type Wallpaper } from '@wallpepper/core';
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

/** "Wallpepper", "Wallpepper - Anime", "Wallpepper - Anime - Naruto": Android albums cannot be nested, so the path is in the name. */
export const albumName = (subPath: string[]) => [ALBUM_NAME, ...subPath].join(" - ");

const cropArg = (c?: Crop) => (c ? [c.x, c.y, c.w, c.h].map((n) => n.toFixed(4)).join(',') : null);

/** Measures an image (step 1 of the compatibility check). */
export const probeImage: ImageProbe = (url) =>
  new Promise((resolve, reject) => Image.getSize(url, (width, height) => resolve({ width, height }), reject));

export const platform: PlatformActions = {
  folderLayout: "albums",

  /** "Download": saves into a Pictures album so gallery / OS wallpaper pickers can use it. */
  async download(w, _folder, subPath, render) {
    const perm = await requestPermissionsAsync(true);
    if (perm.status !== "granted") throw new Error("Allow Wallpepper to save photos to download wallpapers.");
    let cached = await fetchToCache(w);
    // folder mode with a crop / blurred background: save the finished picture, not the original
    if (render) {
      const uri = await WallpaperNative.renderToFile(cached.uri, render.fit, cropArg(render.crop), `r-${hash(w.id)}-${render.fit}-${hash(cropArg(render.crop) ?? '')}`);
      cached = new File(uri);
    }
    const name = albumName(subPath);
    const album = await Album.get(name);
    if (album) {
      const asset = await Asset.create(cached.uri, album);
      return asset.id;
    }
    const asset = await Asset.create(cached.uri);
    await Album.create(name, [asset], false);
    return asset.id;
  },

  async setWallpaper(w, target, fit, crop) {
    const cached = await fetchToCache(w);
    await WallpaperNative.setWallpaper(cached.uri, target, fit, cropArg(crop));
  },
};
