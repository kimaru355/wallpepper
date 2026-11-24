import { useSyncExternalStore } from 'react';

export interface Toast { id: number; text: string; kind: 'info' | 'error' | 'ok' }
let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

export function toast(text: string, kind: Toast['kind'] = 'info') {
  const t = { id: nextId++, text, kind };
  toasts = [...toasts, t];
  listeners.forEach((l) => l());
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id);
    listeners.forEach((l) => l());
  }, kind === 'error' ? 7000 : 4000);
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => toasts,
  );
}
