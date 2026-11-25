import { getDeviceSettings } from './selectors.ts';
import type { Store } from './store.ts';
import { DEFAULT_SERVER_URL, type Device, type SyncRecord } from './types.ts';
import type { CommunityDetail, CommunityFilters, CommunityPage, CommunityPublishInput, CommunitySummary } from './community.ts';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface SyncOptions {
  fetchImpl?: typeof fetch;
}

export function normalizeServerUrl(url: string): string {
  let u = url.trim().replace(/\/+$/, '');
  if (u && !/^https?:\/\//i.test(u)) u = 'http://' + u;
  return u;
}

/**
 * Account + sync client. Records are last-write-wins by `updatedAt`.
 * Per-device settings are ordinary records (kind "deviceSettings", id = deviceId), so any
 * device can edit another device's settings (e.g. phone shows "anime", PC shows "All").
 */
export class SyncManager {
  private timer: ReturnType<typeof setInterval> | null = null;
  private debounce: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<void> | null = null;
  status: { syncing: boolean; error: string | null } = { syncing: false, error: null };
  private listeners = new Set<() => void>();

  private store: Store;
  private opts: SyncOptions;

  constructor(store: Store, opts: SyncOptions = {}) {
    this.store = store;
    this.opts = opts;
    store.onLocalChange = () => this.syncSoon();
  }

  onStatus(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
  private setStatus(s: Partial<SyncManager['status']>) {
    this.status = { ...this.status, ...s };
    this.listeners.forEach((l) => l());
  }

  private async api<T>(path: string, init: { method?: string; body?: unknown; auth?: boolean; serverUrl?: string } = {}): Promise<T> {
    const local = this.store.state.local;
    const base = normalizeServerUrl(init.serverUrl ?? local.auth?.serverUrl ?? '');
    if (!base) throw new ApiError(0, 'No server URL set.');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (init.auth !== false && local.auth) headers.Authorization = `Bearer ${local.auth.token}`;
    let res: Response;
    try {
      res = await (this.opts.fetchImpl ?? fetch)(base + path, {
        method: init.method ?? (init.body ? 'POST' : 'GET'),
        headers,
        body: init.body ? JSON.stringify(init.body) : undefined,
      });
    } catch {
      throw new ApiError(0, `Cannot reach server at ${base}`);
    }
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* not json */
    }
    if (!res.ok) throw new ApiError(res.status, json?.error ?? `Server error ${res.status}`);
    return json as T;
  }

  /**
   * Sign in (`identifier` = email or username) or create an account (needs email + username).
   * Everything created on this device before signing in becomes part of the account.
   */
  async authenticate(
    mode: 'login' | 'register',
    identifier: string,
    password: string,
    opts: { username?: string; serverUrl?: string } = {},
  ): Promise<void> {
    const s = this.store.state;
    const ds = getDeviceSettings(s);
    const url = normalizeServerUrl(opts.serverUrl ?? s.local.auth?.serverUrl ?? DEFAULT_SERVER_URL);
    const res = await this.api<{ token: string; email: string; username?: string }>(`/auth/${mode}`, {
      auth: false,
      serverUrl: url,
      body: {
        email: identifier,
        password,
        username: mode === 'register' ? opts.username : undefined,
        deviceId: s.local.deviceId,
        deviceName: ds?.name ?? 'Device',
        platform: ds?.platform ?? 'unknown',
      },
    });
    this.store.setLocal({ auth: { serverUrl: url, token: res.token, email: res.email, username: res.username }, syncCursor: 0 });
    this.store.markAllDirty();
    await this.sync();
    this.startAuto();
  }

  /** Sets the community username of an account created before usernames existed. */
  async setUsername(username: string): Promise<void> {
    const r = await this.api<{ username: string }>('/me/username', { body: { username } });
    const auth = this.store.state.local.auth;
    if (auth) this.store.setLocal({ auth: { ...auth, username: r.username } });
  }

  /** Refreshes the username from the server. */
  async refreshProfile(): Promise<void> {
    const r = await this.api<{ email: string; username?: string | null }>('/me');
    const auth = this.store.state.local.auth;
    if (auth && (r.username ?? undefined) !== auth.username) this.store.setLocal({ auth: { ...auth, username: r.username ?? undefined } });
  }

  // ---------- community ----------

  communityList(f: CommunityFilters): Promise<CommunityPage> {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== '' && v !== false) q.set(k, String(v));
    return this.api<CommunityPage>('/community?' + q.toString());
  }
  communityGet(id: string): Promise<CommunityDetail> {
    return this.api<CommunityDetail>(`/community/${encodeURIComponent(id)}`);
  }
  communityMine(): Promise<{ items: CommunitySummary[] }> {
    return this.api('/community/mine');
  }
  communityPublish(input: CommunityPublishInput): Promise<CommunitySummary> {
    return this.api<CommunitySummary>('/community', { body: input });
  }
  async communityRemove(id: string): Promise<void> {
    await this.api(`/community/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }
  async communityImported(id: string): Promise<void> {
    await this.api(`/community/${encodeURIComponent(id)}/import`, { method: 'POST', body: {} }).catch(() => {});
  }

  logout(): void {
    this.stopAuto();
    this.store.setLocal({ auth: null, syncCursor: 0, lastSyncAt: 0 });
  }

  isLoggedIn(): boolean {
    return !!this.store.state.local.auth;
  }

  async listDevices(): Promise<Device[]> {
    const r = await this.api<{ devices: Device[] }>('/devices');
    return r.devices;
  }

  async removeDevice(deviceId: string): Promise<void> {
    await this.api(`/devices/${encodeURIComponent(deviceId)}`, { method: 'DELETE' });
    const rec = this.store.state.records[`deviceSettings/${deviceId}`];
    if (rec && deviceId !== this.store.state.local.deviceId) this.store.put('deviceSettings', deviceId, rec.data, true);
  }

  syncSoon(delay = 1500): void {
    if (!this.isLoggedIn()) return;
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => void this.sync().catch(() => {}), delay);
  }

  startAuto(intervalMs = 60_000): void {
    this.stopAuto();
    if (!this.isLoggedIn()) return;
    this.timer = setInterval(() => void this.sync().catch(() => {}), intervalMs);
  }

  stopAuto(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Push dirty records, pull newer ones. Safe to call concurrently (calls are coalesced). */
  sync(): Promise<void> {
    if (this.running) return this.running;
    this.running = this.doSync().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async doSync(): Promise<void> {
    const local = this.store.state.local;
    if (!local.auth) return;
    const mine = getDeviceSettings(this.store.state);
    if (mine && mine.syncEnabled === false) return;
    this.setStatus({ syncing: true, error: null });
    try {
      let more = true;
      let first = true;
      while (more) {
        const pushed: SyncRecord[] = first ? Object.values(this.store.state.records).filter((r) => r.dirty) : [];
        first = false;
        const res = await this.api<{ cursor: number; more: boolean; changes: SyncRecord[] }>('/sync', {
          body: {
            deviceId: local.deviceId,
            cursor: this.store.state.local.syncCursor,
            changes: pushed.map(({ kind, id, data, deleted, updatedAt }) => ({ kind, id, data, deleted, updatedAt })),
          },
        });
        this.store.markPushed(pushed);
        this.store.applyRemote(res.changes);
        this.store.setLocal({ syncCursor: res.cursor, lastSyncAt: Date.now() });
        more = res.more;
      }
      this.setStatus({ syncing: false });
    } catch (e: any) {
      if (e instanceof ApiError && e.status === 401) this.store.setLocal({ auth: null });
      this.setStatus({ syncing: false, error: e?.message ?? 'Sync failed' });
      throw e;
    }
  }
}
