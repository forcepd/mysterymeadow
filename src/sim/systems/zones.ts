import { BALANCE } from '../../config/balance';
import { cozinessOf, getItem, type BedItemDef } from '../../config/items';
import type { SimContext } from '../context';
import type { Animal, CommandResult, WorldState, Zone } from '../types';
import { randomPosition } from './animals';
import { findAnimal } from './selling';

/**
 * DESIGN 12.4: animals live in the yard or the house. Indoor slots = pet beds placed in the
 * house. Beds don't add capacity; they only limit how many animals can be inside at once.
 */

export type ZoneMoveReason = 'player' | 'wander' | 'food' | 'noBed';

function placedBeds(world: WorldState): BedItemDef[] {
  const beds: BedItemDef[] = [];
  for (const p of world.placedItems) {
    if (p.zone !== 'house') continue;
    const def = getItem(p.itemId);
    if (def?.category === 'bed') beds.push(def);
  }
  return beds;
}

export function indoorSlots(world: WorldState): number {
  return placedBeds(world).length;
}

export function indoorAnimals(world: WorldState): Animal[] {
  return world.animals.filter((a) => a.zone === 'house');
}

export function hasFreeBed(world: WorldState): boolean {
  return indoorAnimals(world).length < indoorSlots(world);
}

/** DESIGN 12.3: room Coziness from placed house decor plus wallpaper and flooring, capped. */
export function coziness(world: WorldState): number {
  let total = 0;
  for (const p of world.placedItems) {
    if (p.zone !== 'house') continue;
    const def = getItem(p.itemId);
    if (def) total += cozinessOf(def);
  }
  for (const id of [world.house.wallpaperId, world.house.flooringId]) {
    const def = getItem(id);
    if (def) total += cozinessOf(def);
  }
  return Math.min(BALANCE.coziness.max, total);
}

/**
 * Which bed each indoor animal uses: the best beds go to animals in the order they're listed
 * (render and happiness only; the sim just needs a stable answer).
 */
export function bedAssignments(world: WorldState): Map<string, BedItemDef> {
  const beds = placedBeds(world).sort((a, b) => b.happinessPerMinute - a.happinessPerMinute);
  const out = new Map<string, BedItemDef>();
  indoorAnimals(world).forEach((a, i) => {
    const bed = beds[i];
    if (bed) out.set(a.id, bed);
  });
  return out;
}

/** Happiness per minute an indoor animal regains from Coziness and its bed. 0 outdoors. */
export function indoorHappinessPerMinute(
  world: WorldState,
  animal: Animal,
  beds = bedAssignments(world),
): number {
  if (animal.zone !== 'house') return 0;
  const { max, regenPerMinuteAtMax } = BALANCE.coziness;
  return (
    (coziness(world) / max) * regenPerMinuteAtMax + (beds.get(animal.id)?.happinessPerMinute ?? 0)
  );
}

/** Moves an animal to the other zone, to a random spot. Going in needs a free bed. */
export function switchZone(
  ctx: SimContext,
  animal: Animal,
  to: Zone,
  reason: ZoneMoveReason,
): void {
  const from = animal.zone;
  animal.zone = to;
  animal.position = randomPosition(ctx);
  ctx.emit('animalMovedZone', { animal, from, to, reason });
}

/** Drag-to-door (DESIGN 12.4): the player moves an animal in or out. */
export function moveAnimalToZone(ctx: SimContext, animalId: string, to: Zone): CommandResult {
  const world = ctx.state.world;
  const animal = findAnimal(world, animalId);
  if (!animal) return { ok: false, reason: 'Can’t find that animal.' };
  if (animal.zone === to) {
    return { ok: false, reason: to === 'house' ? 'Already inside!' : 'Already outside!' };
  }
  if (to === 'house' && !hasFreeBed(world)) {
    return {
      ok: false,
      reason:
        indoorSlots(world) === 0
          ? 'Animals need a pet bed to come inside. Get one in the Home Store!'
          : 'Every pet bed is taken!',
    };
  }
  switchZone(ctx, animal, to, 'player');
  return { ok: true };
}

/** After a bed is removed: anyone left without a bed walks outside (the last ones in). */
export function evictExtraIndoors(ctx: SimContext): void {
  const world = ctx.state.world;
  const inside = indoorAnimals(world);
  for (const animal of inside.slice(indoorSlots(world)).reverse()) {
    switchZone(ctx, animal, 'yard', 'noBed');
  }
}

/** Kept pets and unhappy animals prefer to be indoors (DESIGN 12.4). */
export function prefersIndoors(animal: Animal): boolean {
  return animal.isKept || animal.needs.happiness < BALANCE.zones.unhappyBelow;
}

/**
 * Called when an animal's wander timer fires (online): maybe switch zones. Returns true if it
 * switched. Always uses exactly one roll, so the RNG stream doesn't depend on bed counts.
 */
export function maybeSwitchZone(ctx: SimContext, animal: Animal): boolean {
  const z = BALANCE.zones;
  const roll = ctx.rng.next();
  const indoorsFan = prefersIndoors(animal);
  if (animal.zone === 'yard') {
    const chance = indoorsFan ? z.preferIndoorsIn : z.switchChance;
    if (roll >= chance || !hasFreeBed(ctx.state.world)) return false;
    switchZone(ctx, animal, 'house', 'wander');
    return true;
  }
  const chance = indoorsFan ? z.preferIndoorsOut : z.switchChance;
  if (roll >= chance) return false;
  switchZone(ctx, animal, 'yard', 'wander');
  return true;
}
