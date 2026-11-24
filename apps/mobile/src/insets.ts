import { useEffect, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import WallpaperNative, { type SystemInsets } from '../modules/wallpaper';

const ZERO: SystemInsets = { top: 0, bottom: 0, left: 0, right: 0 };

function read(): SystemInsets {
  try {
    return WallpaperNative.getSystemInsets();
  } catch {
    return ZERO;
  }
}

/**
 * Sizes of the system bars the (edge-to-edge) app draws under, in dp. Re-read when the window size changes
 * (rotation, split screen, switching between gesture and button navigation).
 */
export function useInsets(): SystemInsets {
  const { width, height } = useWindowDimensions();
  const [insets, setInsets] = useState<SystemInsets>(read);
  useEffect(() => {
    setInsets(read());
    // the window may not have received its insets yet on the very first frame
    const t = setTimeout(() => setInsets(read()), 300);
    return () => clearTimeout(t);
  }, [width, height]);
  return insets;
}
