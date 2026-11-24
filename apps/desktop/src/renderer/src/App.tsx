import { useState } from 'react';
import { Account } from './pages/Account';
import { Browse } from './pages/Browse';
import { Library } from './pages/Library';
import { Settings } from './pages/Settings';
import { Sources } from './pages/Sources';
import { useAppState } from './hooks';
import { useToasts } from './toast';
import { UpdateButton, useUpdateListeners } from './update';

const PAGES = [
  { id: 'browse', label: 'Browse', icon: '🔍' },
  { id: 'library', label: 'Library', icon: '🖼️' },
  { id: 'sources', label: 'Sources', icon: '🌐' },
  { id: 'account', label: 'Account & Devices', icon: '☁️' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
] as const;
type PageId = (typeof PAGES)[number]['id'];

export function App() {
  const [page, setPage] = useState<PageId>('browse');
  const state = useAppState();
  const toasts = useToasts();
  useUpdateListeners();
  return (
    <div className="shell">
      <nav className="sidebar">
        <div className="brand">Wallpepper</div>
        {PAGES.map((p) => (
          <button key={p.id} className={'nav' + (page === p.id ? ' active' : '')} onClick={() => setPage(p.id)}>
            <span>{p.icon}</span> {p.label}
          </button>
        ))}
        <div className="spacer" />
        <UpdateButton compact />
        <div className="muted small">{state.local.auth ? `Signed in as ${state.local.auth.email}` : 'Not signed in'}</div>
      </nav>
      <main className="content">
        {/* Browse stays mounted so scroll position and results survive page switches. */}
        <div style={{ display: page === 'browse' ? 'block' : 'none' }}><Browse /></div>
        {page === 'library' && <Library />}
        {page === 'sources' && <Sources />}
        {page === 'account' && <Account />}
        {page === 'settings' && <Settings />}
      </main>
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={'toast ' + t.kind}>{t.text}</div>
        ))}
      </div>
    </div>
  );
}
