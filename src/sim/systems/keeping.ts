import { BALANCE } from '../../config/balance';
import type { SimContext } from '../context';
import type { Animal, CommandResult, Ms, StoredPet, WorldState } from '../types';
import { freeCapacity } from './housing';
import { findAnimal } from './selling';
import { shiftAnimal } from './timeShift';
import { admitVisitors } from './visitors';

/**
 * DESIGN 10.1: kept pets are an inventory. Pet Slots limit how many are out in the world;
 * the rest wait, paused, in Pet Storage (which doesn't count toward capacity).
 */

/** How many kept pets can be out at once. */
export function petSlots(world: WorldState): number {
  return BALANCE.petSlots.starting + world.house.petSlotsPurchased;
}

export function storageSpaces(world: WorldState): number {
  return (
    BALANCE.petStorage.starting + BALANCE.petStorage.perExpansion * world.house.storageExpansions
  );
}

/** Kept pets out in the world (each fills a Pet Slot). */
export function petsOut(world: WorldState): Animal[] {
  return world.animals.filter((a) => a.isKept);
}

export function freeSlots(world: WorldState): number {
  return Math.max(0, petSlots(world) - petsOut(world).length);
}

export function freeStorage(world: WorldState): number {
  return Math.max(0, storageSpaces(world) - world.petStorage.length);
}

export const REASONS = {
  notFound: 'Can’t find that animal.',
  alreadyKept: 'Already your pet!',
  notKept: 'That’s not one of your pets.',
  slotsFull: 'All your Pet Slots are full. Swap a pet into Storage!',
  storageFull: 'Pet Storage is full!',
  houseFull: 'Your house is full!',
  notStored: 'That pet isn’t in Storage.',
  storedUnkeep: 'Bring this pet out of Storage first.',
} as const;

/**
 * Keep an animal out in a free Pet Slot. With every slot full it's refused with
 * `REASONS.slotsFull`, and the UI opens the Swap screen.
 */
export function keep(ctx: SimContext, animalId: string): CommandResult {
  const world = ctx.state.world;
  const animal = findAnimal(world, animalId);
  if (!animal) return { ok: false, reason: REASONS.notFound };
  if (animal.isKept) return { ok: false, reason: REASONS.alreadyKept };
  if (freeSlots(world) === 0) return { ok: false, reason: REASONS.slotsFull };
  animal.isKept = true;
  ctx.emit('petKept', { animal });
  return { ok: true };
}

/** Un-keep a pet that is out: it becomes a normal animal again (sellable once healthy). */
export function unkeep(ctx: SimContext, animalId: string): CommandResult {
  const world = ctx.state.world;
  if (world.petStorage.some((p) => p.animal.id === animalId)) {
    return { ok: false, reason: REASONS.storedUnkeep };
  }
  const animal = findAnimal(world, animalId);
  if (!animal) return { ok: false, reason: REASONS.notFound };
  if (!animal.isKept) return { ok: false, reason: REASONS.notKept };
  animal.isKept = false;
  ctx.emit('petUnkept', { animal });
  return { ok: true };
}

/**
 * Moves an animal out of the world into Pet Storage, paused. Works for a kept pet in a slot,
 * or (keeping it at the same time) for any animal: "a new pet straight into Storage".
 */
export function storePet(ctx: SimContext, animalId: string, now: Ms): CommandResult {
  const world = ctx.state.world;
  const animal = findAnimal(world, animalId);
  if (!animal) return { ok: false, reason: REASONS.notFound };
  if (freeStorage(world) === 0) return { ok: false, reason: REASONS.storageFull };
  moveToStorage(ctx, animal, now);
  // A spot opened up: anyone waiting at the gate comes in now.
  admitVisitors(ctx, now);
  return { ok: true };
}

/** Takes a pet out of Storage into a free slot. Needs a free slot and room under capacity. */
export function retrievePet(ctx: SimContext, animalId: string, now: Ms): CommandResult {
  const world = ctx.state.world;
  const stored = world.petStorage.find((p) => p.animal.id === animalId);
  if (!stored) return { ok: false, reason: REASONS.notStored };
  if (freeSlots(world) === 0) return { ok: false, reason: REASONS.slotsFull };
  if (freeCapacity(world) <= 0) return { ok: false, reason: REASONS.houseFull };
  moveOut(ctx, stored, now);
  return { ok: true };
}

/**
 * Trades places in one move: kept pet `outId` goes into Storage and `storedId` comes out into
 * its slot. The animal count doesn't change, so this works even when the house is full.
 */
export function swapPets(ctx: SimContext, outId: string, storedId: string, now: Ms): CommandResult {
  const world = ctx.state.world;
  const out = findAnimal(world, outId);
  const stored = world.petStorage.find((p) => p.animal.id === storedId);
  if (!out || !out.isKept) return { ok: false, reason: REASONS.notKept };
  if (!stored) return { ok: false, reason: REASONS.notStored };
  moveToStorage(ctx, out, now);
  moveOut(ctx, stored, now);
  return { ok: true };
}

/**
 * Keeping a new animal when every slot is full: it takes `bumpId`'s slot, and that pet goes
 * into Storage. (To send the new animal straight to Storage instead, use `storePet`.)
 */
export function keepBumping(
  ctx: SimContext,
  animalId: string,
  bumpId: string,
  now: Ms,
): CommandResult {
  const world = ctx.state.world;
  const animal = findAnimal(world, animalId);
  const bump = findAnimal(world, bumpId);
  if (!animal) return { ok: false, reason: REASONS.notFound };
  if (animal.isKept) return { ok: false, reason: REASONS.alreadyKept };
  if (!bump || !bump.isKept) return { ok: false, reason: REASONS.notKept };
  if (freeStorage(world) === 0) return { ok: false, reason: REASONS.storageFull };
  moveToStorage(ctx, bump, now);
  animal.isKept = true;
  ctx.emit('petKept', { animal });
  admitVisitors(ctx, now);
  return { ok: true };
}

function moveToStorage(ctx: SimContext, animal: Animal, now: Ms): void {
  const world = ctx.state.world;
  const wasKept = animal.isKept;
  animal.isKept = true;
  world.animals = world.animals.filter((a) => a !== animal);
  world.petStorage.push({ animal, storedAt: now });
  if (!wasKept) ctx.emit('petKept', { animal });
  ctx.emit('petStored', { animal });
}

/** Out of Storage: every timer resumes where it paused. It appears in the yard by the house. */
function moveOut(ctx: SimContext, stored: StoredPet, now: Ms): void {
  const world = ctx.state.world;
  const { animal } = stored;
  world.petStorage = world.petStorage.filter((p) => p !== stored);
  shiftAnimal(animal, now - stored.storedAt);
  animal.zone = 'yard';
  animal.position = { x: ctx.rng.range(0.05, 0.3), y: ctx.rng.range(0, 0.2) };
  world.animals.push(animal);
  ctx.emit('petRetrieved', { animal });
}
