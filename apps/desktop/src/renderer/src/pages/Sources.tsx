import { useState } from 'react';
import {
  addCustomSource,
  CATEGORIES,
  getSources,
  removeCustomSource,
  setSourceEnabled,
  SOURCE_TYPE_HELP,
  updateSourceOptions,
  type SourceConfig,
  type SourceType,
} from '@wallpepper/core';
import { Icon } from '../components';
import { getCtx } from '../ctx';
import { useAppState } from '../hooks';
import { toast } from '../toast';

function OptionFields({ type, values, onChange }: { type: SourceType; values: Record<string, string>; onChange: (k: string, v: string) => void }) {
  const fields = SOURCE_TYPE_HELP[type]?.fields ?? [];
  if (!fields.length) return <div className="muted small">No options for this source.</div>;
  return (
    <div className="form">
      {fields.map((f) => (
        <label key={f.key}>
          {f.label}{f.required && ' *'}
          <input
            type={f.secret ? 'password' : 'text'}
            placeholder={f.placeholder}
            value={values[f.key] ?? ''}
            onChange={(e) => onChange(f.key, e.target.value)}
          />
        </label>
      ))}
      {fields.some((f) => f.secret) && <div className="muted small">API keys are stored on this device only and never synced.</div>}
    </div>
  );
}

function SourceRow({ s }: { s: SourceConfig }) {
  const { store } = getCtx();
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<Record<string, string>>(s.options);
  const editable = (SOURCE_TYPE_HELP[s.type]?.fields ?? []).length > 0;
  return (
    <div className="source">
      <div className="row between">
        <div>
          <strong>{s.name}</strong> {s.builtin ? <span className="tag">built-in</span> : <span className="tag custom">custom</span>}
          <div className="muted small">{s.description ?? SOURCE_TYPE_HELP[s.type]?.label}</div>
          <div className="muted small">
            {s.categories.length ? s.categories.map((c) => CATEGORIES.find((x) => x.id === c)?.label ?? c).join(' · ') : 'Any category (keyword search)'}
          </div>
        </div>
        <div className="row">
          {editable && <button onClick={() => setOpen(!open)}>{open ? 'Close' : 'Options'}</button>}
          {!s.builtin && <button className="danger" onClick={() => confirm(`Remove "${s.name}"?`) && removeCustomSource(store, s.id)}>Remove</button>}
          <label className="switch" title={s.enabled ? 'Enabled' : 'Disabled'}>
            <input type="checkbox" checked={s.enabled} onChange={(e) => setSourceEnabled(store, s.id, e.target.checked)} />
            <span />
          </label>
        </div>
      </div>
      {open && (
        <div style={{ marginTop: 12 }}>
          <OptionFields type={s.type} values={opts} onChange={(k, v) => setOpts({ ...opts, [k]: v })} />
          <div className="row end" style={{ marginTop: 8 }}>
            <button className="primary" onClick={() => { updateSourceOptions(store, s.id, opts); toast('Saved.', 'ok'); setOpen(false); }}>Save</button>
          </div>
        </div>
      )}
    </div>
  );
}

function AddSource({ onDone }: { onDone: () => void }) {
  const { store } = getCtx();
  const [name, setName] = useState('');
  const [type, setType] = useState<SourceType>('moebooru');
  const [cats, setCats] = useState<string[]>([]);
  const [opts, setOpts] = useState<Record<string, string>>({});
  const submit = () => {
    try {
      addCustomSource(store, { name, type, categories: cats, options: opts });
      toast('Source added.', 'ok');
      onDone();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };
  return (
    <div className="source">
      <h3 style={{ marginTop: 0 }}>Add a source</h3>
      <div className="form">
        <label>Name <input value={name} onChange={(e) => setName(e.target.value)} placeholder="My wallpapers" /></label>
        <label>Type
          <select value={type} onChange={(e) => { setType(e.target.value as SourceType); setOpts({}); }}>
            {Object.entries(SOURCE_TYPE_HELP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
        <OptionFields type={type} values={opts} onChange={(k, v) => setOpts({ ...opts, [k]: v })} />
        <div>
          <div className="muted small" style={{ marginBottom: 4 }}>Shown under these categories (none = every category via keyword)</div>
          <div className="chips">
            {CATEGORIES.map((c) => (
              <button key={c.id} type="button" className={'chip' + (cats.includes(c.id) ? ' on' : '')} onClick={() => setCats(cats.includes(c.id) ? cats.filter((x) => x !== c.id) : [...cats, c.id])}>{c.label}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="row end" style={{ marginTop: 12 }}>
        <button onClick={onDone}>Cancel</button>
        <button className="primary" onClick={submit}>Add source</button>
      </div>
    </div>
  );
}

/** Where wallpapers come from (shown inside Settings). */
export function Sources() {
  const state = useAppState();
  const [adding, setAdding] = useState(false);
  const sources = getSources(state);
  return (
    <div>
      <div className="row between">
        <h2>Sources</h2>
        {!adding && <button className="primary ibtn" onClick={() => setAdding(true)}><Icon name="plus" size={16} />Add source</button>}
      </div>
      <p className="muted">The six built-in sources work without any account or key. You can turn them off but not remove them. Custom sources are saved to your account and sync to your other devices.</p>
      {adding && <AddSource onDone={() => setAdding(false)} />}
      {sources.map((s) => <SourceRow key={s.id + JSON.stringify(s.options)} s={s} />)}
    </div>
  );
}
