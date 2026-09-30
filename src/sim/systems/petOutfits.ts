import { getItem, type OutfitSlot, type PetOutfitItemDef } from '../../config/items';
import type { SimContext } from '../context';
import type { CommandResult } from '../types';
import { findAnimal } from './selling';

/**
 * Pet outfits (DESIGN 10.3): bought once in the Pet Boutique, then any number of animals can
 * wear it (your choice), so wearing never uses one up. Cosmetic only.
 */
export function ownsOutfit(inventory: Record<string, number>, itemId: string): boolean {
  return (inventory[itemId] ?? 0) > 0;
}

export function dressPet(ctx: SimContext, animalId: string, itemId: string): CommandResult {
  const world = ctx.state.world;
  const animal = findAnimal(world, animalId);
  if (!animal) return { ok: false, reason: 'Can’t find that animal.' };
  const def = getItem(itemId);
  if (def?.category !== 'petOutfit') return { ok: false, reason: 'That’s not an outfit.' };
  if (!ownsOutfit(world.inventory, itemId))
    return { ok: false, reason: 'Get it in the Pet Boutique first.' };
  animal.outfit[(def as PetOutfitItemDef).slot] = itemId;
  ctx.emit('petDressed', { animal });
  return { ok: true };
}

export function undressPet(ctx: SimContext, animalId: string, slot: OutfitSlot): CommandResult {
  const animal = findAnimal(ctx.state.world, animalId);
  if (!animal) return { ok: false, reason: 'Can’t find that animal.' };
  if (!animal.outfit[slot]) return { ok: false, reason: 'Nothing to take off.' };
  delete animal.outfit[slot];
  ctx.emit('petDressed', { animal });
  return { ok: true };
}
