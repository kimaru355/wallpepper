import type { BrowseParams, Http, Page, SourceConfig } from '../types.ts';
import { fetchGeneric } from './generic.ts';
import { fetchGithub } from './github.ts';
import { fetchMoebooru } from './moebooru.ts';
import { fetchPicsum } from './picsum.ts';
import { fetchTvmaze } from './tvmaze.ts';
import { fetchWallhaven } from './wallhaven.ts';

/**
 * The six built-in sources (none needs an account or API key). They can be disabled but never removed.
 *  anime  : Konachan, Yande.re
 *  movies : TVmaze (series posters/backgrounds), Wallhaven (also tech/nature/space/games...)
 *  linux  : GitHub wallpaper repo
 *  other  : Picsum photography
 */
export const BUILTIN_SOURCES: SourceConfig[] = [
  {
    id: 'konachan', name: 'Konachan', type: 'moebooru', builtin: true, enabled: true,
    categories: ['anime'], options: { baseUrl: 'https://konachan.net' },
    description: 'High quality anime wallpapers (safe-rated board).',
  },
  {
    id: 'yandere', name: 'Yande.re', type: 'moebooru', builtin: true, enabled: true,
    categories: ['anime'], options: { baseUrl: 'https://yande.re', extraTags: 'wallpaper' },
    description: 'Anime wallpapers, safe rating only.',
  },
  {
    id: 'tvmaze', name: 'TVmaze', type: 'tvmaze', builtin: true, enabled: true,
    categories: ['movies'], options: {},
    description: 'TV series posters and backdrops. No account or key needed.',
  },
  {
    id: 'wallhaven', name: 'Wallhaven', type: 'wallhaven', builtin: true, enabled: true,
    categories: ['movies', 'tech', 'nature', 'space', 'games', 'abstract', 'minimal', 'anime', 'linux'],
    options: {},
    description: 'Huge community library; covers movies/series, tech, nature, games and more.',
  },
  {
    id: 'linuxwalls', name: 'Linux Walls', type: 'github', builtin: true, enabled: true,
    categories: ['linux', 'tech', 'minimal', 'abstract', 'nature'],
    options: { repo: 'dharmx/walls' },
    description: 'Community wallpaper repo popular with Linux desktops (GitHub: dharmx/walls).',
  },
  {
    id: 'picsum', name: 'Picsum Photos', type: 'picsum', builtin: true, enabled: true,
    categories: ['nature', 'minimal'], options: {},
    description: 'Curated Unsplash photography.',
  },
];

export function sourceSupports(s: SourceConfig, category: string): boolean {
  return category === 'all' || s.categories.length === 0 || s.categories.includes(category);
}

export async function fetchPage(src: SourceConfig, params: BrowseParams, http: Http): Promise<Page> {
  switch (src.type) {
    case 'moebooru': return fetchMoebooru(src, params, http);
    case 'wallhaven': return fetchWallhaven(src, params, http);
    case 'tvmaze': return fetchTvmaze(src, params, http);
    case 'github': return fetchGithub(src, params, http);
    case 'picsum': return fetchPicsum(src, params, http);
    case 'generic': return fetchGeneric(src, params, http);
    default: throw new Error(`Unknown source type: ${(src as SourceConfig).type}`);
  }
}

export interface SourceField { key: string; label: string; placeholder?: string; required?: boolean; secret?: boolean }

/** Form definitions used by the "add source" UI on both platforms. */
export const SOURCE_TYPE_HELP: Record<string, { label: string; fields: SourceField[] }> = {
  moebooru: { label: 'Moebooru board (Konachan, Yande.re...)', fields: [
    { key: 'baseUrl', label: 'Base URL', placeholder: 'https://konachan.net', required: true },
    { key: 'extraTags', label: 'Extra tags', placeholder: 'wallpaper' } ] },
  wallhaven: { label: 'Wallhaven', fields: [{ key: 'apiKey', label: 'API key (optional)', secret: true }] },
  tvmaze: { label: 'TVmaze', fields: [] },
  github: { label: 'GitHub image repo', fields: [
    { key: 'repo', label: 'Repository', placeholder: 'owner/name', required: true },
    { key: 'branch', label: 'Branch', placeholder: 'main' },
    { key: 'pathPrefix', label: 'Only folder', placeholder: 'wallpapers/' } ] },
  picsum: { label: 'Picsum Photos', fields: [] },
  generic: { label: 'Custom JSON API', fields: [
    { key: 'url', label: 'URL template', placeholder: 'https://x.com/api?q={query}&page={page}', required: true },
    { key: 'itemsPath', label: 'Items path', placeholder: 'results' },
    { key: 'urlPath', label: 'Image URL path', placeholder: 'urls.full', required: true },
    { key: 'thumbPath', label: 'Thumbnail path', placeholder: 'urls.small' },
    { key: 'idPath', label: 'Id path', placeholder: 'id' },
    { key: 'titlePath', label: 'Title path', placeholder: 'title' },
    { key: 'headers', label: 'Headers (JSON)', placeholder: '{"Authorization":"..."}' } ] },
};
