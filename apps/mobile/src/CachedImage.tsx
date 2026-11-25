import { useEffect, useState } from 'react';
import { Image, View, type ImageStyle, type StyleProp } from 'react-native';
import { cachedUri, ensureCached } from './imageCache';
import { colors, Icon } from './ui';

/** Image that is kept on the device: shows the saved copy when there is one (works offline) and saves it otherwise. */
export function CachedImage({ uri, style, resizeMode = 'cover', blurRadius }: { uri: string; style?: StyleProp<ImageStyle>; resizeMode?: 'cover' | 'contain'; blurRadius?: number }) {
  const [src, setSrc] = useState(() => cachedUri(uri) ?? uri);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const hit = cachedUri(uri);
    setSrc(hit ?? uri);
    setFailed(false);
    if (!hit) void ensureCached(uri);
  }, [uri]);
  if (failed) {
    return (
      <View style={[style as object, { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panel2 }]}>
        <Icon name="image" size={22} color={colors.muted} />
      </View>
    );
  }
  return (
    <Image
      source={{ uri: src }}
      style={style}
      resizeMode={resizeMode}
      blurRadius={blurRadius}
      onError={() => {
        const hit = cachedUri(uri);
        if (hit && hit !== src) setSrc(hit);
        else setFailed(true);
      }}
    />
  );
}

