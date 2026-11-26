import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildCollection,
  CATEGORIES,
  cardView,
  cacheGet,
  cachedFetch,
  getGroupPath,
  getGroups,
  getGroupWallpapers,
  cachedRecommendations,
  importCollection,
  loadCover,
  loadRecommendations,
  saveRecommendedAsGroup,
  type CategoryId,
  type CommunityDetail,
  type CommunityFilters,
  type CommunitySort,
  type CommunitySummary,
  type Recommended,
  type Wallpaper,
} from '@wallpepper/core';
import { CachedImg, CardImage, GroupDialog, GroupSelect, Icon, IconButton, Modal, Preview, WallpaperCard } from '../components';
import { getCtx, makeBrowse } from '../ctx';
import { useAppState, useBrowseOf } from '../hooks';
import { toast } from '../toast';

export function Home() {
  const [tab, setTab] = useState<'recommended' | 'community'>('recommended');
  return (
    <div className="page">
      <div className="seg">
        <button className={tab === 'recommended' ? 'on' : ''} onClick={() => setTab('recommended')}><Icon name="star" size={16} />Recommended</button>
        <button className={tab === 'community' ? 'on' : ''} onClick={() => setTab('community')}><Icon name="users" size={16} />Community</button>
      </div>
      <div style={{ display: tab === 'recommended' ? 'block' : 'none' }}><RecommendedTab /></div>
      <div style={{ display: tab === 'community' ? 'block' : 'none' }}><CommunityTab /></div>
    </div>
  );
}

// ---------------------------------------------------------------- Recommended

function RecommendedTab() {
  const { store } = getCtx();
  const [category, setCategory] = useState<string>('all');
  const [open, setOpen] = useState<Recommended | null>(null);
  const [recs, setRecs] = useState<Recommended[]>(() => cachedRecommendations(store));
  const [status, setStatus] = useState<'loading' | 'ok' | 'offline' | 'error'>('loading');
  const list = useMemo(() => (category === 'all' ? recs : recs.filter((r) => r.category === category)), [category, recs]);
  const cats = useMemo(() => CATEGORIES.filter((c) => recs.some((r) => r.category === c.id)), [recs]);

  // The list is curated on the server; what was seen last time shows first (and offline).
  useEffect(() => {
    loadRecommendations(store, setRecs)
      .then((r) => { setRecs(r.items); setStatus(r.offline ? 'offline' : 'ok'); })
      .catch(() => setStatus('error'));
  }, [store]);
  if (open) return <CollectionView rec={open} onBack={() => setOpen(null)} />;
  return (
    <>
      <div className="chips" style={{ marginBottom: 14 }}>
        <button className={'chip main' + (category === 'all' ? ' on' : '')} onClick={() => setCategory('all')}>All</button>
        {cats.map((c) => (
          <button key={c.id} className={'chip' + (c.main ? ' main' : '') + (category === c.id ? ' on' : '')} onClick={() => setCategory(c.id)}>{c.label}</button>
        ))}
      </div>
      {status === 'offline' && <div className="notice">Offline: showing the last list you saw.</div>}
      {!list.length && <div className="empty">{status === 'loading' ? 'Loading recommendations…' : 'Could not load recommendations. Check your connection.'}</div>}
      <div className="grid rec">
        {list.map((r) => <RecCard key={r.id} rec={r} onOpen={() => setOpen(r)} />)}
      </div>
    </>
  );
}

function RecCard({ rec, onOpen }: { rec: Recommended; onOpen: () => void }) {
  const { store, http } = getCtx();
  const [cover, setCover] = useState<Wallpaper | null | undefined>(() => cacheGet<Wallpaper | null>(store, `cover|landscape|${rec.id}`)?.data);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let live = true;
    // load the cover only when the card scrolls into view
    const io = new IntersectionObserver((e) => {
      if (e[0].isIntersecting) {
        io.disconnect();
        loadCover(store, http, rec, 'landscape').then((w) => live && setCover(w));
      }
    }, { rootMargin: '300px' });
    io.observe(el);
    return () => { live = false; io.disconnect(); };
  }, [rec, store, http]);
  return (
    <button ref={ref} className="rec-card" onClick={onOpen}>
      {cover ? <CachedImg url={cover.thumb} /> : <div className="img-fail"><Icon name="image" size={28} /></div>}
      <div className="shade"><strong>{rec.title}</strong><span>{CATEGORIES.find((c) => c.id === rec.category)?.label}</span></div>
    </button>
  );
}

function CollectionView({ rec, onBack }: { rec: Recommended; onBack: () => void }) {
  const state = useAppState();
  const { store } = getCtx();
  const browse = useMemo(() => makeBrowse({ category: rec.category, query: rec.query, tag: rec.tag, sort: 'popular' }), [rec]);
  const b = useBrowseOf(browse);
  const [preview, setPreview] = useState<Wallpaper | null>(null);
  const [grouping, setGrouping] = useState<Wallpaper | null>(null);
  const [saving, setSaving] = useState(false);
  const [parent, setParent] = useState('');
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => { void browse.reload(); }, [browse]);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => e[0].isIntersecting && void browse.loadMore(), { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [browse, b.items.length]);

  const save = () => {
    try {
      const g = saveRecommendedAsGroup(store, rec, b.items, parent || undefined);
      toast(`Saved to ${getGroupPath(store.state, g.id).join(' › ')}`, 'ok');
      setSaving(false);
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };
  void state;
  return (
    <>
      <div className="row between" style={{ marginBottom: 12 }}>
        <div className="row">
          <IconButton icon="chevronLeft" label="Back" onClick={onBack} />
          <div><h2 style={{ margin: 0 }}>{rec.title}</h2><div className="muted small">{CATEGORIES.find((c) => c.id === rec.category)?.label} · recommended</div></div>
        </div>
        <button className="primary ibtn" disabled={!b.items.length} onClick={() => setSaving(true)}><Icon name="folderPlus" size={16} />Save as group</button>
      </div>
      {b.fromCache && <div className="notice">Showing saved results{b.loading ? ' · refreshing…' : ' (offline)'}</div>}
      {!b.fromCache && b.errors.map((e) => <div key={e.sourceId} className="notice">{e.sourceName}: {e.message}</div>)}
      {!b.loading && !b.items.length && !b.errors.length && <div className="empty">Nothing found for this title right now.</div>}
      <div className="grid">
        {b.items.map((w) => <WallpaperCard key={w.id} wallpaper={w} onOpen={() => setPreview(w)} onGroup={() => setGrouping(w)} />)}
      </div>
      <div ref={sentinel} className="sentinel">{b.loading ? 'Loading…' : ''}</div>
      {preview && <Preview wallpaper={preview} onClose={() => setPreview(null)} onGroup={() => setGrouping(preview)} />}
      {grouping && <GroupDialog wallpaper={grouping} onClose={() => setGrouping(null)} />}
      {saving && (
        <Modal onClose={() => setSaving(false)}>
          <h3>Save “{rec.title}” as a group</h3>
          <p className="muted small">The {Math.min(b.items.length, 80)} wallpapers shown are added to a sub-group. You can then use the whole group, or just this title, as your wallpaper.</p>
          <label className="form"><span className="muted small">Put it inside</span>
            <GroupSelect value={parent} onChange={setParent} rootLabel={`${CATEGORIES.find((c) => c.id === rec.category)?.label} (new top level group)`} />
          </label>
          <div className="row end" style={{ marginTop: 14 }}><button onClick={() => setSaving(false)}>Cancel</button><button className="primary" onClick={save}>Save</button></div>
        </Modal>
      )}
    </>
  );
}

// ---------------------------------------------------------------- Community

const SORTS: { value: CommunitySort; label: string }[] = [
  { value: 'new', label: 'Newest' },
  { value: 'popular', label: 'Most imported' },
  { value: 'largest', label: 'Largest' },
];

function CommunityTab() {
  const state = useAppState();
  const { sync, store } = getCtx();
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState<CommunityFilters>({ sort: 'new' });
  const [showFilters, setShowFilters] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [items, setItems] = useState<CommunitySummary[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const token = useRef(0);
  const username = state.local.auth?.username;
  const active = { ...filters, q: q.trim() || undefined };
  const key = 'community|' + JSON.stringify(active);

  const load = async (page: number) => {
    const my = ++token.current;
    setLoading(true);
    setError(null);
    try {
      const fetcher = () => sync.communityList({ ...active, page });
      if (page === 1) {
        const r = await cachedFetch(store, key, fetcher, (c) => my === token.current && (setItems(c.items), setNext(c.nextPage), setTotal(c.total)));
        if (my !== token.current) return;
        setItems(r.data.items); setNext(r.data.nextPage); setTotal(r.data.total); setOffline(r.offline);
      } else {
        const r = await fetcher();
        if (my !== token.current) return;
        setItems((prev) => [...prev, ...r.items.filter((x) => !prev.some((p) => p.id === x.id))]);
        setNext(r.nextPage);
      }
    } catch (e: any) {
      if (my === token.current) setError(e.message);
    } finally {
      if (my === token.current) setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => void load(1), q ? 350 : 0);
    return () => clearTimeout(t);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeFilters = [filters.user, filters.hasSubgroups, filters.minCount, filters.sort !== 'new'].filter(Boolean).length;

  return (
    <>
      <div className="toolbar" style={{ position: 'static' }}>
        <div className="row">
          <input className="grow" placeholder="Search collections, groups, sub-groups or creators…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="ibtn" onClick={() => setShowFilters((v) => !v)}><Icon name="sliders" size={16} />Filters{activeFilters ? ` (${activeFilters})` : ''}</button>
          <button className="ibtn" onClick={() => setSharing(true)}><Icon name="upload" size={16} />Share a group</button>
          <button className={'ibtn' + (username && filters.user === username ? ' primary' : '')} onClick={() => (username ? setFilters({ ...filters, user: filters.user === username ? '' : username }) : setSharing(true))}><Icon name="user" size={16} />My shares</button>
        </div>
        {showFilters && (
          <div className="filters">
            <label>Creator<input placeholder="username" value={filters.user ?? ''} onChange={(e) => setFilters({ ...filters, user: e.target.value })} /></label>
            <label>Sort by
              <select value={filters.sort ?? 'new'} onChange={(e) => setFilters({ ...filters, sort: e.target.value as CommunitySort })}>
                {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>
            <label>At least
              <select value={filters.minCount ?? 0} onChange={(e) => setFilters({ ...filters, minCount: Number(e.target.value) || undefined })}>
                {[0, 10, 25, 50, 100, 250].map((n) => <option key={n} value={n}>{n ? `${n} wallpapers` : 'Any size'}</option>)}
              </select>
            </label>
            <label className="check"><input type="checkbox" checked={!!filters.hasSubgroups} onChange={(e) => setFilters({ ...filters, hasSubgroups: e.target.checked || undefined })} />Only with sub-groups</label>
            <button onClick={() => setFilters({ sort: 'new' })}>Reset</button>
          </div>
        )}
        <div className="chips">
          <button className={'chip main' + (!filters.category ? ' on' : '')} onClick={() => setFilters({ ...filters, category: '' })}>All</button>
          {CATEGORIES.map((c: { id: CategoryId; label: string; main: boolean }) => (
            <button key={c.id} className={'chip' + (c.main ? ' main' : '') + (filters.category === c.id ? ' on' : '')} onClick={() => setFilters({ ...filters, category: c.id })}>{c.label}</button>
          ))}
        </div>
      </div>
      {offline && <div className="notice">Offline: showing the last results you saw.</div>}
      {error && !items.length && <div className="notice">{error}</div>}
      {total > 0 && <div className="muted small" style={{ margin: '4px 0 10px' }}>{total} collection{total === 1 ? '' : 's'}</div>}
      <div className="clist">
        {items.map((c) => <CommunityCard key={c.id} c={c} onOpen={() => setOpen(c.id)} />)}
      </div>
      {!loading && !items.length && !error && <div className="empty">No collections match. Be the first to share one!</div>}
      <div className="sentinel">
        {loading ? 'Loading…' : next ? <button onClick={() => void load(next)}>Load more</button> : ''}
      </div>
      {sharing && <ShareDialog onClose={() => setSharing(false)} onDone={() => void load(1)} />}
      {open && <CommunityDetailDialog id={open} onClose={() => setOpen(null)} onChanged={() => void load(1)} />}
    </>
  );
}

function CommunityCard({ c, onOpen }: { c: CommunitySummary; onOpen: () => void }) {
  return (
    <button className="ccard" onClick={onOpen}>
      <div className="covers">{[0, 1, 2, 3].map((i) => <div key={i}>{c.covers[i] && <CachedImg url={c.covers[i]} />}</div>)}</div>
      <div className="grow">
        <strong>{c.name}</strong>
        <div className="muted small">by @{c.username} · {CATEGORIES.find((x) => x.id === c.category)?.label ?? c.category}</div>
        <div className="muted small">{c.wallpaperCount} wallpapers{c.subgroupNames.length ? ` · ${c.subgroupNames.length} sub-group${c.subgroupNames.length === 1 ? '' : 's'}` : ''}{c.imports ? ` · ${c.imports} imports` : ''}</div>
        {c.subgroupNames.length > 0 && <div className="small accent">{c.subgroupNames.join(' · ')}</div>}
      </div>
    </button>
  );
}

function CommunityDetailDialog({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const state = useAppState();
  const { sync, store } = getCtx();
  const [c, setC] = useState<CommunityDetail | null>(() => cacheGet<CommunityDetail>(store, `community-item|${id}`)?.data ?? null);
  const [err, setErr] = useState<string | null>(null);
  const [parent, setParent] = useState('');
  const [preview, setPreview] = useState<Wallpaper | null>(null);
  const [grouping, setGrouping] = useState<Wallpaper | null>(null);
  const me = state.local.auth?.username;
  const mine = !!c && !!me && c.username.toLowerCase() === me.toLowerCase();

  useEffect(() => {
    cachedFetch(store, `community-item|${id}`, () => sync.communityGet(id), (x) => setC(x)).then((r) => setC(r.data)).catch((e) => setErr(e.message));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = () => {
    if (!c) return;
    try {
      const gid = importCollection(store, c, parent || undefined);
      void sync.communityImported(c.id);
      toast(`Added “${getGroupPath(store.state, gid).join(' › ')}” to your groups.`, 'ok');
      onClose();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };
  const remove = async () => {
    if (!c || !confirm('Remove this collection from the community?')) return;
    try {
      await sync.communityRemove(c.id);
      toast('Removed from the community.', 'ok');
      onChanged();
      onClose();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };
  return (
    <Modal onClose={onClose} wide>
      {err && !c && <div className="notice">{err}</div>}
      {!c && !err && <div className="muted">Loading…</div>}
      {c && (
        <>
          <h3 style={{ marginTop: 0 }}>{c.name}</h3>
          <div className="muted small">by @{c.username} · {CATEGORIES.find((x) => x.id === c.category)?.label ?? c.category} · {c.wallpaperCount} wallpapers · {c.imports} imports</div>
          {c.description && <p>{c.description}</p>}
          {c.subgroupNames.length > 0 && <div className="chips" style={{ margin: '8px 0' }}>{c.subgroupNames.map((n) => <span key={n} className="chip"><Icon name="folder" size={13} /> {n}</span>)}</div>}
          <div className="grid small">
            {c.payload.wallpapers.slice(0, 24).map((w) => (
              <div className="card" key={w.id}><CardImage view={cardView(w, 'landscape')} onClick={() => setPreview(w)} /></div>
            ))}
          </div>
          <div className="row between wrap" style={{ marginTop: 14 }}>
            <label className="row"><span className="muted small">Add it inside</span><GroupSelect value={parent} onChange={setParent} rootLabel="Top level" /></label>
            <div className="row">
              {mine && <button className="danger ibtn" onClick={() => void remove()}><Icon name="trash" size={16} />Remove</button>}
              <button className="ibtn" onClick={onClose}>Close</button>
              <button className="primary ibtn" onClick={add}><Icon name="download" size={16} />Add to my groups</button>
            </div>
          </div>
        </>
      )}
      {preview && <Preview wallpaper={preview} onClose={() => setPreview(null)} onGroup={() => setGrouping(preview)} />}
      {grouping && <GroupDialog wallpaper={grouping} onClose={() => setGrouping(null)} />}
    </Modal>
  );
}

/** Share one of your groups (with its sub-groups) with the community. */
export function ShareDialog({ groupId, onClose, onDone }: { groupId?: string; onClose: () => void; onDone?: () => void }) {
  const state = useAppState();
  const { sync, store } = getCtx();
  const username = state.local.auth?.username;
  const groups = getGroups(state);
  const [gid, setGid] = useState(groupId ?? groups[0]?.id ?? '');
  const g = groups.find((x) => x.id === gid);
  const [name, setName] = useState(g?.name ?? '');
  const [category, setCategory] = useState<CategoryId>(g?.category ?? 'anime');
  const [description, setDescription] = useState('');
  const [newUser, setNewUser] = useState('');
  const [busy, setBusy] = useState(false);

  const pick = (id: string) => {
    setGid(id);
    const x = getGroups(store.state).find((y) => y.id === id);
    if (x) { setName(x.name); if (x.category) setCategory(x.category); }
  };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); }
  };

  if (!state.local.auth) return <Modal onClose={onClose}><h3>Share with the community</h3><p className="muted">Sign in (Account & Devices) to share groups.</p><div className="row end"><button onClick={onClose}>Close</button></div></Modal>;
  if (!username) {
    return (
      <Modal onClose={onClose}>
        <h3>Choose a username</h3>
        <p className="muted small">Your username is shown next to the collections you share.</p>
        <input value={newUser} maxLength={20} placeholder="e.g. naruto_fan" onChange={(e) => setNewUser(e.target.value)} />
        <div className="row end" style={{ marginTop: 14 }}>
          <button onClick={onClose}>Cancel</button>
          <button className="primary" disabled={busy || !/^[A-Za-z0-9_]{3,20}$/.test(newUser.trim())} onClick={() => run(async () => { await sync.setUsername(newUser.trim()); toast('Username saved.', 'ok'); })}>Save username</button>
        </div>
      </Modal>
    );
  }
  const count = g ? getGroupWallpapers(state, g.id).length : 0;
  return (
    <Modal onClose={onClose}>
      <h3>Share with the community</h3>
      {!groups.length ? <p className="muted">Create a group and add some wallpapers first.</p> : (
        <div className="form">
          <label>Group to share<GroupSelect value={gid} onChange={pick} rootLabel="Choose…" /></label>
          <div className="muted small">Includes its sub-groups · {count} wallpapers · shared as @{username}</div>
          <label>Collection name<input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} /></label>
          <div>
            <div className="muted small" style={{ marginBottom: 4 }}>Category (so people can find it)</div>
            <div className="chips">{CATEGORIES.map((c) => <button key={c.id} type="button" className={'chip' + (category === c.id ? ' on' : '')} onClick={() => setCategory(c.id)}>{c.label}</button>)}</div>
          </div>
          <label>Description (optional)<input value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} /></label>
        </div>
      )}
      <div className="row end" style={{ marginTop: 14 }}>
        <button onClick={onClose}>Cancel</button>
        <button className="primary ibtn" disabled={busy || !g || !name.trim() || !count} onClick={() => run(async () => {
          await sync.communityPublish({ sourceGroupId: g!.id, name: name.trim(), category, description: description.trim(), payload: buildCollection(store, g!.id) });
          toast('Shared with the community.', 'ok');
          onDone?.();
          onClose();
        })}><Icon name="upload" size={16} />Share</button>
      </div>
    </Modal>
  );
}
