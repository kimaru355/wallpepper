// Lorem Picsum - curated Unsplash photography, no key needed.
import type { BrowseParams, Http, Page, SourceConfig, Wallpaper } from '../types.ts';
import { matchesOrientation, qs } from './util.ts';

export async function fetchPicsum(src: SourceConfig, p: BrowseParams, http: Http): Promise<Page> {
  const page = p.sort === 'random' ? 1 + Math.floor(Math.random() * 30) : p.page;
  const data: any[] = await http(`https://picsum.photos/v2/list?${qs({ page, limit: 30 })}`);
  const portrait = p.orientation === 'portrait';
  const items: Wallpaper[] = (data ?? [])
    .map((d) => {
      const w = Math.min(d.width, portrait ? 1440 : 3840);
      const h = Math.round((w * d.height) / d.width);
      return {
        id: `${src.id}:${d.id}`,
        sourceId: src.id,
        title: `Photo by ${d.author}`,
        author: d.author,
        url: `https://picsum.photos/id/${d.id}/${w}/${h}.jpg`,
        thumb: `https://picsum.photos/id/${d.id}/600/${Math.round((600 * d.height) / d.width)}.jpg`,
        width: d.width,
        height: d.height,
        pageUrl: d.url,
      } satisfies Wallpaper;
    })
    .filter((w) => matchesOrientation(w, p.orientation));
  return { items, nextPage: data && data.length >= 30 && p.page < 30 ? p.page + 1 : null };
}
