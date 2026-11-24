// A GitHub repository full of images (great for Linux "rice" wallpapers).
// Options: repo ("owner/name"), branch (optional), pathPrefix (optional)
import type { BrowseParams, Http, Page, SourceConfig, Wallpaper } from '../types.ts';
import { shuffle } from './util.ts';

const treeCache = new Map<string, Wallpaper[]>();
const PAGE = 30;

async function loadTree(src: SourceConfig, http: Http): Promise<Wallpaper[]> {
  const repo = src.options.repo;
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('Set the GitHub repo as "owner/name".');
  const branch = src.options.branch || 'HEAD';
  const key = `${src.id}|${repo}@${branch}|${src.options.pathPrefix || ''}`;
  const cached = treeCache.get(key);
  if (cached) return cached;
  const data = await http(`https://api.github.com/repos/${repo}/git/trees/${branch}?recursive=1`, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  const prefix = src.options.pathPrefix || '';
  const files: Wallpaper[] = (data?.tree ?? [])
    .filter((t: any) => t.type === 'blob' && /\.(jpe?g|png|webp)$/i.test(t.path) && t.path.startsWith(prefix))
    .map((t: any) => {
      const raw = `https://raw.githubusercontent.com/${repo}/${branch}/${t.path.split('/').map(encodeURIComponent).join('/')}`;
      return {
        id: `${src.id}:${t.path}`,
        sourceId: src.id,
        title: t.path.split('/').pop()!.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '),
        url: raw,
        // Resize through a public image proxy so grids stay light.
        thumb: `https://wsrv.nl/?w=480&output=jpg&url=${encodeURIComponent(raw)}`,
        pageUrl: `https://github.com/${repo}/blob/${branch === 'HEAD' ? 'main' : branch}/${t.path}`,
      } satisfies Wallpaper;
    });
  const shuffled = shuffle(files);
  treeCache.set(key, shuffled);
  return shuffled;
}

export async function fetchGithub(src: SourceConfig, p: BrowseParams, http: Http): Promise<Page> {
  let all = await loadTree(src, http);
  const words = [p.query.trim().toLowerCase()].filter(Boolean);
  if (p.category !== 'all' && p.category !== 'linux') words.push(p.category);
  if (words.length) all = all.filter((w) => words.every((x) => w.id.toLowerCase().includes(x)));
  const start = (p.page - 1) * PAGE;
  return { items: all.slice(start, start + PAGE), nextPage: start + PAGE < all.length ? p.page + 1 : null };
}
