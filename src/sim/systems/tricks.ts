import { BALANCE } from '../../config/balance';
import { getTrick, type TrickDef } from '../../config/tricks';
import { minutes, type SimContext } from '../context';
import type { Animal, CommandResult, Ms, SimState } from '../types';
import { addGems } from './economy';
import { addNeeds } from './needs';
import { findAnimal } from './selling';

/** DESIGN 11: tricks and training. */

/** DESIGN 9.3: sick animals can't train. */
export function canTrain(animal: Animal): CommandResult {
  if (animal.sickness) return { ok: false, reason: 'Too sick to train. Visit the vet!' };
  return { ok: true };
}

/** How many tricks this animal can ever know (by rarity). */
export function maxTricks(animal: Animal): number {
  return BALANCE.tricks.maxByRarity[animal.rarity];
}

/**
 * The player's local calendar day ("2026-09-28"), for the daily trick-gem cap. Uses the
 * device's time zone, so the cap resets at the kid's own midnight.
 */
export function dayKey(ms: Ms): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Trick gems still available today (the cap is parent-adjustable, DESIGN 11, 20). */
export function trickGemsLeftToday(state: SimState, now: Ms): number {
  const cap = state.world.settings.dailyTrickGemCap;
  const today = state.meta.dailyTrickGems;
  const earned = today.date === dayKey(now) ? today.earned : 0;
  return Math.max(0, cap - earned);
}

export type TrainResult =
  { ok: true; progress: number; learned: boolean; gems: number } | { ok: false; reason: string };

/** Why this animal can't train this trick right now (or null if it can). */
export function trainBlocker(animal: Animal, trick: TrickDef | undefined, now: Ms): string | null {
  if (!trick) return 'That’s not a trick.';
  const sick = canTrain(animal);
  if (!sick.ok) return sick.reason;
  if (animal.tricks.known.includes(trick.id)) return 'It already knows that one!';
  if (animal.tricks.known.length >= maxTricks(animal)) {
    return 'It knows all the tricks it can learn!';
  }
  if (now < animal.tricks.nextTrainAt) return 'It needs a rest before training again.';
  return null;
}

/**
 * One Simon-says session (DESIGN 11). A success counts toward learning and starts the 5-minute
 * rest; a mistake changes nothing, so the kid can try again right away (your choice). After
 * `sessionsToLearn` successes the trick is learned, paying `gemsPerNewTrick` once per animal
 * and trick, up to what's left of today's cap.
 */
export function trainSession(
  ctx: SimContext,
  animalId: string,
  trickId: string,
  success: boolean,
  now: Ms,
): TrainResult {
  const animal = findAnimal(ctx.state.world, animalId);
  if (!animal) return { ok: false, reason: 'Can’t find that animal.' };
  const trick = getTrick(trickId);
  const blocked = trainBlocker(animal, trick, now);
  if (blocked) return { ok: false, reason: blocked };
  const t = animal.tricks;
  const progress = t.progress[trickId] ?? 0;
  if (!success) return { ok: true, progress, learned: false, gems: 0 };

  const next = progress + 1;
  t.nextTrainAt = now + minutes(BALANCE.tricks.cooldownMinutes);
  if (next < BALANCE.tricks.sessionsToLearn) {
    t.progress[trickId] = next;
    ctx.emit('trickPracticed', { animal, trickId, progress: next });
    return { ok: true, progress: next, learned: false, gems: 0 };
  }

  delete t.progress[trickId];
  t.known.push(trickId);
  const gems = Math.min(BALANCE.tricks.gemsPerNewTrick, trickGemsLeftToday(ctx.state, now));
  if (gems > 0) {
    const meta = ctx.state.meta;
    const today = dayKey(now);
    meta.dailyTrickGems = {
      date: today,
      earned: (meta.dailyTrickGems.date === today ? meta.dailyTrickGems.earned : 0) + gems,
    };
    addGems(ctx, gems);
  }
  ctx.emit('trickLearned', { animal, trickId, gems });
  return { ok: true, progress: BALANCE.tricks.sessionsToLearn, learned: true, gems };
}

/** DESIGN 11: a kept pet performs a trick it knows, for a happiness boost (no cooldown). */
export function performTrick(ctx: SimContext, animalId: string, trickId: string): CommandResult {
  const animal = findAnimal(ctx.state.world, animalId);
  if (!animal) return { ok: false, reason: 'Can’t find that animal.' };
  if (!animal.isKept) return { ok: false, reason: 'Only your pets perform tricks.' };
  if (!animal.tricks.known.includes(trickId))
    return { ok: false, reason: 'It hasn’t learned that yet.' };
  addNeeds(animal, 0, BALANCE.tricks.performHappiness);
  ctx.emit('trickPerformed', { animal, trickId });
  return { ok: true };
}
