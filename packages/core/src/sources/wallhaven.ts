// Wallhaven (wallhaven.cc). Options: apiKey (optional, local secret)
import type { BrowseParams, CategoryId, Http, Page, SourceConfig, Wallpaper } from '../types.ts';
import { qs } from './util.ts';

const CATEGORY_QUERY: Record<string, { q: string; categories?: string }> = {
  anime: { q: '', categories: '010' },
  movies: { q: 'movie' },
  linux: { q: 'linux' },
  tech: { q: 'technology' },
  nature: { q: 'nature' },
  space: { q: 'space' },
  games: { q: 'video games' },
  abstract: { q: 'abstract' },
  minimal: { q: 'minimalism' },
};

export function wallhavenQuery(category: CategoryId | 'all') {
  return CATEGORY_QUERY[category] ?? { q: '' };
}

export async function fetchWallhaven(src: SourceConfig, p: BrowseParams, http: Http): Promise<Page> {
  const cat = wallhavenQuery(p.category);
  const q = [cat.q, p.query.trim()].filter(Boolean).join(' ');
  const sorting = p.sort === 'popular' ? 'toplist' : p.sort === 'random' ? 'random' : 'date_added';
  const url =
    'https://wallhaven.cc/api/v1/search?' +
    qs({
      q,
      categories: cat.categories ?? '111',
      purity: '100',
      sorting,
      page: p.page,
      ratios: p.orientation === 'any' ? undefined : p.orientation === 'portrait' ? 'portrait' : 'landscape',
      atleast: p.orientation === 'portrait' ? undefined : '1920x1080',
      apikey: src.options.apiKey,
    });
  const data = await http(url);
  const items: Wallpaper[] = (data?.data ?? []).map((d: any) => ({
    id: `${src.id}:${d.id}`,
    sourceId: src.id,
    title: q || 'Wallhaven',
    url: d.path,
    thumb: d.thumbs?.large || d.thumbs?.small,
    width: d.dimension_x,
    height: d.dimension_y,
    pageUrl: d.url,
  }));
  const last = data?.meta?.last_page ?? 1;
  return { items, nextPage: p.page < last ? p.page + 1 : null };
}
