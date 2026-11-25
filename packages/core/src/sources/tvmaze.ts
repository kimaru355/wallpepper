// TVmaze (api.tvmaze.com): free, no API key. Series posters (portrait) and backgrounds (landscape).
import type { BrowseParams, Http, Page, SourceConfig, Wallpaper } from '../types.ts';
import { qs } from './util.ts';

interface Show {
  id: number;
  name: string;
  url?: string;
  image?: { original?: string; medium?: string } | null;
  rating?: { average?: number | null };
}

/** Landscape: TVmaze only has backgrounds on a per-show endpoint, so a page costs a few extra small requests. */
async function background(show: Show, http: Http): Promise<string | null> {
  try {
    const imgs: any[] = await http(`https://api.tvmaze.com/shows/${show.id}/images`);
    const bg = imgs.find((i) => i.type === 'background');
    return bg?.resolutions?.original?.url ?? null;
  } catch {
    return null;
  }
}

export async function fetchTvmaze(src: SourceConfig, p: BrowseParams, http: Http): Promise<Page> {
  const query = p.query.trim();
  let shows: Show[];
  let nextPage: number | null;
  if (query) {
    const res: { show: Show }[] = await http(`https://api.tvmaze.com/search/shows?${qs({ q: query })}`);
    shows = (res ?? []).map((r) => r.show);
    nextPage = null; // search returns everything in one go
  } else {
    // The index is paged by 250 shows (oldest first); newest pages hold the freshest series.
    const page = p.sort === 'random' ? Math.floor(Math.random() * 280) : p.sort === 'latest' ? Math.max(0, 285 - p.page) : p.page - 1;
    let list: Show[] = [];
    try {
      list = (await http(`https://api.tvmaze.com/shows?${qs({ page })}`)) ?? [];
    } catch {
      list = [];
    }
    shows = list.filter((s) => s.image?.original);
    if (p.sort === 'popular') shows.sort((a, b) => (b.rating?.average ?? 0) - (a.rating?.average ?? 0));
    else shows.sort((a, b) => b.id - a.id);
    shows = shows.slice(0, 40);
    nextPage = p.sort === 'random' ? p.page + 1 : list.length ? p.page + 1 : null;
    if (p.page > 12) nextPage = null;
  }
  shows = shows.filter((s) => s.image?.original);
  const portrait = p.orientation === 'portrait';
  const items: Wallpaper[] = [];
  if (portrait || p.orientation === 'any') {
    for (const s of shows) {
      items.push({
        id: `${src.id}:${s.id}p`, sourceId: src.id, title: s.name,
        url: s.image!.original!, thumb: s.image!.medium || s.image!.original!, pageUrl: s.url, width: 680, height: 1000,
      });
    }
  } else {
    const top = shows.slice(0, 16);
    const bgs = await Promise.all(top.map((s) => background(s, http)));
    top.forEach((s, i) => {
      const url = bgs[i];
      if (url) items.push({ id: `${src.id}:${s.id}b`, sourceId: src.id, title: s.name, url, thumb: url, pageUrl: s.url, width: 1280, height: 720 });
    });
  }
  return { items, nextPage };
}
