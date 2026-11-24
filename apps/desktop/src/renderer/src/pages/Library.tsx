import { useState } from 'react';
import {
  ALL_GROUP_ID,
  createGroup,
  deleteGroup,
  getDeviceSettings,
  getGroupCounts,
  getGroups,
  getGroupWallpapers,
  removeFromGroup,
  renameGroup,
  rotateNow,
  updateDeviceSettings,
  type Wallpaper,
} from '@wallpepper/core';
import { getCtx } from '../ctx';
import { GroupDialog, Preview, WallpaperCard } from '../components';
import { useAppState } from '../hooks';
import { toast } from '../toast';

export function Library() {
  const state = useAppState();
  const { store, platform } = getCtx();
  const [groupId, setGroupId] = useState(ALL_GROUP_ID);
  const [newName, setNewName] = useState('');
  const [preview, setPreview] = useState<Wallpaper | null>(null);
  const [grouping, setGrouping] = useState<Wallpaper | null>(null);

  const groups = getGroups(state);
  const counts = getGroupCounts(state);
  const current = groupId === ALL_GROUP_ID || groups.some((g) => g.id === groupId) ? groupId : ALL_GROUP_ID;
  const items = getGroupWallpapers(state, current);
  const group = groups.find((g) => g.id === current);
  const active = getDeviceSettings(state).activeGroupId === current;

  const create = () => {
    try {
      const g = createGroup(store, newName);
      setNewName('');
      setGroupId(g.id);
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  return (
    <div className="page split">
      <aside className="groups">
        <h3>Groups</h3>
        {[{ id: ALL_GROUP_ID, name: 'All' }, ...groups].map((g) => (
          <button key={g.id} className={'group' + (current === g.id ? ' on' : '')} onClick={() => setGroupId(g.id)}>
            <span>{g.name}</span>
            <span className="muted small">{counts[g.id] ?? 0}</span>
          </button>
        ))}
        <div className="row" style={{ marginTop: 12 }}>
          <input placeholder="New group" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && newName.trim() && create()} />
          <button disabled={!newName.trim()} onClick={create}>＋</button>
        </div>
      </aside>

      <section className="grow">
        <div className="row between wrap" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>{group?.name ?? 'All'} <span className="muted small">{items.length} wallpapers</span></h2>
          <div className="row wrap">
            <button
              className={active ? '' : 'primary'}
              disabled={active}
              onClick={() => { updateDeviceSettings(store, store.state.local.deviceId, { activeGroupId: current }); toast('This device now uses this group.', 'ok'); }}
            >
              {active ? '✓ Used on this device' : 'Use on this device'}
            </button>
            <button disabled={!items.length} onClick={() => rotateNow(store, platform).then((w) => w && toast(`Switched to ${w.title ?? 'next wallpaper'}`, 'ok')).catch((e) => toast(e.message, 'error'))}>
              Next wallpaper
            </button>
            {group && (
              <>
                <button onClick={() => { const n = prompt('Rename group', group.name); if (n) renameGroup(store, group.id, n); }}>Rename</button>
                <button className="danger" onClick={() => { if (confirm(`Delete group "${group.name}"? Wallpapers stay in All.`)) deleteGroup(store, group.id); }}>Delete</button>
              </>
            )}
          </div>
        </div>

        {!items.length && (
          <div className="empty">
            {current === ALL_GROUP_ID
              ? 'Nothing here yet. Download a wallpaper or add one to a group from Browse and it shows up here.'
              : 'This group is empty. Use ＋ on any wallpaper to add it here.'}
          </div>
        )}
        <div className="grid">
          {items.map((w) => (
            <WallpaperCard
              key={w.id}
              wallpaper={w}
              onOpen={() => setPreview(w)}
              onGroup={() => setGrouping(w)}
              extra={
                <button className="danger" title={current === ALL_GROUP_ID ? 'Remove from library' : 'Remove from group'} onClick={() => removeFromGroup(store, w.id, current)}>✕</button>
              }
            />
          ))}
        </div>
      </section>

      {preview && <Preview wallpaper={preview} onClose={() => setPreview(null)} onGroup={() => setGrouping(preview)} />}
      {grouping && <GroupDialog wallpaper={grouping} onClose={() => setGrouping(null)} />}
    </div>
  );
}
