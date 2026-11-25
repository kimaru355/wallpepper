import { useEffect, useState, type ReactNode } from 'react';
import {
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { ICON_PATHS, type IconName } from '@wallpepper/core';
import { useInsets } from './insets';

export const colors = {
  bg: '#0e0f13', panel: '#171922', panel2: '#1f222d', line: '#2a2e3b', text: '#e8eaf0', muted: '#8b90a0',
  accent: '#7c5cff', accent2: '#ff5c8a', danger: '#ff5c6c', ok: '#3ecf8e', warn: '#f5b74e',
};

export function Icon({ name, size = 20, color = colors.text, strokeWidth = 2 }: { name: IconName; size?: number; color?: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {ICON_PATHS[name].map((d, i) => <Path key={i} d={d} />)}
    </Svg>
  );
}

/** Round icon button (e.g. on image tiles). */
export function IconBtn({ name, onPress, size = 18, style, color, label }: { name: IconName; onPress: () => void; size?: number; style?: ViewStyle; color?: string; label?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityLabel={label ?? name} hitSlop={6} style={({ pressed }) => [s.iconBtn, pressed && { opacity: 0.7 }, style]}>
      <Icon name={name} size={size} color={color ?? '#fff'} />
    </Pressable>
  );
}

export function Btn({ title, onPress, kind, disabled, style, icon }: {
  title: string; onPress: () => void; kind?: 'primary' | 'danger'; disabled?: boolean; style?: ViewStyle; icon?: IconName;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        s.btn,
        kind === 'primary' && { backgroundColor: colors.accent, borderColor: colors.accent },
        pressed && { opacity: 0.7 },
        disabled && { opacity: 0.4 },
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={16} color={kind === 'danger' ? colors.danger : colors.text} /> : null}
      <Text style={[s.btnText, kind === 'danger' && { color: colors.danger }]}>{title}</Text>
    </Pressable>
  );
}

export function Chip({ label, on, onPress, bold, icon }: { label: string; on?: boolean; onPress: () => void; bold?: boolean; icon?: IconName }) {
  return (
    <Pressable onPress={onPress} style={[s.chip, on && { backgroundColor: colors.accent, borderColor: colors.accent }, icon ? { flexDirection: 'row', alignItems: 'center', gap: 6 } : null]}>
      {icon ? <Icon name={icon} size={14} color={on ? '#fff' : colors.text} /> : null}
      <Text style={{ color: on ? '#fff' : colors.text, fontWeight: bold ? '700' : '400' }}>{label}</Text>
    </Pressable>
  );
}

export function Field({ label, ...props }: { label: string } & TextInputProps) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.muted} autoCapitalize="none" autoCorrect={false} {...props} style={[s.input, props.style]} />
    </View>
  );
}

export function Toggle({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <View style={s.toggle}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={{ color: colors.text }}>{label}</Text>
        {hint ? <Text style={s.small}>{hint}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.accent, false: colors.line }} thumbColor="#fff" />
    </View>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {options.map((o) => (
        <Chip key={o.value} label={o.label} on={o.value === value} onPress={() => onChange(o.value)} />
      ))}
    </View>
  );
}

/** Height of the on screen keyboard (0 when hidden). */
export function useKeyboardHeight(): number {
  const [h, setH] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", (e) => setH(e.endCoordinates.height));
    const hide = Keyboard.addListener("keyboardDidHide", () => setH(0));
    return () => (show.remove(), hide.remove());
  }, []);
  return h;
}

/**
 * Bottom sheet. It stays inside the space the device leaves for apps: above the navigation bar / gesture area, below the
 * status bar, and lifted above the keyboard.
 */
export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  const insets = useInsets();
  const kb = useKeyboardHeight();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <Pressable style={s.backdrop} onPress={onClose} />
      <View style={[s.sheet, { paddingBottom: Math.max(insets.bottom, kb) + 14, maxHeight: "85%", marginTop: insets.top }]}>
        {title ? <Text style={s.sheetTitle}>{title}</Text> : null}
        <ScrollView keyboardShouldPersistTaps="handled">{children}</ScrollView>
      </View>
    </Modal>
  );
}

/** Pick one of many values from a sheet. */
export function Select({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={s.label}>{label}</Text>
      <Pressable style={[s.input, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]} onPress={() => setOpen(true)}>
        <Text style={{ color: colors.text }}>{options.find((o) => o.value === value)?.label ?? value}</Text>
        <Icon name="chevronDown" size={16} color={colors.muted} />
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title={label}>
        {options.map((o) => (
          <Pressable key={o.value} style={[s.option, { flexDirection: 'row', alignItems: 'center' }]} onPress={() => { onChange(o.value); setOpen(false); }}>
            <Text style={{ color: o.value === value ? colors.accent : colors.text, fontSize: 16, flex: 1 }}>{o.label}</Text>
            {o.value === value ? <Icon name="check" size={18} color={colors.accent} /> : null}
          </Pressable>
        ))}
      </Sheet>
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export const text = StyleSheet.create({
  h1: { color: colors.text, fontSize: 22, fontWeight: '800', marginBottom: 8 },
  h2: { color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: 6 },
  muted: { color: colors.muted },
  small: { color: colors.muted, fontSize: 12 },
  warn: { color: colors.warn, fontSize: 12 },
});

const s = StyleSheet.create({
  btn: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel2, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  iconBtn: { backgroundColor: 'rgba(14,15,19,.78)', borderRadius: 18, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: colors.text, fontWeight: '600' },
  chip: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999 },
  label: { color: colors.muted, fontSize: 12, marginBottom: 4 },
  small: { color: colors.muted, fontSize: 12 },
  input: { backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.line, borderRadius: 10, color: colors.text, paddingHorizontal: 12, paddingVertical: 10 },
  toggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.6)' },
  sheet: { backgroundColor: colors.panel, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 18, borderColor: colors.line, borderWidth: 1 },
  sheetTitle: { color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: 12 },
  option: { paddingVertical: 13, borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth },
  card: { backgroundColor: colors.panel, borderColor: colors.line, borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 12 },
});
