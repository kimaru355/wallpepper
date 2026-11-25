import { startActivityAsync } from 'expo-intent-launcher';
import WallpaperNative from '../modules/wallpaper';

const PACKAGE = 'app.wallpepper.mobile';

/** True when Android no longer restricts Wallpepper's background work (battery optimisation is off for it). */
export function isBatteryUnrestricted(): boolean {
  try {
    return WallpaperNative.isIgnoringBatteryOptimizations();
  } catch {
    return false;
  }
}

/**
 * Takes the user straight to Android's "allow background activity" prompt for Wallpepper (one tap to confirm).
 * Falls back to the battery optimisation list, and then to the app's settings page.
 */
export async function openBatterySettings(): Promise<void> {
  const attempts: [string, { data?: string }][] = [
    ['android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS', { data: `package:${PACKAGE}` }],
    ['android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS', {}],
    ['android.settings.APPLICATION_DETAILS_SETTINGS', { data: `package:${PACKAGE}` }],
  ];
  for (const [action, extra] of attempts) {
    try {
      await startActivityAsync(action, extra);
      return;
    } catch {
      /* try the next one */
    }
  }
  throw new Error('Could not open the battery settings. Open Settings › Apps › Wallpepper › Battery and choose “Unrestricted”.');
}
