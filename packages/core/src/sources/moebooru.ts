// Moebooru boards (Konachan, Yande.re, ...). Options: baseUrl, extraTags
import type { BrowseParams, Http, Page, SourceConfig, Wallpaper } from '../types.ts';
import { abs, matchesOrientation, qs } from './util.ts';

export async function fetchMoebooru(src: SourceConfig, p: BrowseParams, http: Http): Promise<Page> {
  const base = (src.options.baseUrl || '').replace(/\/$/, '');
  const tags = ['rating:safe'];
  if (src.options.extraTags) tags.push(src.options.extraTags);
  if (p.tag) tags.push(p.tag);
  else if (p.query.trim()) tags.push(...p.query.trim().split(/\s+/).slice(0, 4));
  if (p.sort === 'popular') tags.push('order:score');
  if (p.sort === 'random') tags.push('order:random');
  if (p.orientation === 'landscape') tags.push('width:1600..');
  const limit = 30;
  const data: any[] = await http(`${base}/post.json?${qs({ limit, page: p.page, tags: tags.join(' ') })}`);
  const items: Wallpaper[] = (Array.isArray(data) ? data : [])
    .filter((d) => d.file_url)
    .map((d) => ({
      id: `${src.id}:${d.id}`,
      sourceId: src.id,
      title: d.tags ? String(d.tags).split(' ').slice(0, 4).join(' ') : undefined,
      url: abs(d.file_url, base),
      thumb: abs(d.sample_url || d.preview_url, base),
      width: d.width,
      height: d.height,
      pageUrl: `${base}/post/show/${d.id}`,
      author: d.author,
    }))
    .filter((w) => matchesOrientation(w, p.orientation));
  return { items, nextPage: Array.isArray(data) && data.length >= limit ? p.page + 1 : null };
}
