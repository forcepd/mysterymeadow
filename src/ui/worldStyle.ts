import { useSyncExternalStore } from 'react';

/**
 * Which world to show: the 3D world (the default) or the original classic 2D one (DESIGN-3D).
 * `?2d` or `?3d` in the address wins; otherwise the choice saved on this device in Settings;
 * otherwise 3D. The choice is a device preference (like the browser's), not part of any save.
 */
export type WorldStyle = '3d' | '2d';

export const WORLD_STYLE_KEY = 'mystery-meadow-3d:world';

/** Picks the world from the address and the saved choice (pure, for tests). */
export function chooseWorld(search: string, stored: string | null): WorldStyle {
  const params = new URLSearchParams(search);
  const on = (key: string) => {
    const v = params.get(key);
    return v !== null && v !== '0' && v !== 'false';
  };
  if (on('2d')) return '2d';
  if (on('3d')) return '3d';
  return stored === '2d' ? '2d' : '3d';
}

function readStored(): string | null {
  try {
    return globalThis.localStorage?.getItem(WORLD_STYLE_KEY) ?? null;
  } catch {
    return null; // Private browsing or blocked storage: just use the default.
  }
}

let current: WorldStyle = chooseWorld(globalThis.location?.search ?? '', readStored());
const listeners = new Set<() => void>();

export function getWorldStyle(): WorldStyle {
  return current;
}

/** Switches the world now, and remembers the choice on this device. */
export function setWorldStyle(style: WorldStyle): void {
  try {
    globalThis.localStorage?.setItem(WORLD_STYLE_KEY, style);
  } catch {
    // Can't remember it: it still switches for now.
  }
  if (style === current) return;
  current = style;
  listeners.forEach((l) => l());
}

export function useWorldStyle(): WorldStyle {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}
