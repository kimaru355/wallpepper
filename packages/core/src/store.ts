import type { DeviceSettings, LocalState, RecordKind, State, SyncRecord } from './types.ts';

export interface StorageAdapter {
  load(): Promise<string | null>;
  save(json: string): Promise<void>;
}

export interface DeviceDefaults {
  deviceName: string;
  platform: DeviceSettings['platform'];
  folderPath: string;
  /** Defaults for the device settings record (e.g. mobile defaults to portrait handling elsewhere). */
  settings?: Partial<DeviceSettings>;
}

export function uid(): string {
  const r = () => Math.random().toString(36).slice(2, 10);
  return Date.now().toString(36) + r() + r();
}

export const recordKey = (kind: RecordKind, id: string) => `${kind}/${id}`;

export function defaultDeviceSettings(d: DeviceDefaults): DeviceSettings {
  return {
    name: d.deviceName,
    platform: d.platform,
    activeGroupId: 'all',
    rotationEnabled: false,
    rotationMinutes: 60,
    rotationOrder: 'shuffle',
    target: 'both',
    mode: 'apply',
    syncEnabled: true,
    ...d.settings,
  };
}

export class Store {
  state: State;
  private listeners = new Set<() => void>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  /** Called whenever records changed locally (used to schedule a sync). */
  onLocalChange: (() => void) | null = null;

  private adapter: StorageAdapter;
  private defaults: DeviceDefaults;

  constructor(adapter: StorageAdapter, defaults: DeviceDefaults) {
    this.adapter = adapter;
    this.defaults = defaults;
    this.state = {
      records: {},
      local: {
        deviceId: uid(),
        auth: null,
        syncCursor: 0,
        folderPath: defaults.folderPath,
        downloads: {},
        secrets: {},
        rotation: { lastWallpaperId: null, lastAt: 0 },
        lastSyncAt: 0,
      },
    };
  }

  async init(): Promise<void> {
    try {
      const raw = await this.adapter.load();
      if (raw) {
        const saved = JSON.parse(raw) as State;
        this.state = {
          records: saved.records ?? {},
          local: { ...this.state.local, ...saved.local },
        };
      }
    } catch {
      /* corrupt file: start fresh */
    }
    const key = recordKey('deviceSettings', this.state.local.deviceId);
    if (!this.state.records[key]) {
      this.put('deviceSettings', this.state.local.deviceId, defaultDeviceSettings(this.defaults));
    }
    this.persistSoon();
  }

  getState = (): State => this.state;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private commit(next: State, recordsChanged: boolean) {
    this.state = next;
    this.listeners.forEach((l) => l());
    this.persistSoon();
    if (recordsChanged) this.onLocalChange?.();
  }

  private persistSoon() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.adapter.save(JSON.stringify(this.state)).catch(() => {});
    }, 250);
  }

  /** Force pending state to disk (call on app quit). */
  async flush(): Promise<void> {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    await this.adapter.save(JSON.stringify(this.state));
  }

  put<T>(kind: RecordKind, id: string, data: T, deleted = false): void {
    this.putMany([{ kind, id, data, deleted }]);
  }

  putMany(items: { kind: RecordKind; id: string; data: unknown; deleted?: boolean }[]): void {
    const records = { ...this.state.records };
    for (const it of items) {
      const key = recordKey(it.kind, it.id);
      const prev = records[key];
      records[key] = {
        kind: it.kind,
        id: it.id,
        data: it.data,
        deleted: !!it.deleted,
        updatedAt: Math.max(Date.now(), (prev?.updatedAt ?? 0) + 1),
        dirty: true,
      };
    }
    this.commit({ ...this.state, records }, true);
  }

  /** Merge records coming from the server. Returns number applied. */
  applyRemote(incoming: SyncRecord[]): number {
    const records = { ...this.state.records };
    let applied = 0;
    for (const r of incoming) {
      const key = recordKey(r.kind, r.id);
      const cur = records[key];
      if (!cur || r.updatedAt > cur.updatedAt || (r.updatedAt === cur.updatedAt && !cur.dirty)) {
        records[key] = { kind: r.kind, id: r.id, data: r.data, deleted: r.deleted, updatedAt: r.updatedAt };
        applied++;
      }
    }
    if (applied) this.commit({ ...this.state, records }, false);
    return applied;
  }

  /** Clear dirty flags of records that were pushed and not modified since. */
  markPushed(pushed: SyncRecord[]): void {
    const records = { ...this.state.records };
    for (const p of pushed) {
      const key = recordKey(p.kind, p.id);
      const cur = records[key];
      if (cur && cur.dirty && cur.updatedAt === p.updatedAt) records[key] = { ...cur, dirty: false };
    }
    this.commit({ ...this.state, records }, false);
  }

  markAllDirty(): void {
    const records: Record<string, SyncRecord> = {};
    for (const [k, r] of Object.entries(this.state.records)) records[k] = { ...r, dirty: true };
    this.commit({ ...this.state, records }, true);
  }

  setLocal(patch: Partial<LocalState>): void {
    this.commit({ ...this.state, local: { ...this.state.local, ...patch } }, false);
  }

  /** Remove everything synced (used when logging out and asking to wipe). */
  resetRecords(): void {
    this.commit({ ...this.state, records: {} }, false);
    const key = recordKey('deviceSettings', this.state.local.deviceId);
    void key;
    this.put('deviceSettings', this.state.local.deviceId, defaultDeviceSettings(this.defaults));
  }
}
