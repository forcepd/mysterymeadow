import { BALANCE } from '../../config/balance';
import { minutes, type SimContext } from '../context';
import type { Animal, Ms, WorldState, Zone } from '../types';
import { isCrowded } from './housing';
import { bedAssignments, indoorHappinessPerMinute } from './zones';

/** Needs run 0..100 (DESIGN 8.1). */
export const NEED_MAX = 100;

const clampNeed = (n: number) => Math.min(NEED_MAX, Math.max(0, n));

/** Zone cleanliness: drops with each uncleaned poop in the zone (DESIGN 8.1). */
export function cleanliness(world: WorldState, zone: Zone): number {
  const poops = world.poops.filter((p) => p.zone === zone).length;
  return clampNeed(NEED_MAX - poops * BALANCE.needs.cleanlinessPerPoop);
}

/** Happiness drain multiplier: Crowded (and, from Phase 4, sick) animals get sad faster. */
function happinessDrainMultiplier(world: WorldState, animal: Animal): number {
  let m = 1;
  if (isCrowded(world)) m *= BALANCE.needs.crowdedHappinessDrainMultiplier;
  if (animal.sickness) m *= BALANCE.sickness.sickHappinessDrainMultiplier;
  return m;
}

/**
 * Online only (needs pause while the player is away, DESIGN 14): hunger drains 100 -> 0 over
 * hungerDrainMinutes and happiness over happinessDrainMinutes, per tick of `dtMs`.
 */
export function tickNeeds(ctx: SimContext, dtMs: Ms): void {
  if (ctx.offline) return;
  const world = ctx.state.world;
  const hungerPerMs = NEED_MAX / minutes(BALANCE.needs.hungerDrainMinutes);
  const happinessPerMs = NEED_MAX / minutes(BALANCE.needs.happinessDrainMinutes);
  const beds = bedAssignments(world);
  for (const animal of world.animals) {
    animal.needs.hunger = clampNeed(animal.needs.hunger - hungerPerMs * dtMs);
    // Indoors, Coziness and the animal's bed give some happiness back (DESIGN 12.3, 8.1).
    const regen = (indoorHappinessPerMinute(world, animal, beds) * dtMs) / minutes(1);
    animal.needs.happiness = clampNeed(
      animal.needs.happiness -
        happinessPerMs * dtMs * happinessDrainMultiplier(world, animal) +
        regen,
    );
  }
}

/** Current care score 0..100: the average of hunger, happiness, and zone cleanliness. */
export function careScore(world: WorldState, animal: Animal): number {
  return (animal.needs.hunger + animal.needs.happiness + cleanliness(world, animal.zone)) / 3;
}

const samplesInWindow = () =>
  Math.max(
    1,
    Math.round(minutes(BALANCE.care.windowMinutes) / (BALANCE.care.sampleSeconds * 1000)),
  );

/** Online only: records one care sample per animal every `care.sampleSeconds`. */
export function tickCareSamples(ctx: SimContext, t: Ms): void {
  if (ctx.offline) return;
  const every = BALANCE.care.sampleSeconds * 1000;
  if (t % every !== ctx.state.meta.createdAt % every) return;
  const world = ctx.state.world;
  const keep = samplesInWindow();
  for (const animal of world.animals) {
    animal.careHistory.push(Math.round(careScore(world, animal) * 10) / 10);
    if (animal.careHistory.length > keep)
      animal.careHistory.splice(0, animal.careHistory.length - keep);
  }
}

/**
 * DESIGN 7.5: 0.8..1.3 from the average of needs over the last 10 minutes, mapped linearly
 * (score 0 -> min, 100 -> max). With no samples yet, the current needs count.
 */
export function careMultiplier(world: WorldState, animal: Animal): number {
  const { minMultiplier, maxMultiplier } = BALANCE.care;
  const history = animal.careHistory;
  const score =
    history.length > 0
      ? history.reduce((a, b) => a + b, 0) / history.length
      : careScore(world, animal);
  return minMultiplier + (maxMultiplier - minMultiplier) * (clampNeed(score) / NEED_MAX);
}

export function addNeeds(animal: Animal, hunger: number, happiness: number): void {
  animal.needs.hunger = clampNeed(animal.needs.hunger + hunger);
  animal.needs.happiness = clampNeed(animal.needs.happiness + happiness);
}
