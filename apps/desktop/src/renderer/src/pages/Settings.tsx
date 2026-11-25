import { useEffect, useState } from 'react';
import { folderForGroup, getDeviceSettings, rotateNow } from '@wallpepper/core';
import { getCtx } from '../ctx';
import { DeviceSettingsForm, Icon } from '../components';
import { useAppState } from '../hooks';
import { toast } from '../toast';
import { checkNow, UpdateButton, useUpdate } from '../update';
import { Sources } from './Sources';

const mb = (n: number) => `${(n / 1048576).toFixed(n > 1e8 ? 0 : 1)} MB`;

export function Settings() {
  const state = useAppState();
  const { store, platform, info } = getCtx();
  const [page, setPage] = useState<'main' | 'sources'>('main');
  const [autostart, setAutostart] = useState(info.autostart);
  const [tray, setTray] = useState(info.closeToTray);
  const [cacheSize, setCacheSize] = useState(0);
  const update = useUpdate();
  const s = getDeviceSettings(state);
  const folder = state.local.folderPath;
  const sep = /\\/.test(folder) ? '\\' : '/';
  const groupFolder = [folder, ...folderForGroup(state, s.activeGroupId)].join(sep);

  useEffect(() => { void window.api.imageCacheSize().then(setCacheSize); }, []);

  if (page === 'sources') {
    return (
      <div className="page narrow">
        <button className="ibtn" style={{ marginBottom: 12 }} onClick={() => setPage('main')}><Icon name="chevronLeft" size={16} />Settings</button>
        <Sources />
      </div>
    );
  }

  return (
    <div className="page narrow">
      <h2>Settings <span className="muted small">this device</span></h2>
      <div className="source">
        <DeviceSettingsForm deviceId={state.local.deviceId} />
      </div>

      <div className="source">
        <h3 style={{ marginTop: 0 }}>Wallpaper folder</h3>
        <p className="muted small">
          {s.mode === 'folder'
            ? 'Your system changes the wallpaper: downloads land here in one folder per group (Anime/Naruto). Point your OS wallpaper slideshow at the folder you want: the main folder has everything, a group folder only that group and its sub-groups.'
            : 'Downloaded wallpapers are saved here, in one folder per group.'}
        </p>
        <div className="row">
          <input className="grow" readOnly value={folder} />
          <button onClick={async () => { const p = await window.api.pickFolder(); if (p) store.setLocal({ folderPath: p, downloadDirs: {} }); }}>Change…</button>
          <button onClick={() => void window.api.showItem(folder)}>Open</button>
        </div>
        {s.mode === 'folder' && (
          <p className="small" style={{ marginBottom: 0 }}>For the group this device uses now, point your slideshow at: <code>{groupFolder}</code></p>
        )}
      </div>

      <div className="source">
        <h3 style={{ marginTop: 0 }}>App</h3>
        <label className="check">
          <input type="checkbox" checked={autostart} onChange={async (e) => { setAutostart(e.target.checked); await window.api.setAutostart(e.target.checked); }} />
          Start with the system (minimised to tray, so playlists keep running)
        </label>
        <label className="check">
          <input type="checkbox" checked={tray} onChange={async (e) => { setTray(e.target.checked); await window.api.setCloseToTray(e.target.checked); }} />
          Keep running in the tray when the window is closed
        </label>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="ibtn" onClick={() => rotateNow(store, platform).then((w) => toast(w ? 'Wallpaper changed.' : 'No wallpapers in the selected group yet.', w ? 'ok' : 'info')).catch((e) => toast(e.message, 'error'))}>
            <Icon name="refresh" size={16} />Change wallpaper now
          </button>
          <button disabled={update.checking} onClick={() => void checkNow(true)}>{update.checking ? 'Checking…' : 'Check for updates'}</button>
          <UpdateButton />
        </div>
        <p className="muted small">Wallpepper {info.version} · {info.platform}{update.available ? ` · version ${update.available.version} is available` : ''}</p>
      </div>

      <div className="source">
        <h3 style={{ marginTop: 0 }}>Sources</h3>
        <p className="muted small">Where wallpapers come from. Turn sources on or off, or add your own.</p>
        <button className="ibtn" onClick={() => setPage('sources')}><Icon name="globe" size={16} />Manage sources</button>
      </div>

      <div className="source">
        <h3 style={{ marginTop: 0 }}>Saved images</h3>
        <p className="muted small">Thumbnails you browse are kept on this computer so they load fast and still show without a connection ({mb(cacheSize)} used).</p>
        <button className="ibtn" onClick={async () => { await window.api.clearImageCache(); setCacheSize(0); toast('Saved images cleared.', 'ok'); }}><Icon name="trash" size={16} />Clear saved images</button>
      </div>
    </div>
  );
}
