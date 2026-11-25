import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { FIT_MODES, getDeviceSettings, updateDeviceSettings, type FitMode, type IconName } from '@wallpepper/core';
import { AuthForm } from '../AuthForm';
import { isBatteryUnrestricted, openBatterySettings } from '../battery';
import { getCtx, toast, useAppState } from '../ctx';
import { useInsets } from '../insets';
import { Btn, Card, colors, Icon, Select, text } from '../ui';

const SLIDES: { icon: IconName; title: string; body: string; points: string[] }[] = [
  {
    icon: 'wallpaper',
    title: 'Wallpapers you will actually love',
    body: 'Wallpepper brings wallpapers from many trusted sources into one app, so you do not have to hunt through websites.',
    points: ['Anime, movies & series, games, Linux, nature, space and more', 'No keys or setup: just browse and tap', 'Set your home screen, lock screen or both'],
  },
  {
    icon: 'layers',
    title: 'Groups and sub-groups',
    body: 'Keep your favourites tidy: Anime › Naruto, Movies › Marvel. Use a whole group, or just one sub-group, as your wallpaper.',
    points: ['Pick “Anime” to see every anime wallpaper', 'Pick “Naruto” to see only Naruto', 'Let the wallpaper change by itself on a schedule'],
  },
  {
    icon: 'users',
    title: 'Synced and shared',
    body: 'Your account keeps your library on every device and lets you discover what the community built.',
    points: ['Phone and PC always show your latest groups', 'Share your groups and browse other people’s', 'Saved images keep working when you are offline'],
  },
];

type Step = 'info' | 'auth' | 'engine' | 'fit';
const STEPS: Step[] = ['info', 'auth', 'engine', 'fit'];

export function Onboarding() {
  const { store } = getCtx();
  const state = useAppState();
  const insets = useInsets();
  const [step, setStep] = useState<Step>(state.local.auth ? 'engine' : 'info');
  const idx = STEPS.indexOf(step);

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 12) }]}>
      {step !== 'info' && (
        <View style={styles.progress}>
          {STEPS.slice(1).map((s, i) => (
            <View key={s} style={[styles.bar, i < idx && { backgroundColor: colors.accent }]} />
          ))}
        </View>
      )}
      {step === 'info' && <InfoSlides onDone={() => setStep(state.local.auth ? 'engine' : 'auth')} />}
      {step === 'auth' && (
        <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
          <Text style={styles.h1}>Create your account</Text>
          <Text style={[text.muted, { marginBottom: 18 }]}>
            An account is needed for the best experience: it syncs your wallpapers and groups between your devices and gives you a username for the community.
          </Text>
          <Card>
            <AuthForm onDone={() => setStep('engine')} />
          </Card>
          <Btn title="Back" onPress={() => setStep('info')} style={{ marginTop: 4 }} />
        </ScrollView>
      )}
      {step === 'engine' && <EngineStep onBack={() => setStep(state.local.auth ? 'info' : 'auth')} onNext={() => setStep('fit')} />}
      {step === 'fit' && (
        <FitStep
          onBack={() => setStep('engine')}
          onDone={() => {
            store.setLocal({ onboarded: true });
            toast('You are all set');
          }}
        />
      )}
    </View>
  );
}

function InfoSlides({ onDone }: { onDone: () => void }) {
  const { width } = useWindowDimensions();
  const [i, setI] = useState(0);
  const last = i === SLIDES.length - 1;
  const onEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => setI(Math.round(e.nativeEvent.contentOffset.x / width));
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.brand}>Wallpepper</Text>
      <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={onEnd} style={{ flex: 1 }}>
        {SLIDES.map((s) => (
          <View key={s.title} style={{ width, paddingHorizontal: 28, justifyContent: 'center' }}>
            <View style={styles.hero}>
              <Icon name={s.icon} size={54} color="#fff" strokeWidth={1.6} />
            </View>
            <Text style={styles.h1}>{s.title}</Text>
            <Text style={[text.muted, { fontSize: 16, lineHeight: 23, marginBottom: 16 }]}>{s.body}</Text>
            {s.points.map((p) => (
              <View key={p} style={{ flexDirection: 'row', gap: 10, marginBottom: 8, alignItems: 'center' }}>
                <Icon name="check" size={16} color={colors.ok} />
                <Text style={{ color: colors.text, flex: 1 }}>{p}</Text>
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
      <View style={styles.dots}>
        {SLIDES.map((s, n) => (
          <View key={s.title} style={[styles.dot, n === i && { backgroundColor: colors.accent, width: 22 }]} />
        ))}
      </View>
      <View style={{ paddingHorizontal: 24, minHeight: 56 }}>
        {last ? <Btn title="Get Started" kind="primary" onPress={onDone} /> : <Text style={[text.muted, { textAlign: 'center', paddingVertical: 12 }]}>Swipe left to continue</Text>}
      </View>
    </View>
  );
}

const INTERVALS = [60, 180, 360, 720, 1440];

function EngineStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const { store } = getCtx();
  const state = useAppState();
  const s = getDeviceSettings(state);
  const [mode, setMode] = useState<'apply' | 'folder'>(s?.mode ?? 'apply');
  // 0 = keep the wallpaper you set (static); nothing changes it unless you ask
  const [minutes, setMinutes] = useState(s?.rotationEnabled && INTERVALS.includes(s.rotationMinutes) ? s.rotationMinutes : 0);
  const [unrestricted, setUnrestricted] = useState(isBatteryUnrestricted());
  const asked = useRef(false);

  // The battery prompt is a separate Android screen; re-check when the user comes back.
  useEffect(() => {
    const t = setInterval(() => setUnrestricted(isBatteryUnrestricted()), 1500);
    return () => clearInterval(t);
  }, []);

  const save = () => {
    updateDeviceSettings(store, store.state.local.deviceId, {
      mode,
      rotationEnabled: mode === 'apply' && minutes > 0,
      rotationMinutes: minutes || s?.rotationMinutes || 360,
    });
    onNext();
  };

  const option = (value: 'apply' | 'folder', title: string, badge: string | null, lines: string[]) => (
    <Pressable onPress={() => setMode(value)} style={[styles.option, mode === value && { borderColor: colors.accent, backgroundColor: colors.panel2 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <View style={[styles.radio, mode === value && { borderColor: colors.accent }]}>{mode === value ? <View style={styles.radioDot} /> : null}</View>
        <Text style={[text.h2, { marginBottom: 0, flex: 1 }]}>{title}</Text>
        {badge ? <Text style={styles.badge}>{badge}</Text> : null}
      </View>
      {lines.map((l) => (
        <Text key={l} style={[text.small, { marginTop: 3 }]}>• {l}</Text>
      ))}
    </Pressable>
  );

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.h1}>Who changes your wallpaper?</Text>
      <Text style={[text.muted, { marginBottom: 16 }]}>You can change this any time in Settings.</Text>
      {option('apply', 'Wallpepper', 'Recommended', [
        'Keeps the wallpaper you pick, or changes it on a schedule: your choice',
        'Uses your fit setting and your groups and sub-groups',
        'Battery friendly: runs on Android’s own scheduler, nothing stays running in the background',
      ])}
      {option('folder', 'My phone (gallery)', null, [
        'Wallpepper only saves images into albums: “Wallpepper”, “Wallpepper - Anime”…',
        'You pick an album in your gallery / wallpaper settings and the phone rotates it',
        'No background work from Wallpepper at all',
      ])}

      {mode === 'apply' ? (
        <Card style={{ marginTop: 8 }}>
          <Select
            label="Wallpaper"
            value={String(minutes)}
            options={[{ value: '0', label: 'Keep the one I set (no automatic changes)' }, ...INTERVALS.map((m) => ({ value: String(m), label: `Change it every ${m >= 1440 ? 'day' : `${m / 60} ${m === 60 ? 'hour' : 'hours'}`}` }))]}
            onChange={(v) => setMinutes(Number(v))}
          />
          {minutes > 0 ? (
          <>
          <Text style={text.small}>Longer gaps use less battery. Android runs background work every 15 minutes at the very fastest.</Text>
          <View style={{ height: 12 }} />
          {unrestricted ? (
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <Icon name="check" size={18} color={colors.ok} />
              <Text style={{ color: colors.ok, flex: 1 }}>Background activity is allowed, so changes run on time.</Text>
            </View>
          ) : (
            <>
              <Text style={[text.small, { marginBottom: 8 }]}>
                Some phones pause apps to save battery, which makes the wallpaper change late or not at all. Allow Wallpepper to run in the background (it only wakes up when a change is due).
              </Text>
              <Btn
                title="Allow background activity"
                icon="battery"
                onPress={() => {
                  asked.current = true;
                  openBatterySettings().catch((e) => toast(e.message));
                }}
              />
            </>
          )}
          </>
          ) : (
            <Text style={text.small}>The wallpaper only changes when you set one. You can turn on automatic changes later in Settings.</Text>
          )}
        </Card>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
        <Btn title="Back" onPress={onBack} style={{ flex: 1 }} />
        <Btn title="Continue" kind="primary" onPress={save} style={{ flex: 2 }} />
      </View>
    </ScrollView>
  );
}

/** A little phone that shows what each fit does with a landscape picture. */
export function FitPreview({ fit, size = 92 }: { fit: FitMode; size?: number }) {
  const w = size;
  const h = Math.round(size * 2);
  const imgW = 100;
  const imgH = 62; // landscape picture
  let box: { width: number; height: number };
  if (fit === 'stretch') box = { width: w, height: h };
  else if (fit === 'fit' || fit === 'blur') box = { width: w, height: Math.round((w * imgH) / imgW) };
  else if (fit === 'center') box = { width: w * 0.6, height: w * 0.6 * (imgH / imgW) };
  else box = { width: Math.round((h * imgW) / imgH), height: h }; // fill: covers, overflow cropped
  return (
    <View style={{ width: w, height: h, borderRadius: 12, borderWidth: 2, borderColor: colors.line, backgroundColor: fit === 'blur' ? '#3b2f7a' : '#000', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: box.width, height: box.height, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', borderRadius: fit === 'fill' ? 0 : 3 }}>
        <View style={{ width: Math.min(box.width, box.height) * 0.45, height: Math.min(box.width, box.height) * 0.45, borderRadius: 99, backgroundColor: colors.accent2 }} />
      </View>
    </View>
  );
}

function FitStep({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const { store } = getCtx();
  const state = useAppState();
  const s = getDeviceSettings(state);
  const fits = FIT_MODES.filter((f) => !f.desktopOnly);
  const [fit, setFit] = useState<FitMode>(s?.fit ?? 'fill');
  const finish = () => {
    updateDeviceSettings(store, store.state.local.deviceId, { fit });
    onDone();
  };
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.h1}>How should images fit?</Text>
      <Text style={[text.muted, { marginBottom: 16 }]}>Most wallpapers are not exactly your screen’s shape. Pick what happens with the difference.</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
        {fits.map((f) => (
          <Pressable key={f.id} onPress={() => setFit(f.id)} style={[styles.fitCard, fit === f.id && { borderColor: colors.accent, backgroundColor: colors.panel2 }]}>
            <FitPreview fit={f.id} />
            <Text style={[text.h2, { marginTop: 10, marginBottom: 2, color: fit === f.id ? colors.accent : colors.text }]}>{f.label}{f.id === 'fill' ? ' ✓' : ''}</Text>
            <Text style={[text.small, { textAlign: 'center' }]}>{f.hint}</Text>
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 20 }}>
        <Btn title="Back" onPress={onBack} style={{ flex: 1 }} />
        <Btn title="Finish" kind="primary" onPress={finish} style={{ flex: 2 }} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  page: { padding: 22, paddingTop: 12 },
  brand: { color: colors.accent, fontSize: 22, fontWeight: '800', textAlign: 'center', paddingTop: 14 },
  h1: { color: colors.text, fontSize: 26, fontWeight: '800', marginBottom: 10 },
  hero: { width: 112, height: 112, borderRadius: 32, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginBottom: 26 },
  dots: { flexDirection: 'row', gap: 6, justifyContent: 'center', paddingVertical: 14 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.line },
  progress: { flexDirection: 'row', gap: 6, paddingHorizontal: 22, paddingTop: 14 },
  bar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.line },
  option: { borderWidth: 1.5, borderColor: colors.line, borderRadius: 14, padding: 14, marginBottom: 12, backgroundColor: colors.panel },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.muted, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
  badge: { color: '#fff', backgroundColor: colors.ok, fontSize: 11, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, overflow: 'hidden' },
  fitCard: { width: '47%', alignItems: 'center', borderWidth: 1.5, borderColor: colors.line, borderRadius: 14, padding: 12, backgroundColor: colors.panel },
});
