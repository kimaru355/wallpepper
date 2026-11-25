import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View, type ImageStyle } from 'react-native';
import {
  CATEGORIES,
  cacheGet,
  cachedFetch,
  getGroupPath,
  importCollection,
  cachedRecommendations,
  loadCover,
  loadRecommendations,
  saveRecommendedAsGroup,
  type CommunityDetail,
  type CommunityFilters,
  type CommunitySort,
  type CommunitySummary,
  type Recommended,
  type Wallpaper,
} from '@wallpepper/core';
import { CachedImage, GroupSheet, groupOptions, PreviewModal, Tile } from '../components';
import { getCtx, makeBrowse, toast, useAppState, useBrowseOf } from '../ctx';
import { http } from '../platform';
import { Btn, Chip, colors, Icon, IconBtn, Select, Sheet, Toggle, text } from '../ui';
import { ShareSheet } from './ShareSheet';

export function HomeScreen() {
  const [tab, setTab] = useState<'recommended' | 'community'>('recommended');
  return (
    <View style={{ flex: 1 }}>
      <View style={s.tabs}>
        {(['recommended', 'community'] as const).map((t) => (
          <Pressable key={t} onPress={() => setTab(t)} style={[s.tab, tab === t && s.tabOn]}>
            <Icon name={t === 'recommended' ? 'star' : 'users'} size={16} color={tab === t ? '#fff' : colors.muted} />
            <Text style={{ color: tab === t ? '#fff' : colors.muted, fontWeight: '700' }}>{t === 'recommended' ? 'Recommended' : 'Community'}</Text>
          </Pressable>
        ))}
      </View>
      {/* both stay mounted so scroll position and filters survive switching */}
      <View style={{ flex: 1, display: tab === 'recommended' ? 'flex' : 'none' }}><RecommendedTab /></View>
      <View style={{ flex: 1, display: tab === 'community' ? 'flex' : 'none' }}><CommunityTab /></View>
    </View>
  );
}

// ---------------------------------------------------------------- Recommended

function RecommendedTab() {
  const { store } = getCtx();
  const [category, setCategory] = useState<string>('all');
  const [open, setOpen] = useState<Recommended | null>(null);
  const [recs, setRecs] = useState<Recommended[]>(() => cachedRecommendations(store));
  const [status, setStatus] = useState<'loading' | 'ok' | 'offline' | 'error'>('loading');
  const { width } = useWindowDimensions();
  const tile = (width - 16 * 2 - 10) / 2;
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
    <View style={{ flex: 1 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={s.chips}>
        <Chip label="All" bold on={category === 'all'} onPress={() => setCategory('all')} />
        {cats.map((c) => (
          <Chip key={c.id} label={c.label} bold={c.main} on={category === c.id} onPress={() => setCategory(c.id)} />
        ))}
      </ScrollView>
      {status === 'offline' && <Text style={[text.small, { paddingHorizontal: 16, paddingBottom: 6 }]}>Offline: showing the last list you saw.</Text>}
      <FlatList
        ListEmptyComponent={<Text style={[text.muted, s.empty]}>{status === 'loading' ? 'Loading recommendations…' : 'Could not load recommendations. Check your connection.'}</Text>}
        data={list}
        key={category}
        keyExtractor={(r) => r.id}
        numColumns={2}
        columnWrapperStyle={{ gap: 10, paddingHorizontal: 16 }}
        contentContainerStyle={{ gap: 10, paddingBottom: 24 }}
        renderItem={({ item }) => <RecCard rec={item} width={tile} onPress={() => setOpen(item)} />}
        initialNumToRender={8}
        windowSize={5}
      />
    </View>
  );
}

function RecCard({ rec, width, onPress }: { rec: Recommended; width: number; onPress: () => void }) {
  const { store } = getCtx();
  const [cover, setCover] = useState<Wallpaper | null | undefined>(() => cacheGet<Wallpaper | null>(store, `cover|portrait|${rec.id}`)?.data);
  useEffect(() => {
    let live = true;
    loadCover(store, http, rec, 'portrait').then((w) => live && setCover(w));
    return () => {
      live = false;
    };
  }, [rec, store]);
  return (
    <Pressable onPress={onPress} style={{ width, aspectRatio: 3 / 4, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.panel }}>
      {cover ? <CachedImage uri={cover.thumb} style={StyleSheet.absoluteFill as ImageStyle} /> : <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}><Icon name="image" size={26} color={colors.line} /></View>}
      <View style={s.cardShade}>
        <Text style={s.cardTitle} numberOfLines={2}>{rec.title}</Text>
        <Text style={s.cardSub}>{CATEGORIES.find((c) => c.id === rec.category)?.label}</Text>
      </View>
    </Pressable>
  );
}

/** One recommended title: its wallpapers, with a button that saves them as a sub-group. */
function CollectionView({ rec, onBack }: { rec: Recommended; onBack: () => void }) {
  const state = useAppState();
  const { store } = getCtx();
  const browse = useMemo(() => makeBrowse({ category: rec.category, query: rec.query, tag: rec.tag, sort: 'popular' }), [rec]);
  const b = useBrowseOf(browse);
  const { width } = useWindowDimensions();
  const [preview, setPreview] = useState<Wallpaper | null>(null);
  const [grouping, setGrouping] = useState<Wallpaper | null>(null);
  const [saving, setSaving] = useState(false);
  const [parent, setParent] = useState('');
  const tile = (width - 16 * 2 - 10) / 2;
  useEffect(() => {
    void browse.reload();
  }, [browse]);

  const save = () => {
    try {
      const g = saveRecommendedAsGroup(store, rec, b.items, parent || undefined);
      toast(`Saved to ${getGroupPath(store.state, g.id).join(' › ')}`);
      setSaving(false);
    } catch (e: any) {
      toast(e.message);
    }
  };
  return (
    <View style={{ flex: 1 }}>
      <View style={s.collHead}>
        <IconBtn name="chevronLeft" label="Back" onPress={onBack} style={{ backgroundColor: colors.panel2 }} />
        <View style={{ flex: 1 }}>
          <Text style={text.h2} numberOfLines={1}>{rec.title}</Text>
          <Text style={text.small}>{CATEGORIES.find((c) => c.id === rec.category)?.label} · recommended</Text>
        </View>
        <Btn title="Save as group" icon="folderPlus" kind="primary" disabled={!b.items.length} onPress={() => setSaving(true)} />
      </View>
      {b.fromCache && <Text style={[text.small, s.note]}>Showing saved results{b.loading ? ' · refreshing…' : ' (offline)'}</Text>}
      {!b.fromCache && b.errors.map((e) => <Text key={e.sourceId} style={[text.warn, { paddingHorizontal: 16 }]}>{e.sourceName}: {e.message}</Text>)}
      <FlatList
        data={b.items}
        keyExtractor={(w) => w.id}
        numColumns={2}
        columnWrapperStyle={{ gap: 10, paddingHorizontal: 16 }}
        contentContainerStyle={{ gap: 10, paddingBottom: 24, paddingTop: 6 }}
        onEndReachedThreshold={1.5}
        onEndReached={() => void browse.loadMore()}
        renderItem={({ item }) => <Tile w={item} width={tile} onOpen={() => setPreview(item)} onGroup={() => setGrouping(item)} />}
        ListEmptyComponent={b.loading ? undefined : <Text style={[text.muted, s.empty]}>Nothing found for this title right now.</Text>}
        ListFooterComponent={<Text style={[text.muted, { textAlign: 'center', padding: 16 }]}>{b.loading ? 'Loading…' : ''}</Text>}
      />
      <PreviewModal w={preview} onClose={() => setPreview(null)} onGroup={() => setGrouping(preview)} />
      <GroupSheet w={grouping} onClose={() => setGrouping(null)} />
      <Sheet visible={saving} onClose={() => setSaving(false)} title={`Save “${rec.title}” as a group`}>
        <Text style={[text.muted, { marginBottom: 12 }]}>
          The {Math.min(b.items.length, 80)} wallpapers shown are added to a sub-group. You can then use the whole group, or just this title, as your wallpaper.
        </Text>
        <Select label="Put it inside" value={parent} options={groupOptions(state, `${CATEGORIES.find((c) => c.id === rec.category)?.label} (new top level group)`)} onChange={setParent} />
        <Btn title="Save" kind="primary" onPress={save} />
      </Sheet>
    </View>
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
        const r = await cachedFetch(store, key, fetcher, (cached) => my === token.current && (setItems(cached.items), setNext(cached.nextPage), setTotal(cached.total)));
        if (my !== token.current) return;
        setItems(r.data.items);
        setNext(r.data.nextPage);
        setTotal(r.data.total);
        setOffline(r.offline);
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

  // search as the user types (short delay), and when filters change
  useEffect(() => {
    const t = setTimeout(() => void load(1), q ? 350 : 0);
    return () => clearTimeout(t);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeFilters = [filters.category && 'category', filters.user && 'user', filters.hasSubgroups && 'subgroups', filters.minCount && 'size', filters.sort !== 'new' && 'sort'].filter(Boolean).length;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={s.search}>
            <Icon name="search" size={16} color={colors.muted} />
            <TextInput style={{ flex: 1, color: colors.text, paddingVertical: 8 }} placeholder="Search collections, groups or @username" placeholderTextColor={colors.muted} value={q} onChangeText={setQ} returnKeyType="search" />
            {q ? <IconBtn name="close" onPress={() => setQ('')} size={14} style={{ width: 28, height: 28 }} /> : null}
          </View>
          <Pressable onPress={() => setShowFilters(true)} style={[s.filterBtn, activeFilters > 0 && { borderColor: colors.accent }]}>
            <Icon name="sliders" size={18} color={activeFilters ? colors.accent : colors.text} />
            {activeFilters > 0 && <Text style={s.filterCount}>{activeFilters}</Text>}
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 10 }}>
          <Chip label="All" bold on={!filters.category} onPress={() => setFilters({ ...filters, category: '' })} />
          {CATEGORIES.map((c) => (
            <Chip key={c.id} label={c.label} bold={c.main} on={filters.category === c.id} onPress={() => setFilters({ ...filters, category: c.id })} />
          ))}
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
          <Btn title="Share a group" icon="upload" onPress={() => setSharing(true)} style={{ flex: 1 }} />
          <Btn
            title="My shares"
            icon="user"
            kind={username && filters.user === username ? 'primary' : undefined}
            onPress={() => (username ? setFilters({ ...filters, user: filters.user === username ? '' : username }) : setSharing(true))}
            style={{ flex: 1 }}
          />
        </View>
        {offline && <Text style={[text.small, { marginBottom: 6 }]}>Offline: showing the last results you saw.</Text>}
        {error && !items.length && <Text style={text.warn}>{error}</Text>}
      </View>

      <FlatList
        data={items}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 10 }}
        onEndReachedThreshold={1.5}
        onEndReached={() => next && !loading && void load(next)}
        renderItem={({ item }) => <CommunityCard c={item} onPress={() => setOpen(item.id)} />}
        ListHeaderComponent={total ? <Text style={[text.small, { marginBottom: 4 }]}>{total} collection{total === 1 ? '' : 's'}</Text> : undefined}
        ListEmptyComponent={loading ? undefined : <Text style={[text.muted, s.empty]}>{error ? '' : 'No collections match. Be the first to share one!'}</Text>}
        ListFooterComponent={<Text style={[text.muted, { textAlign: 'center', padding: 14 }]}>{loading ? 'Loading…' : ''}</Text>}
      />

      <FilterSheet visible={showFilters} filters={filters} onChange={setFilters} onClose={() => setShowFilters(false)} />
      {sharing && <ShareSheet onClose={() => setSharing(false)} onDone={() => void load(1)} />}
      {open && <CommunityDetailSheet id={open} onClose={() => setOpen(null)} onChanged={() => void load(1)} />}
    </View>
  );
}

function CommunityCard({ c, onPress }: { c: CommunitySummary; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={s.ccard}>
      <View style={s.covers}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={s.coverCell}>
            {c.covers[i] ? <CachedImage uri={c.covers[i]} style={StyleSheet.absoluteFill as ImageStyle} /> : null}
          </View>
        ))}
      </View>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Text style={text.h2} numberOfLines={1}>{c.name}</Text>
        <Text style={text.small}>by @{c.username} · {CATEGORIES.find((x) => x.id === c.category)?.label ?? c.category}</Text>
        <Text style={[text.small, { marginTop: 2 }]}>
          {c.wallpaperCount} wallpapers{c.subgroupNames.length ? ` · ${c.subgroupNames.length} sub-group${c.subgroupNames.length === 1 ? '' : 's'}` : ''}{c.imports ? ` · ${c.imports} imports` : ''}
        </Text>
        {c.subgroupNames.length > 0 && <Text style={[text.small, { color: colors.accent, marginTop: 2 }]} numberOfLines={1}>{c.subgroupNames.join(' · ')}</Text>}
      </View>
    </Pressable>
  );
}

function FilterSheet({ visible, filters, onChange, onClose }: { visible: boolean; filters: CommunityFilters; onChange: (f: CommunityFilters) => void; onClose: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Filters">
      <Text style={text.small}>Creator</Text>
      <View style={[s.search, { marginTop: 4, marginBottom: 14 }]}>
        <Icon name="user" size={16} color={colors.muted} />
        <TextInput style={{ flex: 1, color: colors.text, paddingVertical: 8 }} placeholder="Username" placeholderTextColor={colors.muted} autoCapitalize="none" autoCorrect={false} value={filters.user ?? ''} onChangeText={(v) => onChange({ ...filters, user: v })} />
      </View>
      <Select label="Sort by" value={filters.sort ?? 'new'} options={SORTS} onChange={(v) => onChange({ ...filters, sort: v as CommunitySort })} />
      <Select
        label="At least"
        value={String(filters.minCount ?? 0)}
        options={[0, 10, 25, 50, 100, 250].map((n) => ({ value: String(n), label: n ? `${n} wallpapers` : 'Any size' }))}
        onChange={(v) => onChange({ ...filters, minCount: Number(v) || undefined })}
      />
      <Toggle label="Only collections with sub-groups" value={!!filters.hasSubgroups} onChange={(v) => onChange({ ...filters, hasSubgroups: v || undefined })} />
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        <Btn title="Reset" onPress={() => onChange({ sort: 'new' })} style={{ flex: 1 }} />
        <Btn title="Done" kind="primary" onPress={onClose} style={{ flex: 1 }} />
      </View>
    </Sheet>
  );
}

function CommunityDetailSheet({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const state = useAppState();
  const { sync, store } = getCtx();
  const [c, setC] = useState<CommunityDetail | null>(() => cacheGet<CommunityDetail>(store, `community-item|${id}`)?.data ?? null);
  const [err, setErr] = useState<string | null>(null);
  const [parent, setParent] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Wallpaper | null>(null);
  const [grouping, setGrouping] = useState<Wallpaper | null>(null);
  const mine = !!c && !!state.local.auth?.username && c.username.toLowerCase() === state.local.auth.username.toLowerCase();

  useEffect(() => {
    cachedFetch(store, `community-item|${id}`, () => sync.communityGet(id), (x) => setC(x))
      .then((r) => setC(r.data))
      .catch((e) => setErr(e.message));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = () => {
    if (!c) return;
    setBusy(true);
    try {
      const gid = importCollection(store, c, parent || undefined);
      void sync.communityImported(c.id);
      toast(`Added “${getGroupPath(store.state, gid).join(' › ')}” to your groups`);
      onClose();
    } catch (e: any) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!c) return;
    try {
      await sync.communityRemove(c.id);
      toast('Removed from the community');
      onChanged();
      onClose();
    } catch (e: any) {
      toast(e.message);
    }
  };

  const wallpapers = c?.payload.wallpapers.slice(0, 18) ?? [];
  return (
    <Sheet visible onClose={onClose} title={c?.name ?? 'Collection'}>
      {err && !c && <Text style={text.warn}>{err}</Text>}
      {!c && !err && <Text style={text.muted}>Loading…</Text>}
      {c && (
        <>
          <Text style={text.small}>by @{c.username} · {CATEGORIES.find((x) => x.id === c.category)?.label ?? c.category} · {c.wallpaperCount} wallpapers · {c.imports} imports</Text>
          {c.description ? <Text style={{ color: colors.text, marginVertical: 8 }}>{c.description}</Text> : null}
          {c.subgroupNames.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 8 }}>
              {c.subgroupNames.map((n) => <Chip key={n} label={n} icon="folder" onPress={() => {}} />)}
            </View>
          )}
          <View style={s.thumbs}>
            {wallpapers.map((w) => (
              <Pressable key={w.id} style={s.thumb} onPress={() => setPreview(w)}>
                <CachedImage uri={w.thumb} style={StyleSheet.absoluteFill as ImageStyle} />
              </Pressable>
            ))}
          </View>
          <Select label="Add it inside" value={parent} options={groupOptions(state, 'Top level')} onChange={setParent} />
          <Btn title="Add to my groups" icon="download" kind="primary" disabled={busy} onPress={add} />
          {mine && <Btn title="Remove from community" icon="trash" kind="danger" onPress={remove} style={{ marginTop: 8 }} />}
        </>
      )}
      <PreviewModal w={preview} onClose={() => setPreview(null)} onGroup={() => setGrouping(preview)} />
      <GroupSheet w={grouping} onClose={() => setGrouping(null)} />
    </Sheet>
  );
}

const s = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  tab: { flex: 1, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 12, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line },
  tabOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chips: { gap: 8, paddingHorizontal: 16, paddingBottom: 10 },
  cardShade: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 10, paddingTop: 30, backgroundColor: 'rgba(0,0,0,.55)' },
  cardTitle: { color: '#fff', fontWeight: '800', fontSize: 15 },
  cardSub: { color: 'rgba(255,255,255,.7)', fontSize: 11, marginTop: 1 },
  collHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 8 },
  note: { paddingHorizontal: 16, paddingBottom: 4 },
  empty: { textAlign: 'center', padding: 40 },
  search: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.panel2, borderColor: colors.line, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12 },
  filterBtn: { width: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.panel2, borderColor: colors.line, borderWidth: 1 },
  filterCount: { position: 'absolute', top: -6, right: -6, backgroundColor: colors.accent, color: '#fff', fontSize: 10, fontWeight: '800', width: 16, height: 16, borderRadius: 8, textAlign: 'center', lineHeight: 16, overflow: 'hidden' },
  ccard: { flexDirection: 'row', gap: 12, backgroundColor: colors.panel, borderColor: colors.line, borderWidth: 1, borderRadius: 14, padding: 10 },
  covers: { width: 92, height: 92, flexDirection: 'row', flexWrap: 'wrap', borderRadius: 10, overflow: 'hidden', backgroundColor: colors.panel2 },
  coverCell: { width: 46, height: 46, backgroundColor: colors.panel2, borderWidth: 0.5, borderColor: colors.bg },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 10 },
  thumb: { width: '31.5%', aspectRatio: 9 / 16, borderRadius: 8, overflow: 'hidden', backgroundColor: colors.panel2 },
});
