import { useEffect, useState } from 'react';
import { getAllDevices, type Device } from '@wallpepper/core';
import { AuthForm } from '../AuthForm';
import { getCtx } from '../ctx';
import { DeviceSettingsForm, Icon } from '../components';
import { useAppState, useSyncStatus } from '../hooks';
import { toast } from '../toast';

const ICON: Record<string, 'devices' | 'monitor'> = { android: 'devices', ios: 'devices' };

function SignIn() {
  return (
    <div className="source">
      <p className="muted">An account saves your wallpaper links and groups and syncs them to your other devices. Everything you saved before signing in is uploaded too.</p>
      <AuthForm initial="login" />
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
    if (auth) {
      sync.listDevices().then(setServer).catch(() => {});
      if (!auth.username) sync.refreshProfile().catch(() => {});
    }
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
              <strong>{auth.username ? `@${auth.username}` : auth.email}</strong>
              <div className="muted small">{auth.username ? auth.email : 'No username yet: you can set one when you share a group.'}</div>
              <div className="muted small">
                {status.syncing ? 'Syncing…' : state.local.lastSyncAt ? `Last synced ${new Date(state.local.lastSyncAt).toLocaleTimeString()}` : 'Not synced yet'}
              </div>
              {status.error && <div className="warn small">{status.error}</div>}
            </div>
            <div className="row">
              <button className="ibtn" onClick={() => sync.sync().then(() => toast('Synced.', 'ok')).catch((e) => toast(e.message, 'error'))}><Icon name="refresh" size={16} />Sync now</button>
              <button className="danger ibtn" onClick={() => confirm('Sign out? Your wallpapers stay on this device.') && sync.logout()}><Icon name="logOut" size={16} />Sign out</button>
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
                <strong className="row" style={{ display: 'inline-flex' }}><Icon name={ICON[d.settings.platform] ?? 'monitor'} size={16} />{d.settings.name}</strong> {d.isThisDevice && <span className="tag">this device</span>}
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
