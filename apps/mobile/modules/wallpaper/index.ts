import { requireNativeModule } from 'expo';

export type WallpaperTarget = 'home' | 'lock' | 'both';

interface WallpaperNative {
  isSupported(): Promise<boolean>;
  /** @param fileUri a file:// uri of a local image */
  setWallpaper(fileUri: string, target: WallpaperTarget): Promise<void>;
}

export default requireNativeModule<WallpaperNative>('Wallpaper');
