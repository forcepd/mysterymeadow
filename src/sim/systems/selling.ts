import { BALANCE } from '../../config/balance';
import type { SimContext } from '../context';
import type { Animal, CommandResult, Ms, WorldState } from '../types';
import { isReadyToSell } from './animals';
import { addCoins } from './economy';
import { careMultiplier } from './needs';
import { admitVisitors } from './visitors';

/** DESIGN 7.5. */
export function salePrice(world: WorldState, animal: Animal): number {
  const { basePrice, sparkleMultiplier } = BALANCE.rarity;
  return Math.round(
    basePrice[animal.rarity] *
      (animal.isSparkle ? sparkleMultiplier : 1) *
      careMultiplier(world, animal) *
      (1 + BALANCE.tricks.salePriceBonusPerTrick * animal.tricks.known.length),
  );
}

/** Sell requires: hold timer done, not sick, not Kept, and no babies on the way. */
export function canSell(animal: Animal, now: Ms): CommandResult {
  if (animal.isKept) return { ok: false, reason: 'This is your pet! Un-keep it first.' };
  if (animal.sickness) return { ok: false, reason: 'Too sick to sell. Visit the vet!' };
  if (animal.pregnancy) return { ok: false, reason: 'Babies are on the way!' };
  if (!isReadyToSell(animal, now)) return { ok: false, reason: 'Not ready to sell yet.' };
  return { ok: true };
}

export function findAnimal(world: WorldState, id: string): Animal | undefined {
  return world.animals.find((a) => a.id === id);
}

export function sell(ctx: SimContext, animalId: string, now: Ms): CommandResult {
  const world = ctx.state.world;
  const animal = findAnimal(world, animalId);
  if (!animal) return { ok: false, reason: "Can't find that animal." };
  const check = canSell(animal, now);
  if (!check.ok) return check;

  const price = salePrice(world, animal);
  world.animals = world.animals.filter((a) => a !== animal);
  // Outfits aren't used up by wearing them (Phase 9, your choice), so they're simply still
  // yours after a sale: nothing to return.
  addCoins(ctx, price);
  // Announced once the state is final, so listeners (like the save-after-sale) see the coins.
  ctx.emit('animalSold', { animal, price });
  // A spot just opened: anyone waiting at the gate comes in now.
  admitVisitors(ctx, now);
  return { ok: true };
}
