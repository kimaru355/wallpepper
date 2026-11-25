import { getDeviceSettings, getGroups, getSources, getWallpaperGroupIds } from './selectors.ts';
import { recordKey, type Store } from './store.ts';
import type { CategoryId, FitMode, State, Wallpaper } from './types.ts';

/**
 * Phones are portrait and PCs are landscape, so one image rarely suits both. Every saved wallpaper can carry a
 * "variant" for the orientation it does NOT natively have: another image of the same thing, a crop, or a blurred
 * background. Variants are synced records, so each device picks what suits its own screen.
 */
export type Shape = 'portrait' | 'landscape';

/** Region of the source image, as fractions (0..1) of its width and height. */
export interface Crop {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Choice =
  | { kind: 'image'; wallpaper: Wallpaper }
  | { kind: 'crop'; crop: Crop }
  | { kind: 'blur' };

export interface Variant {
  /** The orientation this variant is for (the opposite of the wallpaper's own). */
  for: Shape;
  choice: Choice;
}

/** Typical screen shapes used to size crops. */
export const SHAPE_ASPECT: Record<Shape, number> = { portrait: 9 / 19.5, landscape: 16 / 9 };

/** Near square images fit both orientations well enough. */
const SQUARE_TOLERANCE = 0.12;

export function shapeOf(w: { width?: number; height?: number }): Shape | 'square' | 'unknown' {
  if (!w.width || !w.height) return 'unknown';
  const r = w.width / w.height;
  if (Math.abs(r - 1) < SQUARE_TOLERANCE) return 'square';
  return r > 1 ? 'landscape' : 'portrait';
}

export const otherShape = (s: Shape): Shape => (s === 'portrait' ? 'landscape' : 'portrait');

export function deviceShape(platform: string | undefined): Shape {
  return platform === 'android' || platform === 'ios' ? 'portrait' : 'landscape';
}

export function getVariant(state: State, wallpaperId: string): Variant | undefined {
  const r = state.records[recordKey('variant', wallpaperId)];
  return r && !r.deleted ? (r.data as Variant) : undefined;
}

export function setVariant(store: Store, w: Wallpaper, choice: Choice): void {
  const s = shapeOf(w);
  if (s === 'unknown' || s === 'square') return;
  store.put('variant', w.id, { for: otherShape(s), choice } satisfies Variant);
}

export function clearVariant(store: Store, wallpaperId: string): void {
  const r = store.state.records[recordKey('variant', wallpaperId)];
  if (r && !r.deleted) store.put('variant', wallpaperId, r.data, true);
}

export type CompatState = 'native' | 'image' | 'crop' | 'blur' | 'none' | 'unknown';

export interface CompatStatus {
  /** The wallpaper's own orientation. */
  shape: Shape | 'square' | 'unknown';
  /** Orientation that still needs a decision (the other one). */
  needs?: Shape;
  /** How `needs` is handled. 'native' = square image, fits both. */
  state: CompatState;
  variant?: Variant;
}

export function compatStatus(state: State, w: Wallpaper): CompatStatus {
  const shape = shapeOf(w);
  if (shape === 'unknown') return { shape, state: 'unknown' };
  if (shape === 'square') return { shape, state: 'native' };
  const variant = getVariant(state, w.id);
  return { shape, needs: otherShape(shape), state: variant ? variant.choice.kind : 'none', variant };
}

export const isCompatible = (state: State, w: Wallpaper): boolean => {
  const s = compatStatus(state, w).state;
  return s !== 'none' && s !== 'unknown';
};

export interface Resolved {
  wallpaper: Wallpaper;
  fit: FitMode;
  crop?: Crop;
}

/**
 * What to actually show on a device of orientation `device`: the wallpaper itself when its shape matches, otherwise
 * the user's chosen variant. With no choice yet a mismatched image gets the blurred background instead of a brutal crop.
 */
export function resolveForDevice(state: State, w: Wallpaper, device: Shape, fit: FitMode): Resolved {
  const shape = shapeOf(w);
  if (shape === 'unknown' || shape === 'square' || shape === device) return { wallpaper: w, fit };
  const v = getVariant(state, w.id);
  if (v && v.for === device) {
    if (v.choice.kind === 'image') return { wallpaper: v.choice.wallpaper, fit };
    if (v.choice.kind === 'crop') return { wallpaper: w, fit: 'fill', crop: v.choice.crop };
    return { wallpaper: w, fit: 'blur' };
  }
  return { wallpaper: w, fit: fit === 'fill' ? 'blur' : fit };
}

/** Resolves for the device this app runs on. */
export function resolveForThisDevice(state: State, w: Wallpaper): Resolved {
  const s = getDeviceSettings(state);
  return resolveForDevice(state, w, deviceShape(s?.platform), s?.fit ?? 'fill');
}

// ---------------------------------------------------------------- step 1: know the size

/** Reads the pixel size of an image URL (provided by the app: <img> on desktop, Image.getSize on the phone). */
export type ImageProbe = (url: string) => Promise<{ width: number; height: number }>;

/**
 * Makes sure the saved wallpaper has its width and height, so its orientation is known. Many sources send no
 * size; those get measured once and the result is stored (and synced) with the wallpaper.
 */
export async function ensureDimensions(store: Store, wallpaperId: string, probe: ImageProbe): Promise<Wallpaper | null> {
  const rec = store.state.records[recordKey('wallpaper', wallpaperId)];
  if (!rec || rec.deleted) return null;
  const w = rec.data as Wallpaper & { addedAt?: number };
  if (w.width && w.height) return w;
  try {
    const { width, height } = await probe(w.thumb || w.url);
    if (!width || !height) return w;
    const next = { ...w, width, height };
    store.put('wallpaper', wallpaperId, next);
    return next;
  } catch {
    return w;
  }
}

// ---------------------------------------------------------------- step 2: searching for the other orientation

const STOP = new Set(['rating', 'safe', 'wallpaper', 'the', 'and', 'of', 'a', 'in', 'on']);

/** Search words for a wallpaper, taken from its title / board tags. */
export function keywordsOf(w: Wallpaper): string {
  return (w.title ?? '')
    .toLowerCase()
    .split(/[\s_]+/)
    .filter((t) => t.length > 2 && !STOP.has(t) && !/^\d+$/.test(t) && !t.includes(':'))
    .slice(0, 3)
    .join(' ');
}

/**
 * Where "Search similar" starts: words from the wallpaper's title / tags and the category it most likely belongs to
 * (its group's category, else what its source serves). The user then searches freely in the other orientation.
 */
export function searchSeed(state: State, w: Wallpaper): { query: string; category: CategoryId } {
  const groups = getGroups(state);
  const fromGroup = getWallpaperGroupIds(state, w.id)
    .map((id) => groups.find((g) => g.id === id))
    .map((g) => {
      // a sub-group inherits the category of the group it sits in
      let cur = g;
      for (let n = 0; cur && !cur.category && cur.parentId && n < 10; n++) cur = groups.find((x) => x.id === cur!.parentId);
      return cur?.category;
    })
    .find(Boolean);
  const src = getSources(state).find((s) => s.id === w.sourceId);
  const category = fromGroup ?? src?.categories[0] ?? 'anime';
  return { query: keywordsOf(w), category };
}

// ---------------------------------------------------------------- crop maths

/** Biggest crop of the target shape that fits inside an image of the given size, centred. */
export function maxCrop(imgW: number, imgH: number, target: Shape): Crop {
  const t = SHAPE_ASPECT[target];
  const a = imgW / imgH;
  if (a >= t) {
    const w = t / a;
    return { x: (1 - w) / 2, y: 0, w, h: 1 };
  }
  const h = a / t;
  return { x: 0, y: (1 - h) / 2, w: 1, h };
}

/** Moves / scales a crop: `scale` 1 = the biggest crop, smaller zooms in. Keeps it inside the image. */
export function placeCrop(imgW: number, imgH: number, target: Shape, cx: number, cy: number, scale: number): Crop {
  const m = maxCrop(imgW, imgH, target);
  const s = Math.min(1, Math.max(0.25, scale));
  const w = m.w * s;
  const h = m.h * s;
  return { x: Math.min(1 - w, Math.max(0, cx - w / 2)), y: Math.min(1 - h, Math.max(0, cy - h / 2)), w, h };
}
