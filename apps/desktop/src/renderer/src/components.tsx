import { useState, type CSSProperties, type ReactNode } from 'react';
import {
  addToGroup,
  ALL_GROUP_ID,
  cardView,
  createGroup,
  deviceShape,
  FIT_MODES,
  getDeviceSettings,
  getGroupPath,
  getGroupTree,
  getWallpaperGroupIds,
  ICON_PATHS,
  isSaved,
  reapplyCurrent,
  removeFromGroup,
  thumbOf,
  updateDeviceSettings,
  type CardView,
  type DeviceSettings,
  type IconName,
  type Wallpaper,
} from '@wallpepper/core';
import { openCompat, startCompat } from './compat';
import { getCtx, img } from './ctx';
import { useAppState } from './hooks';
import { toast } from './toast';
import { uiDownload, uiSet } from './ui';

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {ICON_PATHS[name].map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

/** Button with an icon and an optional label. */
export function IconButton({ icon, label, title, ...rest }: { icon: IconName; label?: string; title?: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button title={title ?? label} aria-label={title ?? label} {...rest} className={'ibtn ' + (rest.className ?? '')}>
      <Icon name={icon} size={16} />
      {label && <span>{label}</span>}
    </button>
  );
}

/** Image served from the on-disk cache, so it shows instantly and without a connection once seen. */
export function CachedImg({ url, alt = '', className, onClick, style }: { url: string; alt?: string; className?: string; onClick?: () => void; style?: CSSProperties }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <div className={'img-fail ' + (className ?? '')}><Icon name="image" size={28} /></div>;
  return <img className={className} style={style} src={img(url)} loading="lazy" alt={alt} onClick={onClick} onError={() => setFailed(true)} />;
}

/**
 * Picture of a grid card: landscape pictures fill the card, portrait ones are shown whole over a blurred copy of
 * themselves, and a saved crop shows just that region.
 */
export function CardImage({ view, alt = '', onClick }: { view: CardView; alt?: string; onClick?: () => void }) {
  if (view.crop && view.aspect) {
    const c = view.crop;
    const r = view.aspect;
    return (
      <div className="card-crop" onClick={onClick}>
        <div className="card-crop-box" style={{ width: `max(100cqw, calc(100cqh * ${r}))`, height: `max(100cqh, calc(100cqw / ${r}))` }}>
          <CachedImg url={view.thumb} alt={alt} style={{ position: 'absolute', width: `${100 / c.w}%`, height: `${100 / c.h}%`, left: `${(-c.x / c.w) * 100}%`, top: `${(-c.y / c.h) * 100}%`, objectFit: 'fill' }} />
        </div>
      </div>
    );
  }
  if (view.mode === 'blur') {
    return (
      <>
        <CachedImg className="card-bg" url={view.thumb} />
        <CachedImg className="card-fit" url={view.thumb} alt={alt} onClick={onClick} />
      </>
    );
  }
  return <CachedImg url={view.thumb} alt={alt} onClick={onClick} />;
}

export function Modal({ onClose, children, wide }: { onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'modal' + (wide ? ' wide' : '')}>{children}</div>
    </div>
  );
}

/** Options for a group picker; sub-groups show their path ("Anime › Naruto"). */
export function useGroupOptions(rootLabel?: string) {
  const state = useAppState();
  const top = rootLabel === undefined ? { value: ALL_GROUP_ID, label: 'All' } : { value: '', label: rootLabel };
  return [top, ...getGroupTree(state).map(({ group }) => ({ value: group.id, label: getGroupPath(state, group.id).join(' › ') }))];
}

export function GroupSelect({ value, onChange, rootLabel }: { value: string; onChange: (id: string) => void; rootLabel?: string }) {
  const options = useGroupOptions(rootLabel);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

/** "Add to group" dialog: tick groups (sub-groups indented), or create a new group / sub-group. */
export function GroupDialog({ wallpaper, onClose }: { wallpaper: Wallpaper; onClose: () => void }) {
  const state = useAppState();
  const { store } = getCtx();
  const [name, setName] = useState('');
  const [parent, setParent] = useState('');
  const memberOf = new Set(getWallpaperGroupIds(state, wallpaper.id));
  const saved = isSaved(state, wallpaper.id);

  const toggle = (id: string, on: boolean) => {
    if (on) return removeFromGroup(store, wallpaper.id, id);
    addToGroup(store, wallpaper, id);
    void startCompat(wallpaper); // measures the image, then asks how it should look in the other orientation
  };
  const create = () => {
    try {
      const g = createGroup(store, name, { parentId: parent || undefined });
      addToGroup(store, wallpaper, g.id);
      void startCompat(wallpaper);
      setName('');
      toast(`Added to "${getGroupPath(store.state, g.id).join(' › ')}"`, 'ok');
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
      {getGroupTree(state).map(({ group, depth }) => (
        <label key={group.id} className="check" style={{ paddingLeft: depth * 20 }}>
          <input type="checkbox" checked={memberOf.has(group.id)} onChange={() => toggle(group.id, memberOf.has(group.id))} /> {group.name}
        </label>
      ))}
      <div className="form" style={{ marginTop: 12 }}>
        <label>New group goes in<GroupSelect value={parent} onChange={setParent} rootLabel="Top level" /></label>
        <div className="row">
          <input placeholder="New group name…" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim() && create()} />
          <button className="primary" disabled={!name.trim()} onClick={create}>Create</button>
        </div>
      </div>
      <div className="row end" style={{ marginTop: 16 }}><button onClick={onClose}>Done</button></div>
    </Modal>
  );
}

export function Preview({ wallpaper, onClose, onGroup }: { wallpaper: Wallpaper; onClose: () => void; onGroup: () => void }) {
  const { info } = getCtx();
  const state = useAppState();
  return (
    <Modal onClose={onClose} wide>
      <div className="preview-wrap">
        <CachedImg className="preview-img" url={thumbOf(wallpaper)} alt="" />
        <CachedImg className="preview-img top" url={wallpaper.url} alt={wallpaper.title ?? ''} />
      </div>
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
        <div className="row wrap">
          <button className="primary ibtn" onClick={() => uiSet(wallpaper)}><Icon name="image" size={16} />Set wallpaper</button>
          {info.platform !== 'mac' && <button className="ibtn" onClick={() => uiSet(wallpaper, 'lock')}><Icon name="lock" size={16} />Lock screen</button>}
          <button className="primary ibtn" onClick={onGroup}><Icon name="folderPlus" size={16} />Group</button>
          <IconButton icon="download" label="Download" onClick={() => uiDownload(wallpaper)} />
          {isSaved(state, wallpaper.id) && <IconButton icon="sliders" label="Check compatibility" onClick={() => openCompat(wallpaper)} />}
          <IconButton icon="close" label="Close" onClick={onClose} />
        </div>
      </div>
    </Modal>
  );
}

export function WallpaperCard({
  wallpaper, onOpen, onGroup, extra, asOnDevice,
}: {
  wallpaper: Wallpaper; onOpen: () => void; onGroup: () => void; extra?: ReactNode;
  /** Show the version this device gets (its compatibility choice) instead of the original picture. */
  asOnDevice?: boolean;
}) {
  const state = useAppState();
  const saved = isSaved(state, wallpaper.id);
  const downloaded = !!state.local.downloads[wallpaper.id];
  const view = cardView(wallpaper, deviceShape(getDeviceSettings(state)?.platform), asOnDevice ? state : undefined);
  return (
    <div className="card">
      <CardImage view={view} alt={wallpaper.title ?? ''} onClick={onOpen} />
      <div className="badges">
        {saved && <span title="In your library"><Icon name="star" size={12} /></span>}
        {downloaded && <span title="Downloaded on this device"><Icon name="download" size={12} /></span>}
      </div>
      <div className="card-actions">
        <button className="ibtn" title="Set as wallpaper" onClick={() => uiSet(wallpaper)}><Icon name="image" size={15} />Set</button>
        <IconButton icon="download" title="Download" onClick={() => uiDownload(wallpaper)} />
        <IconButton icon="folderPlus" title="Add to group" className="accent" onClick={onGroup} />
        {extra}
      </div>
    </div>
  );
}

/**
 * Edits the settings of ANY device in the account. Changes sync, so the phone can be told to
 * show "anime" while the PC shows "All".
 */
export function DeviceSettingsForm({ deviceId }: { deviceId: string }) {
  const state = useAppState();
  const { store, platform } = getCtx();
  const s = getDeviceSettings(state, deviceId);
  if (!s) return null;
  const set = (patch: Partial<DeviceSettings>) => updateDeviceSettings(store, deviceId, patch);
  /** Changes that affect how the wallpaper looks are applied right away on this computer. */
  const setNow = (patch: Partial<DeviceSettings>) => {
    set(patch);
    if (deviceId !== store.state.local.deviceId) return;
    reapplyCurrent(store, platform)
      .then((done) => done && toast('Applied to your wallpaper.', 'ok'))
      .catch((e) => toast(e?.message ?? 'Could not apply the change', 'error'));
  };
  const mobile = s.platform === 'android' || s.platform === 'ios';
  const fits = FIT_MODES.filter((f) => !(mobile && f.desktopOnly));
  const fit = fits.find((f) => f.id === (s.fit ?? 'fill')) ?? fits[0];
  return (
    <div className="form">
      <label>Device name <input value={s.name} onChange={(e) => set({ name: e.target.value })} /></label>
      <label>Wallpaper group (theme)<GroupSelect value={s.activeGroupId} onChange={(id) => set({ activeGroupId: id })} /></label>
      <label>
        Who changes the wallpaper
        <select value={s.mode} onChange={(e) => set({ mode: e.target.value as DeviceSettings['mode'] })}>
          <option value="apply">Wallpepper (recommended)</option>
          <option value="folder">My {mobile ? 'phone / gallery' : 'system'}: only save into the wallpaper folder</option>
        </select>
      </label>
      {s.mode === 'apply' && (
        <>
          <label>
            Apply to
            <select value={s.target} onChange={(e) => setNow({ target: e.target.value as DeviceSettings['target'] })}>
              <option value="both">{mobile ? 'Home & lock screen' : 'Desktop & lock screen'}</option>
              <option value="home">{mobile ? 'Home screen' : 'Desktop'} only</option>
              <option value="lock">Lock screen only</option>
            </select>
          </label>
          <label>
            Fit
            <select value={fit.id} onChange={(e) => setNow({ fit: e.target.value as DeviceSettings['fit'] })}>
              {fits.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
            <span className="muted small">{fit.hint}</span>
          </label>
        </>
      )}
      <label className="check">
        <input type="checkbox" checked={s.rotationEnabled} onChange={(e) => set({ rotationEnabled: e.target.checked })} />
        Change the wallpaper automatically {s.mode === 'folder' ? <span className="muted small">(your system rotates the folder; Wallpepper keeps it filled)</span> : <span className="muted small">(off = keep the one you set)</span>}
      </label>
      {!mobile && s.mode === 'apply' && (
        <label>
          Several displays
          <select value={s.perDisplay === false ? 'same' : 'different'} onChange={(e) => setNow({ perDisplay: e.target.value === 'different' })}>
            <option value="different">A different wallpaper on each display</option>
            <option value="same">The same wallpaper on every display</option>
          </select>
          <span className="muted small">Used by automatic changes and “Change wallpaper”. “Set wallpaper” always puts that one picture on every display. Not used with Span.</span>
        </label>
      )}
      {s.rotationEnabled && s.mode === 'apply' && (
        <div className="row">
          <label>Every
            <select value={s.rotationMinutes} onChange={(e) => set({ rotationMinutes: Number(e.target.value) })}>
              {(mobile ? [15, 30, 60, 180, 360, 720, 1440] : [1, 5, 15, 30, 60, 180, 360, 720, 1440]).map((m) => <option key={m} value={m}>{m >= 60 ? `${m / 60} h` : `${m} min`}</option>)}
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
