import { requireNativeModule } from 'expo';

export type WallpaperTarget = 'home' | 'lock' | 'both';

export interface SystemInsets { top: number; bottom: number; left: number; right: number }

interface WallpaperNative {
  /** Status/navigation bar and cutout sizes in dp (0s until the window is attached). */
  getSystemInsets(): SystemInsets;
  isSupported(): Promise<boolean>;
  /** True when Wallpepper is exempt from battery optimisation (needed for reliable background rotation). */
  isIgnoringBatteryOptimizations(): boolean;
  /** @param fileUri a file:// uri of a local image; @param fit fill | fit | stretch | center */
  setWallpaper(fileUri: string, target: WallpaperTarget, fit: string, crop?: string | null): Promise<void>;
  /** Saves a cropped / blurred-background version as a JPEG (folder mode). `crop` is "x,y,w,h" in fractions. Returns its file:// uri. */
  renderToFile(fileUri: string, fit: string | null, crop: string | null, name: string): Promise<string>;
}

export default requireNativeModule<WallpaperNative>('Wallpaper');
