import { useState } from 'react';
import { getDeviceSettings, rotateNow } from '@wallpepper/core';
import { getCtx } from '../ctx';
import { DeviceSettingsForm } from '../components';
import { useAppState } from '../hooks';
import { toast } from '../toast';

export function Settings() {
  const state = useAppState();
  const { store, platform, info } = getCtx();
  const [autostart, setAutostart] = useState(info.autostart);
  const [tray, setTray] = useState(info.closeToTray);
  const s = getDeviceSettings(state);
  const folder = state.local.folderPath;

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
            ? 'Folder mode is on: downloads land here. Point your OS wallpaper slideshow (Windows: Personalization › Background › Slideshow; GNOME/KDE/macOS: wallpaper folder) at this folder.'
            : 'Downloaded wallpapers are saved here.'}
        </p>
        <div className="row">
          <input className="grow" readOnly value={folder} />
          <button onClick={async () => { const p = await window.api.pickFolder(); if (p) store.setLocal({ folderPath: p }); }}>Change…</button>
          <button onClick={() => void window.api.showItem(folder)}>Open</button>
        </div>
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
          <button onClick={() => rotateNow(store, platform).then((w) => toast(w ? 'Wallpaper changed.' : 'No wallpapers in the selected group yet.', w ? 'ok' : 'info')).catch((e) => toast(e.message, 'error'))}>
            Change wallpaper now
          </button>
        </div>
        <p className="muted small">Wallpepper {info.version} · {info.platform}</p>
      </div>
    </div>
  );
}
