import { BALANCE } from '../../config/balance';
import { getItem, type LureItemDef } from '../../config/items';
import { SPECIES, getSpecies, type SpeciesDef } from '../../config/species';
import type { Rng } from '../rng';
import { RARITIES, type Rarity, type VisitorRoll, type WorldState } from '../types';
import { getHouseTier } from './housing';

/** Lure items currently placed in the yard. Lures only work outdoors. */
function placedYardLures(world: WorldState): LureItemDef[] {
  const lures: LureItemDef[] = [];
  for (const placed of world.placedItems) {
    if (placed.zone !== 'yard') continue;
    const def = getItem(placed.itemId);
    if (def?.category === 'lure') lures.push(def);
  }
  return lures;
}

/** DESIGN 6.3: house tier base lure plus every placed yard lure, capped at maxLure. */
export function lureScore(world: WorldState): number {
  let score = getHouseTier(world).baseLure;
  for (const lure of placedYardLures(world)) score += lure.lure;
  return Math.min(Math.max(score, 0), BALANCE.rarity.maxLure);
}

/** DESIGN 6.3: weight[tier] = max(base * floorFactor, base * (1 + lure * boost)). */
export function rarityWeights(lure: number): Record<Rarity, number> {
  const { baseWeights, lureBoost, floorFactor, maxLure } = BALANCE.rarity;
  const l = Math.min(Math.max(lure, 0), maxLure);
  const out = {} as Record<Rarity, number>;
  for (const r of RARITIES) {
    const base = baseWeights[r];
    out[r] = Math.max(base * floorFactor[r], base * (1 + l * lureBoost[r]));
  }
  return out;
}

export function rollRarity(rng: Rng, lure: number): Rarity {
  const weights = rarityWeights(lure);
  return rng.weighted(RARITIES.map((r) => [r, weights[r]] as const));
}

/** How many placed yard lures attract each species. */
export function affinityCounts(world: WorldState): Map<string, number> {
  const counts = new Map<string, number>();
  for (const lure of placedYardLures(world)) {
    for (const speciesId of lure.affinity) counts.set(speciesId, (counts.get(speciesId) ?? 0) + 1);
  }
  return counts;
}

/** DESIGN 6.4: species weights within a tier. Every species starts at 1; affinity adds to it. */
export function speciesWeights(
  rarity: Rarity,
  affinity: ReadonlyMap<string, number>,
): [SpeciesDef, number][] {
  return SPECIES.filter((s) => s.rarity === rarity).map((s) => [
    s,
    1 + BALANCE.affinity.bonusPerLure * (affinity.get(s.id) ?? 0),
  ]);
}

export function rollSpecies(
  rng: Rng,
  rarity: Rarity,
  affinity: ReadonlyMap<string, number>,
): SpeciesDef {
  const entries = speciesWeights(rarity, affinity);
  if (entries.length === 0) throw new Error(`No species with rarity "${rarity}"`);
  return rng.weighted(entries);
}

export function rollSparkle(rng: Rng): boolean {
  return rng.chance(BALANCE.rarity.sparkleChance);
}

export function rollLitterSize(rng: Rng): number {
  const entries = Object.entries(BALANCE.pregnancy.litterWeights).map(
    ([size, weight]) => [Number(size), weight] as const,
  );
  return rng.weighted(entries);
}

/** Rolls a whole mystery visitor: rarity first, then species, color, Sparkle, and pregnancy. */
export function rollVisitor(rng: Rng, world: WorldState): VisitorRoll {
  const rarity = rollRarity(rng, lureScore(world));
  const species = rollSpecies(rng, rarity, affinityCounts(world));
  const variant = rng.pick(species.variants);
  const isSparkle = rollSparkle(rng);
  const litterSize = rng.chance(BALANCE.pregnancy.chance) ? rollLitterSize(rng) : 0;
  return { speciesId: species.id, variantId: variant.id, isSparkle, rarity, litterSize };
}

export function requireSpecies(id: string): SpeciesDef {
  const species = getSpecies(id);
  if (!species) throw new Error(`Unknown species "${id}"`);
  return species;
}
