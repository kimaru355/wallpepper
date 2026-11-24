import { fetchPage, sourceSupports } from './sources/index.ts';
import type { BrowseParams, CategoryId, Http, Orientation, Sort, SourceConfig, Wallpaper } from './types.ts';

export interface BrowseFilters {
  category: CategoryId | 'all';
  query: string;
  sort: Sort;
  /** 'all' = mix every enabled source that supports the category */
  sourceId: string | 'all';
}

export interface BrowseState {
  items: Wallpaper[];
  loading: boolean;
  hasMore: boolean;
  /** Per-source failures, shown as a non-blocking notice. */
  errors: { sourceId: string; sourceName: string; message: string }[];
  filters: BrowseFilters;
}

/**
 * Framework-agnostic infinite-scroll browser that mixes pages from several sources
 * (round-robin so one source can't dominate the grid).
 */
export class BrowseController {
  state: BrowseState;
  private listeners = new Set<() => void>();
  private cursors = new Map<string, number | null>();
  private token = 0;
  private active: SourceConfig[] = [];

  private getSources: () => SourceConfig[];
  private http: Http;
  private orientation: Orientation;

  constructor(getSources: () => SourceConfig[], http: Http, orientation: Orientation, filters?: Partial<BrowseFilters>) {
    this.getSources = getSources;
    this.http = http;
    this.orientation = orientation;
    this.state = {
      items: [],
      loading: false,
      hasMore: true,
      errors: [],
      filters: { category: 'anime', query: '', sort: 'latest', sourceId: 'all', ...filters },
    };
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getState = () => this.state;
  private set(patch: Partial<BrowseState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  setOrientation(o: Orientation) {
    if (o !== this.orientation) {
      this.orientation = o;
      void this.reload();
    }
  }

  setFilters(patch: Partial<BrowseFilters>) {
    this.state = { ...this.state, filters: { ...this.state.filters, ...patch } };
    return this.reload();
  }

  async reload() {
    this.token++;
    const { category, sourceId } = this.state.filters;
    this.active = this.getSources().filter(
      (s) => s.enabled && (sourceId === 'all' ? sourceSupports(s, category) : s.id === sourceId),
    );
    this.cursors = new Map(this.active.map((s) => [s.id, 1]));
    this.set({ items: [], hasMore: this.active.length > 0, errors: [], loading: false });
    if (!this.active.length) return;
    await this.loadMore();
  }

  async loadMore() {
    if (this.state.loading || !this.state.hasMore) return;
    const token = this.token;
    this.set({ loading: true });
    const { category, query, sort } = this.state.filters;
    const due = this.active.filter((s) => this.cursors.get(s.id) != null);
    const results = await Promise.allSettled(
      due.map((s) => {
        const params: BrowseParams = { category, query, sort, page: this.cursors.get(s.id)!, orientation: this.orientation };
        return fetchPage(s, params, this.http);
      }),
    );
    if (token !== this.token) return; // filters changed meanwhile
    const lists: Wallpaper[][] = [];
    const errors = [...this.state.errors];
    results.forEach((r, i) => {
      const s = due[i];
      if (r.status === 'fulfilled') {
        this.cursors.set(s.id, r.value.nextPage);
        lists.push(r.value.items);
      } else {
        this.cursors.set(s.id, null);
        errors.push({ sourceId: s.id, sourceName: s.name, message: String(r.reason?.message ?? r.reason) });
      }
    });
    const seen = new Set(this.state.items.map((w) => w.id));
    const merged: Wallpaper[] = [];
    for (let i = 0; lists.some((l) => i < l.length); i++) {
      for (const l of lists) {
        const w = l[i];
        if (w && !seen.has(w.id)) {
          seen.add(w.id);
          merged.push(w);
        }
      }
    }
    const hasMore = [...this.cursors.values()].some((c) => c != null);
    this.set({ items: [...this.state.items, ...merged], loading: false, hasMore, errors });
    // A page can come back empty after orientation filtering although more exists.
    if (!merged.length && hasMore) await this.loadMore();
  }
}
