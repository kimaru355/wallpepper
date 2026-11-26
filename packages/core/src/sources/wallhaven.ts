// Wallhaven (wallhaven.cc). Options: apiKey (optional, local secret)
import type { BrowseParams, CategoryId, Http, Page, SourceConfig, Wallpaper } from '../types.ts';
import { qs } from './util.ts';

/** `own`: a typed search replaces the category word instead of narrowing it ("frozen" rather than "animation frozen"). */
const CATEGORY_QUERY: Record<string, { q: string; categories?: string; own?: boolean }> = {
  anime: { q: '', categories: '010' },
  movies: { q: 'movie' },
  // animated films and series (Frozen, Pixar, ...): the General category, so anime stays out
  animation: { q: 'animation', categories: '100', own: true },
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
  const q = cat.own && p.query.trim() ? p.query.trim() : [cat.q, p.query.trim()].filter(Boolean).join(' ');
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
    // 'original' keeps the picture's shape; 'large' / 'small' are 3:2 crops that cut portraits
    thumb: d.thumbs?.original || d.thumbs?.large || d.thumbs?.small,
    width: d.dimension_x,
    height: d.dimension_y,
    pageUrl: d.url,
  }));
  const last = data?.meta?.last_page ?? 1;
  return { items, nextPage: p.page < last ? p.page + 1 : null };
}
