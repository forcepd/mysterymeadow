import { BALANCE } from '../../config/balance';
import { minutes, type SimContext } from '../context';
import type { Animal, Ms, VisitorRoll, WelcomeState } from '../types';
import { affinityCounts, rollLitterSize, rollSpecies } from './rarity';

/**
 * A new player's quick start (early-game pass): the first few visitors come quickly, the first
 * few animals can be sold sooner, and the first visitors include a guaranteed surprise (babies on
 * the way, and at least one Uncommon). It all runs out after the first handful of visitors.
 */
export function newWelcome(): WelcomeState {
  const w = BALANCE.welcome;
  return {
    fastVisitorsLeft: w.fastVisitors,
    quickHoldsLeft: w.quickHolds,
    surprises: [...w.surprises],
  };
}

/** A finished (or never started) quick start: older saves and tests use this. */
export function finishedWelcome(): WelcomeState {
  return { fastVisitorsLeft: 0, quickHoldsLeft: 0, surprises: [] };
}

/**
 * Minutes until the next visitor: short while the quick start lasts (each short gap uses one up),
 * then the house tier's usual wait.
 */
export function takeVisitorGap(ctx: SimContext, tierMinutes: number): number {
  const welcome = ctx.state.world.welcome;
  if (welcome.fastVisitorsLeft <= 0) return tierMinutes;
  welcome.fastVisitorsLeft -= 1;
  return Math.min(tierMinutes, BALANCE.welcome.fastVisitorMinutes);
}

/** The next surprise, applied to a freshly rolled visitor. */
export function applySurprise(ctx: SimContext, roll: VisitorRoll): VisitorRoll {
  const surprise = ctx.state.world.welcome.surprises.shift();
  if (surprise === 'pregnant' && roll.litterSize < BALANCE.welcome.surpriseMinLitter) {
    return {
      ...roll,
      litterSize: Math.max(BALANCE.welcome.surpriseMinLitter, rollLitterSize(ctx.rng)),
    };
  }
  if (surprise === 'uncommon' && roll.rarity === 'common') {
    const species = rollSpecies(ctx.rng, 'uncommon', affinityCounts(ctx.state.world));
    return {
      ...roll,
      rarity: 'uncommon',
      speciesId: species.id,
      variantId: ctx.rng.pick(species.variants).id,
    };
  }
  return roll;
}

/** An animal walking in during the quick start can be sold after the short wait. */
export function applyQuickHold(ctx: SimContext, animal: Animal, at: Ms): void {
  const welcome = ctx.state.world.welcome;
  if (welcome.quickHoldsLeft <= 0) return;
  welcome.quickHoldsLeft -= 1;
  animal.holdUntil = Math.min(animal.holdUntil, at + minutes(BALANCE.welcome.quickHoldMinutes));
}
