import { useState, type ReactNode } from 'react';
import {
  addToGroup,
  ALL_GROUP_ID,
  createGroup,
  getGroups,
  getWallpaperGroupIds,
  isSaved,
  removeFromGroup,
  updateDeviceSettings,
  getDeviceSettings,
  type DeviceSettings,
  type Wallpaper,
} from '@wallpepper/core';
import { getCtx } from './ctx';
import { useAppState } from './hooks';
import { toast } from './toast';
import { uiDownload, uiSet } from './ui';

export function Modal({ onClose, children, wide }: { onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'modal' + (wide ? ' wide' : '')}>{children}</div>
    </div>
  );
}

/** "Add to group" dialog: tick groups, or create a new one. */
export function GroupDialog({ wallpaper, onClose }: { wallpaper: Wallpaper; onClose: () => void }) {
  const state = useAppState();
  const { store } = getCtx();
  const [name, setName] = useState('');
  const groups = getGroups(state);
  const memberOf = new Set(getWallpaperGroupIds(state, wallpaper.id));
  const saved = isSaved(state, wallpaper.id);

  const toggle = (id: string, on: boolean) => (on ? removeFromGroup(store, wallpaper.id, id) : addToGroup(store, wallpaper, id));
  const create = () => {
    try {
      const g = createGroup(store, name);
      addToGroup(store, wallpaper, g.id);
      setName('');
      toast(`Added to "${g.name}"`, 'ok');
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };
  return (
    <Modal onClose={onClose}>
      <h3>Add to group</h3>
      <label className="check">
        <input type="checkbox" checked={saved} onChange={() => toggle(ALL_GROUP_ID, saved)} /> All <span className="muted small">(library)</span>
      </label>
      {groups.map((g) => (
        <label key={g.id} className="check">
          <input type="checkbox" checked={memberOf.has(g.id)} onChange={() => toggle(g.id, memberOf.has(g.id))} /> {g.name}
        </label>
      ))}
      <div className="row" style={{ marginTop: 12 }}>
        <input placeholder="New group name…" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim() && create()} />
        <button className="primary" disabled={!name.trim()} onClick={create}>Create</button>
      </div>
      <div className="row end" style={{ marginTop: 16 }}><button onClick={onClose}>Done</button></div>
    </Modal>
  );
}

export function Preview({ wallpaper, onClose, onGroup }: { wallpaper: Wallpaper; onClose: () => void; onGroup: () => void }) {
  const { info } = getCtx();
  return (
    <Modal onClose={onClose} wide>
      <img className="preview-img" src={wallpaper.url} alt={wallpaper.title ?? ''} referrerPolicy="no-referrer" />
      <div className="row between" style={{ marginTop: 12 }}>
        <div>
          <div>{wallpaper.title ?? 'Wallpaper'}</div>
          <div className="muted small">
            {wallpaper.width && wallpaper.height ? `${wallpaper.width}×${wallpaper.height} · ` : ''}
            {wallpaper.sourceId}
            {wallpaper.pageUrl && (
              <> · <a href="#" onClick={(e) => { e.preventDefault(); void window.api.openExternal(wallpaper.pageUrl!); }}>source page</a></>
            )}
          </div>
        </div>
        <div className="row">
          <button className="primary" onClick={() => uiSet(wallpaper)}>Set wallpaper</button>
          {info.platform !== 'mac' && <button onClick={() => uiSet(wallpaper, 'lock')}>Set lock screen</button>}
          <button onClick={() => uiDownload(wallpaper)}>Download</button>
          <button onClick={onGroup}>＋ Group</button>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </Modal>
  );
}

export function WallpaperCard({
  wallpaper, onOpen, onGroup, extra,
}: { wallpaper: Wallpaper; onOpen: () => void; onGroup: () => void; extra?: ReactNode }) {
  const state = useAppState();
  const saved = isSaved(state, wallpaper.id);
  const downloaded = !!state.local.downloads[wallpaper.id];
  return (
    <div className="card">
      <img src={wallpaper.thumb} loading="lazy" referrerPolicy="no-referrer" alt={wallpaper.title ?? ''} onClick={onOpen} />
      <div className="badges">
        {saved && <span title="In your library">★</span>}
        {downloaded && <span title="Downloaded on this device">⬇</span>}
      </div>
      <div className="card-actions">
        <button title="Set as wallpaper" onClick={() => uiSet(wallpaper)}>Set</button>
        <button title="Download" onClick={() => uiDownload(wallpaper)}>⬇</button>
        <button title="Add to group" onClick={onGroup}>＋</button>
        {extra}
      </div>
    </div>
  );
}

export function GroupSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const state = useAppState();
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value={ALL_GROUP_ID}>All</option>
      {getGroups(state).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
    </select>
  );
}

/**
 * Edits the settings of ANY device in the account. Changes sync, so the phone can be told to
 * show "anime" while the PC shows "All".
 */
export function DeviceSettingsForm({ deviceId }: { deviceId: string }) {
  const state = useAppState();
  const { store } = getCtx();
  const s = getDeviceSettings(state, deviceId);
  if (!s) return null;
  const set = (patch: Partial<DeviceSettings>) => updateDeviceSettings(store, deviceId, patch);
  const mobile = s.platform === 'android' || s.platform === 'ios';
  return (
    <div className="form">
      <label>Device name <input value={s.name} onChange={(e) => set({ name: e.target.value })} /></label>
      <label>Wallpaper group (theme)<GroupSelect value={s.activeGroupId} onChange={(id) => set({ activeGroupId: id })} /></label>
      <label>
        When setting a wallpaper
        <select value={s.mode} onChange={(e) => set({ mode: e.target.value as DeviceSettings['mode'] })}>
          <option value="apply">Let Wallpepper set the wallpaper</option>
          <option value="folder">Only download into the OS wallpaper folder</option>
        </select>
      </label>
      {s.mode === 'apply' && (
        <label>
          Apply to
          <select value={s.target} onChange={(e) => set({ target: e.target.value as DeviceSettings['target'] })}>
            <option value="both">{mobile ? 'Home & lock screen' : 'Desktop & lock screen'}</option>
            <option value="home">{mobile ? 'Home screen' : 'Desktop'} only</option>
            <option value="lock">Lock screen only</option>
          </select>
        </label>
      )}
      <label className="check">
        <input type="checkbox" checked={s.rotationEnabled} onChange={(e) => set({ rotationEnabled: e.target.checked })} />
        Automatically switch wallpaper {s.mode === 'folder' && <span className="muted small">(folder mode: the OS rotates; Wallpepper keeps the folder filled)</span>}
      </label>
      {s.rotationEnabled && s.mode === 'apply' && (
        <div className="row">
          <label>Every
            <select value={s.rotationMinutes} onChange={(e) => set({ rotationMinutes: Number(e.target.value) })}>
              {[5, 15, 30, 60, 180, 360, 720, 1440].map((m) => <option key={m} value={m}>{m >= 60 ? `${m / 60} h` : `${m} min`}</option>)}
            </select>
          </label>
          <label>Order
            <select value={s.rotationOrder} onChange={(e) => set({ rotationOrder: e.target.value as DeviceSettings['rotationOrder'] })}>
              <option value="shuffle">Shuffle</option>
              <option value="sequential">In order</option>
            </select>
          </label>
        </div>
      )}
      <label className="check">
        <input type="checkbox" checked={s.syncEnabled} onChange={(e) => set({ syncEnabled: e.target.checked })} />
        Sync this device with the account
      </label>
    </div>
  );
}
