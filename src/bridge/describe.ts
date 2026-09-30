import { getSpecies } from '../config/species';
import type { Animal, VisitorRoll } from '../sim/types';

/** Unnamed animals show their species name (DESIGN 10.2). */
export function displayName(animal: Pick<Animal, 'name' | 'speciesId'>): string {
  return animal.name ?? speciesName(animal.speciesId);
}

export function speciesName(speciesId: string): string {
  return getSpecies(speciesId)?.name ?? 'Animal';
}

export function variantOf(roll: Pick<VisitorRoll, 'speciesId' | 'variantId'>) {
  return getSpecies(roll.speciesId)?.variants.find((v) => v.id === roll.variantId);
}

/** "In 5 minutes", "In 1 minute", or "Now" (rounded up, so it's never early). */
export function inMinutes(ms: number): string {
  if (ms <= 0) return 'Now';
  const m = Math.ceil(ms / 60_000);
  return `In ${m} minute${m === 1 ? '' : 's'}`;
}

/** Countdown text: "4:32", or "1:02:03" past an hour. Rounds up so it never shows 0:00 early. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
