import { deepFreeze } from './deepFreeze';

/**
 * Tricks (DESIGN 11). `move` is the tween the animal plays when it performs the trick in the
 * world. Adding a trick = a data entry here.
 */
export type TrickMove = 'sit' | 'spin' | 'highFive' | 'roll' | 'jump' | 'dance' | 'wave' | 'fetch';

export interface TrickDef {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly move: TrickMove;
}

// prettier-ignore
export const TRICKS: readonly TrickDef[] = deepFreeze([
  { id: 'sit',       name: 'Sit',       icon: '🪑', move: 'sit' },
  { id: 'spin',      name: 'Spin',      icon: '🌀', move: 'spin' },
  { id: 'high_five', name: 'High-Five', icon: '✋', move: 'highFive' },
  { id: 'roll_over', name: 'Roll Over', icon: '🔄', move: 'roll' },
  { id: 'jump',      name: 'Jump',      icon: '⬆️', move: 'jump' },
  { id: 'dance',     name: 'Dance',     icon: '💃', move: 'dance' },
  { id: 'wave',      name: 'Wave',      icon: '👋', move: 'wave' },
  { id: 'fetch',     name: 'Fetch',     icon: '🎾', move: 'fetch' },
]);

export function getTrick(id: string): TrickDef | undefined {
  return TRICKS.find((t) => t.id === id);
}

/** Simon-says cues (DESIGN 11): four arrows and a tap. */
export const TRAINING_CUES = ['left', 'up', 'right', 'down', 'tap'] as const;
export type TrainingCue = (typeof TRAINING_CUES)[number];
