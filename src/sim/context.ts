import type { SimEvents } from './events';
import type { Rng } from './rng';
import type { Ms, OfflineSummary, SimState } from './types';

/** Shared state handed to every system. */
export interface SimContext {
  state: SimState;
  rng: Rng;
  /** Emits an event, or drops it during offline catch-up. */
  emit<K extends keyof SimEvents>(event: K, payload: SimEvents[K]): void;
  /** True while catching up time the player was away. */
  offline: boolean;
  /** Counters filled during offline catch-up. */
  summary: OfflineSummary;
}

export function emptySummary(): OfflineSummary {
  return {
    awayMs: 0,
    simulatedMs: 0,
    visitorsWaiting: 0,
    babiesBorn: 0,
    grewUp: 0,
    readyToSell: 0,
  };
}

/** Deterministic id: `<prefix><counter>`. */
export function nextId(ctx: SimContext, prefix: string): string {
  const id = `${prefix}${ctx.state.meta.nextId}`;
  ctx.state.meta.nextId += 1;
  return id;
}

export const minutes = (n: number): Ms => n * 60_000;
export const seconds = (n: number): Ms => n * 1000;
export const hours = (n: number): Ms => n * 3_600_000;
