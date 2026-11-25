import { useState } from 'react';
import type { IconName } from '@wallpepper/core';
import { Account } from './pages/Account';
import { Browse } from './pages/Browse';
import { Home } from './pages/Home';
import { Library } from './pages/Library';
import { Onboarding } from './pages/Onboarding';
import { Settings } from './pages/Settings';
import { Icon } from './components';
import { CompatHost } from './compat';
import { useAppState } from './hooks';
import { useToasts } from './toast';
import { UpdateButton, useUpdateListeners } from './update';

const PAGES: { id: string; label: string; icon: IconName }[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'browse', label: 'Browse', icon: 'browse' },
  { id: 'library', label: 'Library', icon: 'library' },
  { id: 'account', label: 'Account & Devices', icon: 'devices' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

export function App() {
  const [page, setPage] = useState<string>('home');
  const state = useAppState();
  const toasts = useToasts();
  useUpdateListeners();
  const toastList = (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={'toast ' + t.kind}>{t.text}</div>
      ))}
    </div>
  );

  // First run: info slides, account, wallpaper engine, fit.
  if (!state.local.onboarded) {
    return <><Onboarding />{toastList}</>;
  }

  return (
    <div className="shell">
      <nav className="sidebar">
        <div className="brand">Wallpepper</div>
        {PAGES.map((p) => (
          <button key={p.id} className={'nav' + (page === p.id ? ' active' : '')} onClick={() => setPage(p.id)}>
            <Icon name={p.icon} size={18} /> {p.label}
          </button>
        ))}
        <div className="spacer" />
        <UpdateButton compact />
        <div className="muted small">{state.local.auth ? `Signed in as ${state.local.auth.username ? '@' + state.local.auth.username : state.local.auth.email}` : 'Not signed in'}</div>
      </nav>
      <main className="content">
        {/* Home and Browse stay mounted so scroll position, filters and results survive page switches. */}
        <div style={{ display: page === 'home' ? 'block' : 'none' }}><Home /></div>
        <div style={{ display: page === 'browse' ? 'block' : 'none' }}><Browse /></div>
        {page === 'library' && <Library />}
        {page === 'account' && <Account />}
        {page === 'settings' && <Settings />}
      </main>
      <CompatHost />
      {toastList}
    </div>
  );
}
