import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  clearVariant,
  compatStatus,
  deviceShape,
  ensureDimensions,
  findAlternatives,
  getDeviceSettings,
  getVariant,
  otherShape,
  placeCrop,
  setVariant,
  shapeOf,
  type Crop,
  type Shape,
  type Wallpaper,
} from '@wallpepper/core';
import { CachedImg, Icon, Modal } from './components';
import { getCtx } from './ctx';
import { useAppState } from './hooks';
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
  const { store, http } = getCtx();
  const [w, setW] = useState(initial);
  const [alts, setAlts] = useState<Wallpaper[] | null>(null);
  const [picked, setPicked] = useState<Wallpaper | null>(null);
  const [cropping, setCropping] = useState(false);
  const status = compatStatus(state, w);
  const need = status.needs;

  // step 1 again (the wallpaper may have been opened without a size), then step 2: look for similar images
  useEffect(() => {
    let live = true;
    (async () => {
      const full = (await ensureDimensions(store, w.id, probeImage)) ?? w;
      if (!live) return;
      setW(full);
      const s = shapeOf(full);
      if (s === 'unknown' || s === 'square') return setAlts([]);
      try {
        const found = await findAlternatives(store, http, full, otherShape(s));
        if (live) setAlts(found);
      } catch {
        if (live) setAlts([]);
      }
    })();
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

  return (
    <Modal onClose={onClose} wide>
      <h3 style={{ marginTop: 0 }}>Compatibility</h3>
      <div className="row" style={{ alignItems: 'flex-start', gap: 14 }}>
        <div className={'compat-thumb ' + (shape === 'portrait' ? 'portrait' : 'landscape')}><CachedImg url={w.thumb} /></div>
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
          <h4 style={{ marginBottom: 6 }}>Similar {need} images</h4>
          {alts === null ? <div className="muted small">Looking for matches…</div>
            : alts.length === 0 ? <div className="muted small">No similar {need} image found. You can crop this one or use a blurred background.</div>
            : (
              <div className={'alts ' + need}>
                {alts.map((a) => (
                  <button key={a.id} className={'alt' + (picked?.id === a.id ? ' on' : '')} onClick={() => setPicked(picked?.id === a.id ? null : a)}>
                    <CachedImg url={a.thumb} />
                    {picked?.id === a.id && <span className="tick"><Icon name="check" size={14} /></span>}
                  </button>
                ))}
              </div>
            )}
          <div className="row" style={{ marginTop: 10 }}>
            <button className="primary ibtn" disabled={!picked} onClick={() => { setVariant(store, w, { kind: 'image', wallpaper: picked! }); done('Saved.'); }}><Icon name="check" size={16} />Use the selected image</button>
          </div>
          <div className="muted small" style={{ margin: '14px 0 6px' }}>Or keep this image:</div>
          <div className="row">
            <button className="ibtn" onClick={() => setCropping(true)}><Icon name="expand" size={16} />Crop it</button>
            <button className="ibtn" onClick={() => { setVariant(store, w, { kind: 'blur' }); done('Saved.'); }}><Icon name="image" size={16} />Blurred background</button>
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
