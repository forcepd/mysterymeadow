import { BALANCE } from '../../config/balance';
import { getItem } from '../../config/items';
import type { SimContext } from '../context';
import type { CommandResult, PlacedItem } from '../types';
import { addCoins } from './economy';
import { NEED_MAX, addNeeds } from './needs';
import { findAnimal } from './selling';
import { tileCenterIn } from './placement';
import { hasFreeBed, switchZone } from './zones';

export function isBowl(item: PlacedItem): boolean {
  return getItem(item.itemId)?.category === 'bowl';
}

/**
 * DESIGN 8.2: a hungry animal (hunger < hungryThreshold) walks to a bowl that has food (its own
 * zone first) and eats one serving. Online only (nobody gets hungry while the player is away).
 */
export function tickFeeding(ctx: SimContext): void {
  if (ctx.offline) return;
  const world = ctx.state.world;
  for (const animal of world.animals) {
    if (animal.needs.hunger >= BALANCE.needs.hungryThreshold) continue;
    const withFood = (p: PlacedItem) => isBowl(p) && (p.servings ?? 0) > 0;
    // A bowl in its own zone, or else one in the other zone: out to the yard any time, or
    // inside if a bed is free. Nobody goes hungry just for being indoors.
    const bowl =
      world.placedItems.find((p) => p.zone === animal.zone && withFood(p)) ??
      world.placedItems.find(
        (p) => p.zone !== animal.zone && withFood(p) && (p.zone === 'yard' || hasFreeBed(world)),
      );
    if (!bowl) continue;
    if (bowl.zone !== animal.zone) switchZone(ctx, animal, bowl.zone, 'food');
    bowl.servings = (bowl.servings ?? 0) - 1;
    addNeeds(animal, BALANCE.needs.hungerPerServing, 0);
    // Stand just in front of the bowl.
    const at = tileCenterIn(world, bowl.zone, bowl.tile);
    animal.position = {
      x: Math.min(1, Math.max(0, at.x + ctx.rng.range(-0.04, 0.04))),
      y: Math.min(1, at.y + 0.12),
    };
    ctx.emit('animalAte', { animal, bowlId: bowl.id });
    if (bowl.servings === 0) ctx.emit('bowlEmptied', { bowlId: bowl.id });
  }
}

/** Tap a bowl: basic food is free and unlimited (DESIGN 8.2). */
export function refillBowl(ctx: SimContext, bowlId: string): CommandResult {
  const bowl = ctx.state.world.placedItems.find((p) => p.id === bowlId);
  if (!bowl || !isBowl(bowl)) return { ok: false, reason: 'That’s not a food bowl.' };
  if ((bowl.servings ?? 0) >= BALANCE.needs.bowlServings) {
    return { ok: false, reason: 'The bowl is already full!' };
  }
  bowl.servings = BALANCE.needs.bowlServings;
  ctx.emit('bowlRefilled', { bowlId });
  return { ok: true };
}

/** A treat costs coins and gives +hunger and +happiness (DESIGN 8.2). */
export function feedTreat(ctx: SimContext, animalId: string): CommandResult {
  const animal = findAnimal(ctx.state.world, animalId);
  if (!animal) return { ok: false, reason: 'Can’t find that animal.' };
  const { cost, hungerGain, happinessGain } = BALANCE.treat;
  if (animal.needs.hunger >= NEED_MAX && animal.needs.happiness >= NEED_MAX) {
    return { ok: false, reason: 'Too full and happy for a treat!' };
  }
  if (ctx.state.world.coins < cost) return { ok: false, reason: 'Not enough coins!' };
  addCoins(ctx, -cost);
  addNeeds(animal, hungerGain, happinessGain);
  ctx.emit('treatGiven', { animal });
  return { ok: true };
}
