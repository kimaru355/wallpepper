// The Movie Database. Requires a (free) API key or v4 read token: options.apiKey (local secret).
import type { BrowseParams, Http, Page, SourceConfig, Wallpaper } from '../types.ts';
import { qs } from './util.ts';

export async function fetchTmdb(src: SourceConfig, p: BrowseParams, http: Http): Promise<Page> {
  const key = (src.options.apiKey || '').trim();
  if (!key) throw new Error('TMDB needs a free API key. Add it under Sources > TMDB.');
  const bearer = key.length > 40;
  const headers: Record<string, string> = bearer ? { Authorization: `Bearer ${key}` } : {};
  const params: Record<string, any> = { page: p.page, include_adult: 'false' };
  if (!bearer) params.api_key = key;
  let path: string;
  if (p.query.trim()) {
    path = 'search/multi';
    params.query = p.query.trim();
  } else if (p.sort === 'latest') {
    path = 'trending/all/day';
  } else if (p.sort === 'random') {
    path = 'trending/all/week';
    params.page = 1 + Math.floor(Math.random() * 10);
  } else {
    path = 'trending/all/week';
  }
  const data = await http(`https://api.themoviedb.org/3/${path}?${qs(params)}`, { headers });
  const portrait = p.orientation === 'portrait';
  const items: Wallpaper[] = [];
  for (const d of data?.results ?? []) {
    const file: string | null = portrait ? d.poster_path : d.backdrop_path;
    if (!file || d.media_type === 'person') continue;
    items.push({
      id: `${src.id}:${d.media_type || 'x'}${d.id}${portrait ? 'p' : ''}`,
      sourceId: src.id,
      title: d.title || d.name,
      url: `https://image.tmdb.org/t/p/original${file}`,
      thumb: `https://image.tmdb.org/t/p/w500${file}`,
      pageUrl: `https://www.themoviedb.org/${d.media_type === 'tv' ? 'tv' : 'movie'}/${d.id}`,
    });
  }
  return { items, nextPage: p.page < Math.min(data?.total_pages ?? 1, 500) ? p.page + 1 : null };
}
