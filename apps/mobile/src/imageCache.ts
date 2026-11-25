import { Directory, File, Paths } from 'expo-file-system';

/**
 * On-device image cache. Browsed thumbnails are stored in app storage so grids load instantly and still show
 * without a connection. (The OS can clear the cache folder, this one lives in app documents; it is size-limited.)
 */
const MAX_BYTES = 300 * 1024 * 1024;
let dir: Directory | null = null;

function cacheDir(): Directory {
  if (!dir) {
    dir = new Directory(Paths.document, 'imgcache');
    dir.create({ idempotent: true, intermediates: true });
  }
  return dir;
}

function hash(s: string): string {
  let h = 5381;
  let g = 52711;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    g = ((g << 5) ^ (g >>> 3) ^ s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36) + (g >>> 0).toString(36);
}

const fileFor = (url: string) => new File(cacheDir(), hash(url));

/** file:// uri when the image is cached already. */
export function cachedUri(url: string): string | null {
  try {
    const f = fileFor(url);
    return f.exists && f.size > 0 ? f.uri : null;
  } catch {
    return null;
  }
}

let active = 0;
const queue: (() => void)[] = [];
const pending = new Map<string, Promise<string | null>>();

/** Downloads `url` into the cache (a few at a time). Resolves to the local uri, or null when offline. */
export function ensureCached(url: string): Promise<string | null> {
  const hit = cachedUri(url);
  if (hit) return Promise.resolve(hit);
  const running = pending.get(url);
  if (running) return running;
  const p = (async () => {
    while (active >= 4) await new Promise<void>((r) => queue.push(r));
    active++;
    try {
      const f = fileFor(url);
      await File.downloadFileAsync(url, f, { idempotent: true });
      return f.size > 0 ? f.uri : null;
    } catch {
      return null;
    } finally {
      active--;
      queue.shift()?.();
      pending.delete(url);
    }
  })();
  pending.set(url, p);
  return p;
}

/** Deletes files once the cache is above the limit. Called once at start. */
export function pruneImageCache(): void {
  try {
    const files = cacheDir().list().filter((e): e is File => e instanceof File);
    let total = files.reduce((n, f) => n + (f.size ?? 0), 0);
    if (total <= MAX_BYTES) return;
    // The file API exposes no reliable modification time, so entries go in arbitrary order; the cache simply refills.
    for (const f of files) {
      if (total <= MAX_BYTES * 0.8) break;
      total -= f.size ?? 0;
      f.delete();
    }
  } catch {
    /* best effort */
  }
}

export function clearImageCache(): void {
  try {
    for (const e of cacheDir().list()) e.delete();
  } catch {
    /* ignore */
  }
}

export function imageCacheSize(): number {
  try {
    return cacheDir().list().reduce((n, e) => n + (e instanceof File ? (e.size ?? 0) : 0), 0);
  } catch {
    return 0;
  }
}
