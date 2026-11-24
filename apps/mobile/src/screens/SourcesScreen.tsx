import { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import {
  addCustomSource,
  CATEGORIES,
  getSources,
  removeCustomSource,
  setSourceEnabled,
  SOURCE_TYPE_HELP,
  sourceNeedsKey,
  updateSourceOptions,
  type SourceConfig,
  type SourceType,
} from '@wallpepper/core';
import { getCtx, toast, useAppState } from '../ctx';
import { Btn, Card, Chip, Field, Select, Sheet, Toggle, text } from '../ui';

function Options({ type, values, onChange }: { type: SourceType; values: Record<string, string>; onChange: (k: string, v: string) => void }) {
  const fields = SOURCE_TYPE_HELP[type]?.fields ?? [];
  return (
    <View>
      {fields.map((f) => (
        <Field key={f.key} label={f.label + (f.required ? ' *' : '')} placeholder={f.placeholder} secureTextEntry={f.secret} value={values[f.key] ?? ''} onChangeText={(v) => onChange(f.key, v)} />
      ))}
      {fields.some((f) => f.secret) && <Text style={text.small}>API keys stay on this device and are never synced.</Text>}
    </View>
  );
}

function SourceCard({ s }: { s: SourceConfig }) {
  const { store } = getCtx();
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<Record<string, string>>(s.options);
  const editable = (SOURCE_TYPE_HELP[s.type]?.fields ?? []).length > 0;
  return (
    <Card>
      <Toggle label={s.name} value={s.enabled} onChange={(v) => setSourceEnabled(store, s.id, v)} hint={s.description ?? SOURCE_TYPE_HELP[s.type]?.label} />
      <Text style={text.small}>
        {s.builtin ? 'Built-in · ' : 'Custom · '}
        {s.categories.length ? s.categories.map((c) => CATEGORIES.find((x) => x.id === c)?.label ?? c).join(', ') : 'any category'}
      </Text>
      {sourceNeedsKey(s) && !s.options.apiKey && <Text style={text.warn}>Needs an API key to work.</Text>}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
        {editable && <Btn title="Options" onPress={() => { setOpts(s.options); setOpen(true); }} />}
        {!s.builtin && (
          <Btn title="Remove" kind="danger" onPress={() => Alert.alert('Remove source', `Remove "${s.name}"?`, [{ text: 'Cancel' }, { text: 'Remove', style: 'destructive', onPress: () => removeCustomSource(store, s.id) }])} />
        )}
      </View>
      <Sheet visible={open} onClose={() => setOpen(false)} title={`${s.name} options`}>
        <Options type={s.type} values={opts} onChange={(k, v) => setOpts({ ...opts, [k]: v })} />
        <Btn title="Save" kind="primary" onPress={() => { updateSourceOptions(store, s.id, opts); setOpen(false); toast('Saved'); }} />
      </Sheet>
    </Card>
  );
}

function AddSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { store } = getCtx();
  const [name, setName] = useState('');
  const [type, setType] = useState<SourceType>('moebooru');
  const [cats, setCats] = useState<string[]>([]);
  const [opts, setOpts] = useState<Record<string, string>>({});
  const submit = () => {
    try {
      addCustomSource(store, { name, type, categories: cats, options: opts });
      toast('Source added');
      setName(''); setOpts({}); setCats([]);
      onClose();
    } catch (e: any) {
      toast(e.message);
    }
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Add a source">
      <Field label="Name" value={name} onChangeText={setName} autoCapitalize="sentences" />
      <Select label="Type" value={type} options={Object.entries(SOURCE_TYPE_HELP).map(([k, v]) => ({ value: k, label: v.label }))} onChange={(v) => { setType(v as SourceType); setOpts({}); }} />
      <Options type={type} values={opts} onChange={(k, v) => setOpts({ ...opts, [k]: v })} />
      <Text style={[text.small, { marginBottom: 6 }]}>Shown under these categories (none = any, via keyword)</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
        {CATEGORIES.map((c) => (
          <Chip key={c.id} label={c.label} on={cats.includes(c.id)} onPress={() => setCats(cats.includes(c.id) ? cats.filter((x) => x !== c.id) : [...cats, c.id])} />
        ))}
      </View>
      <Btn title="Add source" kind="primary" onPress={submit} />
    </Sheet>
  );
}

export function SourcesScreen() {
  const state = useAppState();
  const [adding, setAdding] = useState(false);
  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <Text style={text.h1}>Sources</Text>
        <Btn title="＋ Add" kind="primary" onPress={() => setAdding(true)} />
      </View>
      <Text style={[text.muted, { marginBottom: 12 }]}>The six built-in sources can be switched off but not removed. Custom sources sync to your other devices.</Text>
      {getSources(state).map((s) => <SourceCard key={s.id + JSON.stringify(s.options)} s={s} />)}
      <AddSheet visible={adding} onClose={() => setAdding(false)} />
    </ScrollView>
  );
}
