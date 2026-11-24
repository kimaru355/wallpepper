// Bring-your-own JSON API.
// Options:
//   url        e.g. https://example.com/api?search={query}&page={page}
//              placeholders: {query} {page} {category}
//   itemsPath  dotted path to the array in the response ("" or "." = root array)
//   urlPath    path (inside each item) to the full image URL
//   thumbPath  path to thumbnail (defaults to urlPath)
//   idPath     path to unique id (defaults to urlPath)
//   titlePath  optional
//   urlPrefix  optional string prepended to relative URLs
//   headers    optional JSON object string of request headers
//   maxPages   optional, default 20
import type { BrowseParams, Http, Page, SourceConfig, Wallpaper } from '../types.ts';
import { abs, getPath, matchesOrientation } from './util.ts';

export async function fetchGeneric(src: SourceConfig, p: BrowseParams, http: Http): Promise<Page> {
  const o = src.options;
  if (!o.url || !o.urlPath) throw new Error('Custom source needs "url" and "urlPath".');
  const url = o.url
    .replace('{query}', encodeURIComponent(p.query))
    .replace('{page}', String(p.page))
    .replace('{category}', encodeURIComponent(p.category === 'all' ? '' : p.category));
  let headers: Record<string, string> | undefined;
  if (o.headers) {
    try {
      headers = JSON.parse(o.headers);
    } catch {
      throw new Error('"headers" must be a JSON object.');
    }
  }
  const data = await http(url, { headers });
  const list = o.itemsPath && o.itemsPath !== '.' ? getPath(data, o.itemsPath) : data;
  if (!Array.isArray(list)) throw new Error('itemsPath did not point at an array.');
  const pre = o.urlPrefix || '';
  const items: Wallpaper[] = [];
  for (const it of list) {
    const full = getPath(it, o.urlPath);
    if (typeof full !== 'string') continue;
    const fullUrl = abs(pre + full);
    const thumbRaw = getPath(it, o.thumbPath || o.urlPath);
    items.push({
      id: `${src.id}:${getPath(it, o.idPath || o.urlPath)}`,
      sourceId: src.id,
      title: getPath(it, o.titlePath),
      url: fullUrl,
      thumb: typeof thumbRaw === 'string' ? abs(pre + thumbRaw) : fullUrl,
      width: Number(getPath(it, 'width')) || undefined,
      height: Number(getPath(it, 'height')) || undefined,
    });
  }
  const filtered = items.filter((w) => matchesOrientation(w, p.orientation));
  return { items: filtered, nextPage: list.length > 0 && p.page < Number(o.maxPages || 20) ? p.page + 1 : null };
}
