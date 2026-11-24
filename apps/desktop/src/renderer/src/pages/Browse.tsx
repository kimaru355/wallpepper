import { useEffect, useRef, useState } from 'react';
import { CATEGORIES, getSources, sourceSupports, type Sort, type Wallpaper } from '@wallpepper/core';
import { getCtx } from '../ctx';
import { GroupDialog, Preview, WallpaperCard } from '../components';
import { useAppState, useBrowse } from '../hooks';

export function Browse() {
  const { browse } = getCtx();
  const state = useAppState();
  const b = useBrowse();
  const [query, setQuery] = useState(b.filters.query);
  const [preview, setPreview] = useState<Wallpaper | null>(null);
  const [grouping, setGrouping] = useState<Wallpaper | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const sources = getSources(state).filter((s) => s.enabled && sourceSupports(s, b.filters.category));

  useEffect(() => {
    if (!browse.getState().items.length && !browse.getState().loading) void browse.reload();
  }, [browse]);

  // Reload when sources are toggled/edited (e.g. an API key was added).
  const sourceSig = JSON.stringify(getSources(state).map((s) => [s.id, s.enabled, s.options]));
  const firstSig = useRef(sourceSig);
  useEffect(() => {
    if (firstSig.current !== sourceSig) {
      firstSig.current = sourceSig;
      void browse.reload();
    }
  }, [sourceSig, browse]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => e[0].isIntersecting && void browse.loadMore(), { root: scroller.current, rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [browse, b.items.length]);

  const main = CATEGORIES.filter((c) => c.main);
  const other = CATEGORIES.filter((c) => !c.main);
  const setCat = (id: string) => void browse.setFilters({ category: id, sourceId: 'all' });

  return (
    <div className="page" ref={scroller}>
      <div className="toolbar">
        <div className="chips">
          {main.map((c) => (
            <button key={c.id} className={'chip main' + (b.filters.category === c.id ? ' on' : '')} onClick={() => setCat(c.id)}>{c.label}</button>
          ))}
          <span className="sep" />
          {other.map((c) => (
            <button key={c.id} className={'chip' + (b.filters.category === c.id ? ' on' : '')} onClick={() => setCat(c.id)}>{c.label}</button>
          ))}
        </div>
        <form className="row" onSubmit={(e) => { e.preventDefault(); void browse.setFilters({ query }); }}>
          <input className="grow" placeholder="Search wallpapers…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <select value={b.filters.sort} onChange={(e) => void browse.setFilters({ sort: e.target.value as Sort })}>
            <option value="latest">Latest</option>
            <option value="popular">Popular</option>
            <option value="random">Random</option>
          </select>
          <select value={b.filters.sourceId} onChange={(e) => void browse.setFilters({ sourceId: e.target.value })}>
            <option value="all">All sources</option>
            {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button className="primary" type="submit">Search</button>
        </form>
      </div>

      {b.errors.map((e) => (
        <div key={e.sourceId} className="notice">{e.sourceName}: {e.message}</div>
      ))}
      {!b.loading && !b.items.length && !b.errors.length && (
        <div className="empty">No enabled source offers this category. Enable or add one in Sources.</div>
      )}

      <div className="grid">
        {b.items.map((w) => (
          <WallpaperCard key={w.id} wallpaper={w} onOpen={() => setPreview(w)} onGroup={() => setGrouping(w)} />
        ))}
      </div>
      <div ref={sentinel} className="sentinel">{b.loading ? 'Loading…' : b.hasMore ? '' : b.items.length ? 'That’s everything.' : ''}</div>

      {preview && <Preview wallpaper={preview} onClose={() => setPreview(null)} onGroup={() => setGrouping(preview)} />}
      {grouping && <GroupDialog wallpaper={grouping} onClose={() => setGrouping(null)} />}
    </div>
  );
}
