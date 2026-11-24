import { useEffect, useSyncExternalStore } from 'react';
import { toast } from './toast';

type Update = Awaited<ReturnType<Window['api']['checkUpdate']>>;
interface UpdateState { available: NonNullable<Update> | null; checking: boolean; progress: { done: number; total: number } | null }

let state: UpdateState = { available: null, checking: false, progress: null };
const listeners = new Set<() => void>();
const set = (patch: Partial<UpdateState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
export const useUpdate = () => useSyncExternalStore(subscribe, () => state);

/** Mount once: listens for the background check done by the main process. */
export function useUpdateListeners() {
  useEffect(() => {
    const a = window.api.onUpdateAvailable((u) => set({ available: u }));
    const b = window.api.onUpdateProgress((p) => set({ progress: p }));
    return () => { a(); b(); };
  }, []);
}

export async function checkNow(manual: boolean) {
  set({ checking: true });
  try {
    const u = await window.api.checkUpdate();
    set({ available: u });
    if (manual && !u) toast('Wallpepper is up to date.', 'ok');
  } catch (e) {
    if (manual) toast(`Could not check for updates: ${(e as Error).message}`, 'error');
  } finally {
    set({ checking: false });
  }
}

export async function installNow() {
  set({ progress: { done: 0, total: 1 } });
  try {
    await window.api.installUpdate(); // the app quits/restarts when this succeeds
  } catch (e) {
    toast((e as Error).message, 'error');
  } finally {
    set({ progress: null });
  }
}

const mb = (n: number) => (n / 1048576).toFixed(1);

export function UpdateButton({ compact = false }: { compact?: boolean }) {
  const { available, progress } = useUpdate();
  if (!available) return null;
  const pct = progress && progress.total > 1 ? Math.round((progress.done / progress.total) * 100) : null;
  const label = progress
    ? pct === null ? 'Starting…' : `Downloading… ${pct}%`
    : available.how === 'install' ? `Update to ${available.version}` : `Get ${available.version}`;
  return (
    <button className="primary" disabled={!!progress} onClick={() => void installNow()} title={`${mb(available.size)} MB`}>
      {compact ? `⬆ ${label}` : label}
    </button>
  );
}
