import type { Animal, Ms, WorldState } from '../types';

/**
 * Moves every timer on an animal later by `delta`, so paused time doesn't count.
 * Used for the offline catch-up cap now, and for Pet Storage retrieval in Phase 5.
 * Any new timestamp field on Animal must be added here (a test enumerates them).
 */
export function shiftAnimal(animal: Animal, delta: Ms): void {
  animal.arrivedAt += delta;
  animal.holdUntil += delta;
  animal.nextPoopAt += delta;
  animal.nextWanderAt += delta;
  animal.nextPetAt += delta;
  animal.tricks.nextTrainAt += delta;
  if (animal.bornAt !== undefined) animal.bornAt += delta;
  if (animal.grownAt !== undefined) animal.grownAt += delta;
  if (animal.pregnancy) animal.pregnancy.birthAt += delta;
  if (animal.sickness) {
    animal.sickness.since += delta;
    if (animal.sickness.atClinicUntil !== undefined) animal.sickness.atClinicUntil += delta;
  }
  for (const illnessId of Object.keys(animal.immunities)) {
    animal.immunities[illnessId] = (animal.immunities[illnessId] as Ms) + delta;
  }
}

/** Shifts every world timer (not stored pets: their clocks are already paused). */
export function shiftWorld(world: WorldState, delta: Ms): void {
  world.nextVisitorAt += delta;
  for (const animal of world.animals) shiftAnimal(animal, delta);
  for (const visitor of world.gateQueue) {
    visitor.arrivedAtGate += delta;
    visitor.autoRevealAt += delta;
    visitor.leavesAt += delta;
  }
  for (const poop of world.poops) poop.createdAt += delta;
  world.nextFindAt += delta;
  for (const find of world.finds) find.expiresAt += delta;
}
