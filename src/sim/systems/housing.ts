import { BALANCE, type HouseTier } from '../../config/balance';
import type { WorldState } from '../types';

export function getHouseTier(world: WorldState): HouseTier {
  const tier = BALANCE.houseTiers.find((t) => t.id === world.house.tierId);
  if (!tier) throw new Error(`Unknown house tier "${world.house.tierId}"`);
  return tier;
}

/** DESIGN 12.2: base capacity of the house tier plus purchased room expansions. */
export function totalCapacity(world: WorldState): number {
  return getHouseTier(world).baseCapacity + world.house.roomExpansions;
}

/** Animals that count toward capacity: everything out in the world. Stored pets don't count. */
export function animalCount(world: WorldState): number {
  return world.animals.length;
}

export function freeCapacity(world: WorldState): number {
  return totalCapacity(world) - animalCount(world);
}

/** Over capacity (only births can cause this). New visitors pause until it clears. */
export function isCrowded(world: WorldState): boolean {
  return animalCount(world) > totalCapacity(world);
}

export function visitorIntervalMinutes(world: WorldState): number {
  return getHouseTier(world).visitorMinutes;
}
