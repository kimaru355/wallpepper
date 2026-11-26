import { useEffect, useState } from 'react';
import {
  ALL_GROUP_ID,
  createGroup,
  deleteGroup,
  ensureDimensions,
  folderForGroup,
  getDeviceSettings,
  getGroupCounts,
  getGroupPath,
  getGroups,
  getGroupSubtreeIds,
  getGroupTree,
  getGroupWallpapers,
  needsCompat,
  removeFromGroup,
  shapeOf,
  renameGroup,
  rotateNow,
  updateDeviceSettings,
  type Wallpaper,
} from '@wallpepper/core';
import { openCompat } from '../compat';
import { getCtx } from '../ctx';
import { GroupDialog, Icon, IconButton, Preview, WallpaperCard } from '../components';
import { probeImage } from '../render';
import { useAppState } from '../hooks';
import { toast } from '../toast';
import { ShareDialog } from './Home';

export function Library() {
  const state = useAppState();
  const { store, platform } = getCtx();
  const [groupId, setGroupId] = useState(ALL_GROUP_ID);
  const [newName, setNewName] = useState('');
  const [asSub, setAsSub] = useState(true);
  const [preview, setPreview] = useState<Wallpaper | null>(null);
  const [grouping, setGrouping] = useState<Wallpaper | null>(null);
  const [sharing, setSharing] = useState(false);
  const [fixing, setFixing] = useState(false);

  const groups = getGroups(state);
  const counts = getGroupCounts(state);
  const group = groups.find((g) => g.id === groupId);
  const current = group ? group.id : ALL_GROUP_ID;
  const items = getGroupWallpapers(state, current);
  const settings = getDeviceSettings(state);
  const active = settings.activeGroupId === current;
  const path = group ? getGroupPath(state, group.id) : [];
  const pending = needsCompat(state, getGroupWallpapers(state, ALL_GROUP_ID));
  const folder = [state.local.folderPath, ...folderForGroup(state, current)].join(/\\/.test(state.local.folderPath) ? '\\' : '/');

  const create = () => {
    try {
      const g = createGroup(store, newName, { parentId: asSub && group ? group.id : undefined, category: asSub ? group?.category : undefined });
      setNewName('');
      setGroupId(g.id);
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  if (fixing) return <FixCompat onBack={() => setFixing(false)} />;

  return (
    <div className="page split">
      <aside className="groups">
        <h3>Groups</h3>
        <button className={'group' + (current === ALL_GROUP_ID ? ' on' : '')} onClick={() => setGroupId(ALL_GROUP_ID)}>
          <span>All</span><span className="muted small">{counts[ALL_GROUP_ID] ?? 0}</span>
        </button>
        {getGroupTree(state).map(({ group: g, depth }) => (
          <button key={g.id} className={'group' + (current === g.id ? ' on' : '')} style={{ paddingLeft: 12 + depth * 18 }} onClick={() => setGroupId(g.id)}>
            <span className="row" style={{ gap: 6 }}><Icon name={depth ? 'chevronRight' : 'folder'} size={13} />{g.name}</span>
            <span className="muted small">{counts[g.id] ?? 0}</span>
          </button>
        ))}
        <div className="form" style={{ marginTop: 12 }}>
          <div className="row">
            <input placeholder={group && asSub ? `Sub-group of ${group.name}` : 'New group'} value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && newName.trim() && create()} />
            <IconButton icon="plus" title="Create" disabled={!newName.trim()} onClick={create} />
          </div>
          {group && <label className="check small"><input type="checkbox" checked={asSub} onChange={(e) => setAsSub(e.target.checked)} />Inside “{group.name}”</label>}
        </div>
      </aside>

      <section className="grow">
        <div className="row between wrap" style={{ marginBottom: 12 }}>
          <div>
            <h2 style={{ margin: 0 }}>{path.length ? path.join(' › ') : 'All'} <span className="muted small">{items.length} wallpapers</span></h2>
            {group && <div className="muted small">Includes its sub-groups</div>}
          </div>
          <div className="row wrap">
            <button
              className={'ibtn' + (active ? '' : ' primary')}
              disabled={active}
              onClick={() => { updateDeviceSettings(store, store.state.local.deviceId, { activeGroupId: current }); toast('This device now uses this group.', 'ok'); }}
            >
              <Icon name={active ? 'check' : 'monitor'} size={16} />{active ? 'Used on this device' : 'Use on this device'}
            </button>
            <button className="ibtn" disabled={!items.length} onClick={() => rotateNow(store, platform).then((w) => w && toast(`Switched to ${w.title ?? 'next wallpaper'}`, 'ok')).catch((e) => toast(e.message, 'error'))}>
              <Icon name="refresh" size={16} />Next wallpaper
            </button>
            {group && (
              <>
                <IconButton icon="upload" label="Share" onClick={() => setSharing(true)} />
                <IconButton icon="edit" label="Rename" onClick={() => { const n = prompt('Rename group', group.name); if (n) { try { renameGroup(store, group.id, n); } catch (e: any) { toast(e.message, 'error'); } } }} />
                <button
                  className="danger ibtn"
                  onClick={() => {
                    const subs = getGroupSubtreeIds(state, group.id).size - 1;
                    if (confirm(`Delete group "${group.name}"${subs ? ` and its ${subs} sub-group${subs === 1 ? '' : 's'}` : ''}? Wallpapers stay in All.`)) {
                      deleteGroup(store, group.id);
                      setGroupId(group.parentId ?? ALL_GROUP_ID);
                    }
                  }}
                ><Icon name="trash" size={16} />Delete</button>
              </>
            )}
          </div>
        </div>
        {pending.length > 0 && (
          <div className="notice row between wrap">
            <span>
              <Icon name="sliders" size={14} /> {pending.length} wallpaper{pending.length === 1 ? ' has' : 's have'} no version for the other screen shape yet
              (phones are portrait, computers landscape).
            </span>
            <button className="primary ibtn" onClick={() => setFixing(true)}><Icon name="chevronRight" size={16} />Review &amp; fix</button>
          </div>
        )}
        {settings.mode === 'folder' && (
          <div className="notice">Your system changes the wallpaper. Point its slideshow at <code>{folder}</code> to use exactly this selection.</div>
        )}

        {!items.length && (
          <div className="empty">
            {current === ALL_GROUP_ID
              ? 'Nothing here yet. Download a wallpaper or add one to a group from Browse and it shows up here.'
              : 'This group is empty. Use the group button on any wallpaper to add it here.'}
          </div>
        )}
        <div className="grid">
          {items.map((w) => (
            <WallpaperCard
              key={w.id}
              wallpaper={w}
              onOpen={() => setPreview(w)}
              onGroup={() => setGrouping(w)}
              asOnDevice
              extra={
                <button className="danger ibtn" title={current === ALL_GROUP_ID ? 'Remove from library' : 'Remove from group'} onClick={() => removeFromGroup(store, w.id, current)}><Icon name="close" size={15} /></button>
              }
            />
          ))}
        </div>
      </section>

      {preview && <Preview wallpaper={preview} onClose={() => setPreview(null)} onGroup={() => setGrouping(preview)} />}
      {grouping && <GroupDialog wallpaper={grouping} onClose={() => setGrouping(null)} />}
      {sharing && group && <ShareDialog groupId={group.id} onClose={() => setSharing(false)} />}
    </div>
  );
}

/** Saved wallpapers without a version for the other orientation, each with a button that opens the compatibility dialog. */
function FixCompat({ onBack }: { onBack: () => void }) {
  const state = useAppState();
  const { store } = getCtx();
  const items = needsCompat(state, getGroupWallpapers(state, ALL_GROUP_ID));
  const [preview, setPreview] = useState<Wallpaper | null>(null);
  const [grouping, setGrouping] = useState<Wallpaper | null>(null);

  // pictures whose size the source did not send: measure them, square ones then drop off the list
  useEffect(() => {
    for (const w of items) if (shapeOf(w) === 'unknown') void ensureDimensions(store, w.id, probeImage);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="page narrow">
      <button className="ibtn" style={{ marginBottom: 12 }} onClick={onBack}><Icon name="chevronLeft" size={16} />Library</button>
      <h2 style={{ marginTop: 0 }}>Compatibility <span className="muted small">{items.length} to fix</span></h2>
      <p className="muted small">
        These wallpapers only suit one screen shape. Choose how each should look on the other one: another picture of the same
        thing, a crop, or the whole picture on a blurred background. Until then the blurred background is used.
      </p>
      {!items.length && <div className="empty">All set: every wallpaper has a version for phones and for computers.</div>}
      <div className="fix-list">
        {items.map((w) => {
          const shape = shapeOf(w);
          return (
            <div key={w.id} className="fix-row">
              <WallpaperCard wallpaper={w} onOpen={() => setPreview(w)} onGroup={() => setGrouping(w)} />
              <div className="grow">
                <div>{w.title ?? 'Wallpaper'}</div>
                <div className="muted small">
                  {shape === 'unknown' ? 'Size not known yet' : `${shape === 'portrait' ? 'Portrait' : 'Landscape'} · needs a version for ${shape === 'portrait' ? 'computers' : 'phones'}`}
                </div>
              </div>
              <button className="primary ibtn" onClick={() => openCompat(w)}><Icon name="sliders" size={16} />Fix</button>
            </div>
          );
        })}
      </div>
      {preview && <Preview wallpaper={preview} onClose={() => setPreview(null)} onGroup={() => setGrouping(preview)} />}
      {grouping && <GroupDialog wallpaper={grouping} onClose={() => setGrouping(null)} />}
    </div>
  );
}
