import type { Orientation, Wallpaper } from '../types.ts';

export function abs(url: string | undefined | null, base?: string): string {
  if (!url) return '';
  if (url.startsWith('//')) return 'https:' + url;
  if (/^https?:/i.test(url)) return url;
  return base ? base.replace(/\/$/, '') + (url.startsWith('/') ? '' : '/') + url : url;
}

export function matchesOrientation(w: Wallpaper, o: Orientation): boolean {
  if (o === 'any' || !w.width || !w.height) return true;
  return o === 'landscape' ? w.width >= w.height : w.height > w.width;
}

export function qs(params: Record<string, string | number | undefined | null>): string {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
}

/** Resolve a dotted path like `data.items.0.url` on an object. */
export function getPath(obj: any, path: string | undefined): any {
  if (!path) return undefined;
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export function shuffle<T>(arr: T[], seed = Math.random()): T[] {
  const a = arr.slice();
  let s = Math.floor(seed * 2 ** 31) || 1;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
