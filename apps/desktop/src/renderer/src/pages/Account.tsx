import { useEffect, useState } from 'react';
import { DEFAULT_SERVER_URL, getAllDevices, type Device } from '@wallpepper/core';
import { getCtx } from '../ctx';
import { DeviceSettingsForm } from '../components';
import { useAppState, useSyncStatus } from '../hooks';
import { toast } from '../toast';

const ICON: Record<string, string> = { android: '📱', ios: '📱', windows: '🖥️', mac: '💻', linux: '🐧' };

function SignIn() {
  const { sync, store } = getCtx();
  const [server, setServer] = useState(store.state.local.auth?.serverUrl ?? DEFAULT_SERVER_URL);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async (mode: 'login' | 'register') => {
    setBusy(true);
    try {
      await sync.authenticate(mode, server, email, password);
      toast(mode === 'register' ? 'Account created.' : 'Signed in and synced.', 'ok');
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="source">
      <p className="muted">
        An account saves your wallpaper links and groups and syncs them to your other devices. Everything you saved before signing in is uploaded too.
      </p>
      <div className="form">
        <label>Sync server <input value={server} onChange={(e) => setServer(e.target.value)} placeholder="https://sync.example.com" /></label>
        <label>Email <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Password <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go('login')} /></label>
      </div>
      <div className="row end" style={{ marginTop: 12 }}>
        <button disabled={busy} onClick={() => go('register')}>Create account</button>
        <button className="primary" disabled={busy} onClick={() => go('login')}>Sign in</button>
      </div>
    </div>
  );
}

export function Account() {
  const state = useAppState();
  const { sync, store } = getCtx();
  const status = useSyncStatus();
  const [server, setServer] = useState<Device[]>([]);
  const [open, setOpen] = useState<string | null>(store.state.local.deviceId);
  const auth = state.local.auth;

  useEffect(() => {
    if (auth) sync.listDevices().then(setServer).catch(() => {});
  }, [auth, sync, state.local.lastSyncAt]);

  const devices = getAllDevices(state);
  return (
    <div className="page narrow">
      <h2>Account & Devices</h2>
      {!auth ? (
        <SignIn />
      ) : (
        <div className="source">
          <div className="row between wrap">
            <div>
              <strong>{auth.email}</strong>
              <div className="muted small">{auth.serverUrl}</div>
              <div className="muted small">
                {status.syncing ? 'Syncing…' : state.local.lastSyncAt ? `Last synced ${new Date(state.local.lastSyncAt).toLocaleTimeString()}` : 'Not synced yet'}
              </div>
              {status.error && <div className="warn small">{status.error}</div>}
            </div>
            <div className="row">
              <button onClick={() => sync.sync().then(() => toast('Synced.', 'ok')).catch((e) => toast(e.message, 'error'))}>Sync now</button>
              <button className="danger" onClick={() => confirm('Sign out? Your wallpapers stay on this device.') && sync.logout()}>Sign out</button>
            </div>
          </div>
        </div>
      )}

      <h3>Devices &amp; sync settings</h3>
      <p className="muted">
        Each device has its own settings. {auth ? 'Edit any device from here — for example show “anime” on your phone and “All” on this PC. Changes reach the other device on its next sync.' : 'Sign in to manage your other devices.'}
      </p>
      {devices.map((d) => {
        const seen = server.find((x) => x.id === d.id)?.lastSeen;
        return (
          <div className="source" key={d.id}>
            <div className="row between">
              <div>
                <strong>{ICON[d.settings.platform] ?? '📟'} {d.settings.name}</strong> {d.isThisDevice && <span className="tag">this device</span>}
                <div className="muted small">
                  {d.settings.platform} · {d.settings.mode === 'folder' ? 'folder mode' : 'sets wallpaper'}{seen ? ` · seen ${new Date(seen).toLocaleString()}` : ''}
                </div>
              </div>
              <div className="row">
                <button onClick={() => setOpen(open === d.id ? null : d.id)}>{open === d.id ? 'Hide' : 'Settings'}</button>
                {auth && !d.isThisDevice && (
                  <button className="danger" onClick={() => confirm(`Remove ${d.settings.name} from your account?`) && sync.removeDevice(d.id).catch((e) => toast(e.message, 'error'))}>Remove</button>
                )}
              </div>
            </div>
            {open === d.id && <div style={{ marginTop: 12 }}><DeviceSettingsForm deviceId={d.id} /></div>}
          </div>
        );
      })}
    </div>
  );
}
