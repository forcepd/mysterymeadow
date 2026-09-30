import { BALANCE } from '../../config/balance';
import { minutes, nextId, seconds, type SimContext } from '../context';
import type { Animal, Ms, Rarity, Vec2, Zone } from '../types';
import { NEED_MAX } from './needs';

export interface NewAnimal {
  speciesId: string;
  variantId: string;
  isSparkle: boolean;
  rarity: Rarity;
  zone: Zone;
  position: Vec2;
  /** Arrival (visitors) or birth (babies). Timers start here. */
  at: Ms;
  isBaby: boolean;
  litterSize: number;
}

/** Creates an animal with fresh timers and full needs, and records it in the Dex. */
export function createAnimal(ctx: SimContext, spec: NewAnimal): Animal {
  const { rng } = ctx;
  const animal: Animal = {
    id: nextId(ctx, 'a'),
    speciesId: spec.speciesId,
    variantId: spec.variantId,
    isSparkle: spec.isSparkle,
    rarity: spec.rarity,
    arrivedAt: spec.at,
    holdUntil: spec.at + minutes(BALANCE.holdMinutes),
    zone: spec.zone,
    position: { ...spec.position },
    needs: { hunger: NEED_MAX, happiness: NEED_MAX },
    careHistory: [],
    immunities: {},
    isKept: false,
    outfit: {},
    tricks: { known: [], progress: {}, nextTrainAt: spec.at },
    nextPoopAt: spec.at + minutes(rng.range(BALANCE.poop.minMinutes, BALANCE.poop.maxMinutes)),
    nextWanderAt:
      spec.at + seconds(rng.range(BALANCE.wander.minSeconds, BALANCE.wander.maxSeconds)),
    nextPetAt: spec.at,
  };
  if (spec.isBaby) {
    animal.bornAt = spec.at;
    animal.grownAt = spec.at + minutes(BALANCE.babyGrowMinutes);
  }
  if (spec.litterSize > 0 && !spec.isBaby) {
    animal.pregnancy = {
      birthAt: spec.at + minutes(BALANCE.pregnancy.gestationMinutes),
      litterSize: spec.litterSize,
    };
  }
  discover(ctx, animal.speciesId, animal.variantId, animal.isSparkle);
  return animal;
}

/** Adds species/variant (and Sparkle) to the Dex. */
export function discover(
  ctx: SimContext,
  speciesId: string,
  variantId: string,
  isSparkle: boolean,
): void {
  const dex = ctx.state.world.discoveredDex;
  const keys = [`${speciesId}:${variantId}`];
  if (isSparkle) keys.push(`${speciesId}:sparkle`);
  for (const key of keys) {
    if (dex.includes(key)) continue;
    dex.push(key);
    ctx.emit('dexDiscovered', { key });
  }
}

export function randomPosition(ctx: SimContext): Vec2 {
  return { x: ctx.rng.next(), y: ctx.rng.next() };
}

export function isBaby(animal: Animal, now: Ms): boolean {
  return animal.grownAt !== undefined && now < animal.grownAt;
}

export function isReadyToSell(animal: Animal, now: Ms): boolean {
  return now >= animal.holdUntil;
}
