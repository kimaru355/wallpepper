import { requireNativeModule } from 'expo';

export type WallpaperTarget = 'home' | 'lock' | 'both';

export interface SystemInsets { top: number; bottom: number; left: number; right: number }

interface WallpaperNative {
  /** Status/navigation bar and cutout sizes in dp (0s until the window is attached). */
  getSystemInsets(): SystemInsets;
  isSupported(): Promise<boolean>;
  /** @param fileUri a file:// uri of a local image */
  setWallpaper(fileUri: string, target: WallpaperTarget): Promise<void>;
}

export default requireNativeModule<WallpaperNative>('Wallpaper');
