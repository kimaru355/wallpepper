import { getDeviceSettings } from './selectors.ts';
import type { Store } from './store.ts';
import type { Device, SyncRecord } from './types.ts';

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

  async authenticate(mode: 'login' | 'register', serverUrl: string, email: string, password: string): Promise<void> {
    const s = this.store.state;
    const ds = getDeviceSettings(s);
    const url = normalizeServerUrl(serverUrl);
    const res = await this.api<{ token: string; email: string }>(`/auth/${mode}`, {
      auth: false,
      serverUrl: url,
      body: { email, password, deviceId: s.local.deviceId, deviceName: ds?.name ?? 'Device', platform: ds?.platform ?? 'unknown' },
    });
    this.store.setLocal({ auth: { serverUrl: url, token: res.token, email: res.email }, syncCursor: 0 });
    // Everything created before logging in becomes part of the account.
    this.store.markAllDirty();
    await this.sync();
    this.startAuto();
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
