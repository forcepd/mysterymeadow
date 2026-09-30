import { BALANCE } from '../../config/balance';
import type { SimContext } from '../context';
import type { Animal, Ms, Vec2 } from '../types';
import { createAnimal } from './animals';
import { requireSpecies, rollSparkle } from './rarity';

/**
 * DESIGN 7.3: births happen at birthAt, online or offline, and ignore capacity.
 * Babies share the mother's species; 70% keep her color, the rest roll a random one.
 * A Sparkle mother gives each baby a 25% Sparkle chance; otherwise babies roll the normal chance.
 */
export function tickBirths(ctx: SimContext, t: Ms): void {
  const world = ctx.state.world;
  // Snapshot: newborns are never pregnant, so they can't give birth this tick.
  for (const mother of [...world.animals]) {
    const pregnancy = mother.pregnancy;
    if (!pregnancy || t < pregnancy.birthAt) continue;
    delete mother.pregnancy;
    const babies: Animal[] = [];
    for (let i = 0; i < pregnancy.litterSize; i++) {
      babies.push(createBaby(ctx, mother, pregnancy.birthAt));
    }
    world.animals.push(...babies);
    ctx.summary.babiesBorn += babies.length;
    ctx.emit('animalBorn', { mother, babies });
  }
}

function createBaby(ctx: SimContext, mother: Animal, at: Ms): Animal {
  const { rng } = ctx;
  const { babyKeepsMotherColor, sparkleInheritChance } = BALANCE.pregnancy;
  const variantId = rng.chance(babyKeepsMotherColor)
    ? mother.variantId
    : rng.pick(requireSpecies(mother.speciesId).variants).id;
  const isSparkle = mother.isSparkle ? rng.chance(sparkleInheritChance) : rollSparkle(rng);
  return createAnimal(ctx, {
    speciesId: mother.speciesId,
    variantId,
    isSparkle,
    rarity: mother.rarity,
    zone: mother.zone,
    position: nearby(ctx, mother.position),
    at,
    isBaby: true,
    litterSize: 0,
  });
}

function nearby(ctx: SimContext, p: Vec2): Vec2 {
  const r = BALANCE.pregnancy.birthScatter;
  const clamp = (n: number) => Math.min(1, Math.max(0, n));
  return { x: clamp(p.x + ctx.rng.range(-r, r)), y: clamp(p.y + ctx.rng.range(-r, r)) };
}
