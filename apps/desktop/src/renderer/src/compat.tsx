import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  clearVariant,
  compatStatus,
  deviceShape,
  ensureDimensions,
  CATEGORIES,
  searchSeed,
  type CategoryId,
  getDeviceSettings,
  getVariant,
  placeCrop,
  setVariant,
  shapeOf,
  type Crop,
  type Shape,
  type Wallpaper,
} from '@wallpepper/core';
import { CachedImg, Icon, Modal } from './components';
import { getCtx, makeBrowse } from './ctx';
import { useAppState, useBrowseOf } from './hooks';
import { probeImage } from './render';
import { toast } from './toast';

// ------------------------------------------------------------------ which wallpaper is being checked

let current: Wallpaper | null = null;
const listeners = new Set<() => void>();
const set = (w: Wallpaper | null) => {
  current = w;
  listeners.forEach((l) => l());
};

/** "Check compatibility" / "Update compatibility": opens the dialog for a saved wallpaper. */
export const openCompat = (w: Wallpaper) => set(w);

/**
 * Called after a wallpaper was added to a group. Step 1: measure it when the source did not say how big it is.
 * Then, if it is not square and no choice was made yet, ask how it should look in the other orientation.
 */
export async function startCompat(w: Wallpaper): Promise<void> {
  const { store } = getCtx();
  const full = (await ensureDimensions(store, w.id, probeImage)) ?? w;
  const s = shapeOf(full);
  if (s === 'unknown' || s === 'square') return;
  if (getVariant(store.state, w.id)) return;
  set(full);
}

export function CompatHost() {
  const w = useSyncExternalStore(
    (fn) => (listeners.add(fn), () => listeners.delete(fn)),
    () => current,
  );
  if (!w) return null;
  return <CompatDialog key={w.id} w={w} onClose={() => set(null)} />;
}

const WHERE: Record<Shape, string> = { portrait: 'phones', landscape: 'computers' };

// ------------------------------------------------------------------ the dialog

function CompatDialog({ w: initial, onClose }: { w: Wallpaper; onClose: () => void }) {
  const state = useAppState();
  const { store } = getCtx();
  const [w, setW] = useState(initial);
  const [cropping, setCropping] = useState(false);
  const [searching, setSearching] = useState(false);
  const status = compatStatus(state, w);
  const need = status.needs;

  // step 1 again: the wallpaper may have been opened without a size
  useEffect(() => {
    let live = true;
    void ensureDimensions(store, w.id, probeImage).then((full) => live && full && setW(full));
    return () => { live = false; };
  }, [w.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const done = (msg: string) => {
    toast(msg, 'ok');
    onClose();
  };

  if (cropping && need) {
    return (
      <CropEditor
        w={w}
        target={need}
        initial={status.variant?.choice.kind === 'crop' ? status.variant.choice.crop : undefined}
        onCancel={() => setCropping(false)}
        onSave={(crop) => {
          setVariant(store, w, { kind: 'crop', crop });
          done('Crop saved.');
        }}
      />
    );
  }
  if (searching && need) {
    return (
      <SearchSimilar
        w={w}
        target={need}
        onCancel={() => setSearching(false)}
        onPick={(alt) => {
          setVariant(store, w, { kind: 'image', wallpaper: alt });
          done(`Saved: computers and phones now each get a picture of the right shape.`);
        }}
      />
    );
  }

  const me = deviceShape(getDeviceSettings(state)?.platform);
  const stateText: Record<string, string> = {
    image: 'Another image is used',
    crop: 'A crop of this image is used',
    blur: 'Shown whole on a blurred background',
    native: 'Square image: fits phones and computers',
    unknown: 'Size unknown',
    none: 'Not set yet',
  };
  const shape = status.shape;
  const chosen = status.variant?.choice.kind === 'image' ? status.variant.choice.wallpaper : null;

  return (
    <Modal onClose={onClose} wide>
      <h3 style={{ marginTop: 0 }}>Compatibility</h3>
      <div className="row" style={{ alignItems: 'flex-start', gap: 14 }}>
        <div className={'compat-thumb ' + (shape === 'portrait' ? 'portrait' : 'landscape')}><CachedImg url={w.thumb} /></div>
        {chosen && need && <div className={'compat-thumb ' + need}><CachedImg url={chosen.thumb} /></div>}
        <div>
          <strong>{shape === 'unknown' ? 'Checking the size…' : shape === 'square' ? 'Square image' : `A ${shape} image`}</strong>
          {w.width && w.height ? <div className="muted small">{w.width}×{w.height}</div> : null}
          <div className={status.state === 'none' ? 'warn' : 'ok'} style={{ marginTop: 4 }}>
            {need ? `On ${WHERE[need]}: ` : ''}{stateText[status.state]}
          </div>
        </div>
      </div>

      {need && (
        <>
          <p className="muted">
            This is a {shape} image, so it will not fit {WHERE[need]} well. Pick how it should look there{need === me ? ' (that is this computer)' : ''}.
          </p>
          <div className="compat-options">
            <button className="option" onClick={() => setSearching(true)}>
              <strong className="row"><Icon name="search" size={16} />Search similar</strong>
              <span className="muted small">Search for a {need} picture of the same thing (e.g. the same character) and use that one there.</span>
            </button>
            <button className="option" onClick={() => setCropping(true)}>
              <strong className="row"><Icon name="expand" size={16} />Crop it</strong>
              <span className="muted small">Use the part of this picture you choose.</span>
            </button>
            <button className="option" onClick={() => { setVariant(store, w, { kind: 'blur' }); done('Saved.'); }}>
              <strong className="row"><Icon name="image" size={16} />Blurred background</strong>
              <span className="muted small">Show the whole picture over a blurred copy of itself.</span>
            </button>
          </div>
        </>
      )}

      <div className="row end" style={{ marginTop: 16 }}>
        {status.variant && <button className="danger ibtn" onClick={() => { clearVariant(store, w.id); done('Choice removed.'); }}><Icon name="trash" size={16} />Remove choice</button>}
        <button onClick={onClose}>{status.variant ? 'Done' : 'Skip for now'}</button>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ search page for the other orientation

/**
 * "Search similar": the Browse page, but showing only pictures of the other orientation. Starts from the words of the
 * wallpaper's title; the user searches freely (e.g. "naruto" or "kakashi") and picks the substitute.
 */
function SearchSimilar({ w, target, onCancel, onPick }: { w: Wallpaper; target: Shape; onCancel: () => void; onPick: (alt: Wallpaper) => void }) {
  const state = useAppState();
  const seed = useMemo(() => searchSeed(state, w), [w.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [category, setCategory] = useState<CategoryId>(seed.category);
  const [query, setQuery] = useState(seed.query);
  const [picked, setPicked] = useState<Wallpaper | null>(null);
  const browse = useMemo(() => makeBrowse({ category: seed.category, query: seed.query, sort: 'popular' }, target), [target]); // eslint-disable-line react-hooks/exhaustive-deps
  const b = useBrowseOf(browse);
  const sentinel = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => { void browse.reload(); }, [browse]);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => e[0].isIntersecting && void browse.loadMore(), { root: scroller.current, rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [browse, b.items.length]);

  const search = (patch: { category?: CategoryId; query?: string }) => {
    setPicked(null);
    void browse.setFilters({ ...patch, tag: undefined, sourceId: 'all' });
  };

  return (
    <Modal onClose={onCancel} wide>
      <div className="row between" style={{ marginBottom: 10 }}>
        <div className="row">
          <button className="ibtn" onClick={onCancel}><Icon name="chevronLeft" size={16} />Back</button>
          <div>
            <h3 style={{ margin: 0 }}>Find a {target} version</h3>
            <div className="muted small">Only {target} pictures are shown, so whatever you pick fits {WHERE[target]}.</div>
          </div>
        </div>
        <div className={'compat-thumb ' + (target === 'portrait' ? 'landscape' : 'portrait')} title="The picture you are replacing"><CachedImg url={w.thumb} /></div>
      </div>
      <div className="chips" style={{ marginBottom: 8 }}>
        {CATEGORIES.map((c) => (
          <button key={c.id} className={'chip' + (c.main ? ' main' : '') + (category === c.id ? ' on' : '')} onClick={() => { setCategory(c.id); search({ category: c.id }); }}>{c.label}</button>
        ))}
      </div>
      <form className="row" onSubmit={(e) => { e.preventDefault(); search({ query }); }}>
        <input className="grow" autoFocus placeholder="Search, e.g. naruto or kakashi" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className="primary ibtn" type="submit"><Icon name="search" size={16} />Search</button>
      </form>
      <div ref={scroller} className="alt-results">
        {b.errors.map((e) => <div key={e.sourceId} className="notice">{e.sourceName}: {e.message}</div>)}
        {!b.loading && !b.items.length && <div className="empty">No {target} pictures found. Try other words or another category.</div>}
        <div className={'alts ' + target}>
          {b.items.map((a) => (
            <button key={a.id} className={'alt' + (picked?.id === a.id ? ' on' : '')} onClick={() => setPicked(picked?.id === a.id ? null : a)} onDoubleClick={() => onPick(a)}>
              <CachedImg url={a.thumb} />
              {picked?.id === a.id && <span className="tick"><Icon name="check" size={14} /></span>}
            </button>
          ))}
        </div>
        <div ref={sentinel} className="sentinel">{b.loading ? 'Loading…' : ''}</div>
      </div>
      <div className="row end" style={{ marginTop: 12 }}>
        <button onClick={onCancel}>Cancel</button>
        <button className="primary ibtn" disabled={!picked} onClick={() => picked && onPick(picked)}><Icon name="check" size={16} />Use this picture</button>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ crop editor

/** Drag the frame over the picture to choose the part that is used; the frame has the shape of the target screen. */
function CropEditor({ w, target, initial, onCancel, onSave }: { w: Wallpaper; target: Shape; initial?: Crop; onCancel: () => void; onSave: (c: Crop) => void }) {
  const iw = w.width ?? 1;
  const ih = w.height ?? 1;
  const [view, setView] = useState(() => {
    if (initial) return { cx: initial.x + initial.w / 2, cy: initial.y + initial.h / 2, scale: Math.min(1, initial.h / placeCrop(iw, ih, target, 0.5, 0.5, 1).h) };
    return { cx: 0.5, cy: 0.5, scale: 1 };
  });
  const boxRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const crop = placeCrop(iw, ih, target, view.cx, view.cy, view.scale);

  // the picture is shown at its own aspect ratio inside the box, so fractions map straight to percentages
  const onDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const el = boxRef.current;
    if (!d || !el) return;
    const r = el.getBoundingClientRect();
    setView((v) => ({ ...v, cx: Math.min(1, Math.max(0, d.cx + (e.clientX - d.x) / r.width)), cy: Math.min(1, Math.max(0, d.cy + (e.clientY - d.y) / r.height)) }));
  };
  const onUp = () => { drag.current = null; };

  return (
    <Modal onClose={onCancel} wide>
      <h3 style={{ marginTop: 0 }}>Crop for {WHERE[target]}</h3>
      <p className="muted small">Drag the frame over the part you want. The frame has the shape of a {target} screen. Use the slider to make the frame smaller or bigger.</p>
      <div className="crop-stage">
        <div ref={boxRef} className="crop-box" style={{ aspectRatio: `${iw} / ${ih}` }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <CachedImg url={w.thumb} />
          <div className="crop-frame" style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%` }} />
        </div>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <span className="muted small">Frame size (smaller = closer in)</span>
        <input type="range" className="grow" min={25} max={100} value={Math.round(view.scale * 100)}
          onChange={(e) => setView((v) => ({ ...v, scale: Number(e.target.value) / 100 }))} />
      </div>
      <div className="row end" style={{ marginTop: 14 }}>
        <button onClick={onCancel}>Cancel</button>
        <button className="primary ibtn" onClick={() => onSave(crop)}><Icon name="check" size={16} />Save crop</button>
      </div>
    </Modal>
  );
}
