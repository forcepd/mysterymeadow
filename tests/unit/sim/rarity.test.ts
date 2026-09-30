import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../../src/config/balance';
import { SPECIES } from '../../../src/config/species';
import { Rng } from '../../../src/sim/rng';
import {
  affinityCounts,
  lureScore,
  rarityWeights,
  rollLitterSize,
  rollRarity,
  rollSpecies,
  rollVisitor,
  speciesWeights,
} from '../../../src/sim/systems/rarity';
import { RARITIES, type PlacedItem, type Rarity, type WorldState } from '../../../src/sim/types';
import { newSim } from './helpers';

function share(weights: Record<Rarity, number>): Record<Rarity, number> {
  const total = RARITIES.reduce((sum, r) => sum + weights[r], 0);
  return Object.fromEntries(RARITIES.map((r) => [r, weights[r] / total])) as Record<Rarity, number>;
}

function world(): WorldState {
  return newSim().sim.toState().world;
}

function placed(itemId: string, zone: 'yard' | 'house' = 'yard'): PlacedItem {
  return { id: `p-${itemId}-${zone}`, itemId, zone, tile: { x: 0, y: 0 }, rotation: 0 };
}

describe('rarity weights (DESIGN 6.3)', () => {
  it('uses the base weights at lure 0', () => {
    expect(rarityWeights(0)).toEqual(BALANCE.rarity.baseWeights);
    const s = share(rarityWeights(0));
    expect(s.legendary).toBeCloseTo(0.01);
    expect(s.epic).toBeCloseTo(0.04);
    expect(s.rare).toBeCloseTo(0.1);
  });

  it('matches the worked example at lure 50', () => {
    const s = share(rarityWeights(50));
    expect(s.legendary).toBeCloseTo(0.03, 2);
    expect(s.epic).toBeCloseTo(0.1, 2);
    expect(s.rare).toBeCloseTo(0.2, 2);
  });

  it('matches the worked example at lure 100, with common held at its floor', () => {
    const w = rarityWeights(100);
    expect(w.common).toBeCloseTo(60 * 0.3);
    const s = share(w);
    expect(s.legendary).toBeCloseTo(0.042, 2);
    expect(s.epic).toBeCloseTo(0.134, 2);
    expect(s.rare).toBeCloseTo(0.252, 2);
  });

  it('clamps lure to 0..maxLure', () => {
    expect(rarityWeights(250)).toEqual(rarityWeights(BALANCE.rarity.maxLure));
    expect(rarityWeights(-10)).toEqual(rarityWeights(0));
  });

  it('never lets a weight go below its floor', () => {
    for (let lure = 0; lure <= 100; lure += 5) {
      const w = rarityWeights(lure);
      for (const r of RARITIES) {
        expect(w[r]).toBeGreaterThanOrEqual(
          BALANCE.rarity.baseWeights[r] * BALANCE.rarity.floorFactor[r],
        );
      }
    }
  });

  it('rolls rarities within ±1% of the expected share over 100k rolls (lure 50)', () => {
    const rng = new Rng(7);
    const counts = Object.fromEntries(RARITIES.map((r) => [r, 0])) as Record<Rarity, number>;
    const n = 100_000;
    for (let i = 0; i < n; i++) counts[rollRarity(rng, 50)]++;
    const expected = share(rarityWeights(50));
    for (const r of RARITIES) expect(Math.abs(counts[r] / n - expected[r])).toBeLessThan(0.01);
  });
});

describe('lure score', () => {
  it('is the house tier base lure with nothing placed', () => {
    const w = world();
    expect(lureScore(w)).toBe(0);
    w.house.tierId = 'manor';
    expect(lureScore(w)).toBe(30);
  });

  it('adds placed yard lures but ignores lures in the house', () => {
    const w = world();
    w.placedItems.push(placed('carrot_patch'), placed('little_pond'), placed('warm_rock', 'house'));
    expect(lureScore(w)).toBe(4 + 8);
  });

  it('caps at maxLure', () => {
    const w = world();
    w.house.tierId = 'manor';
    for (let i = 0; i < 10; i++) w.placedItems.push({ ...placed('rainbow_fountain'), id: `f${i}` });
    expect(lureScore(w)).toBe(BALANCE.rarity.maxLure);
  });

  it('ignores unknown item ids', () => {
    const w = world();
    w.placedItems.push(placed('not_a_real_item'));
    expect(lureScore(w)).toBe(0);
  });
});

describe('species affinity (DESIGN 6.4)', () => {
  it('weights every species in a tier equally with no lures', () => {
    const entries = speciesWeights('common', new Map());
    expect(entries.map(([s]) => s.id)).toEqual(
      SPECIES.filter((s) => s.rarity === 'common').map((s) => s.id),
    );
    expect(entries.every(([, w]) => w === 1)).toBe(true);
  });

  it('counts affinities from yard lures only, stacking per lure', () => {
    const w = world();
    w.placedItems.push(
      placed('little_pond'),
      { ...placed('little_pond'), id: 'pond2' },
      placed('bird_bath'),
      placed('bamboo_grove', 'house'),
    );
    const counts = affinityCounts(w);
    expect(counts.get('duckling')).toBe(3);
    expect(counts.get('otter')).toBe(2);
    expect(counts.get('red_panda')).toBeUndefined();
  });

  it('shifts species odds within the tier', () => {
    const rng = new Rng(3);
    const affinity = new Map([['red_panda', 3]]);
    const n = 40_000;
    let pandas = 0;
    for (let i = 0; i < n; i++) if (rollSpecies(rng, 'rare', affinity).id === 'red_panda') pandas++;
    // Rare tier has 4 species: red panda weight 1 + 3 = 4, others 1 each -> 4/7.
    expect(pandas / n).toBeCloseTo(4 / 7, 1.5);
  });

  it('only ever rolls species of the requested rarity', () => {
    const rng = new Rng(4);
    const affinity = new Map([['unicorn', 5]]);
    for (let i = 0; i < 2000; i++)
      expect(rollSpecies(rng, 'common', affinity).rarity).toBe('common');
  });

  it('does not change the rarity roll', () => {
    const a = new Rng(9);
    const b = new Rng(9);
    // Carrot Patch and Bird Bath both give +4 lure but attract different species.
    const w1 = world();
    const w2 = world();
    w1.placedItems.push(placed('carrot_patch'));
    w2.placedItems.push(placed('bird_bath'));
    for (let i = 0; i < 500; i++) expect(rollVisitor(a, w1).rarity).toBe(rollVisitor(b, w2).rarity);
  });
});

describe('visitor roll', () => {
  it('rolls Sparkle at about 2% and pregnancy at about 30%', () => {
    const rng = new Rng(11);
    const w = world();
    const n = 100_000;
    let sparkle = 0;
    let pregnant = 0;
    for (let i = 0; i < n; i++) {
      const roll = rollVisitor(rng, w);
      if (roll.isSparkle) sparkle++;
      if (roll.litterSize > 0) pregnant++;
    }
    expect(Math.abs(sparkle / n - BALANCE.rarity.sparkleChance)).toBeLessThan(0.002);
    expect(Math.abs(pregnant / n - BALANCE.pregnancy.chance)).toBeLessThan(0.01);
  });

  it('always rolls a real variant of the rolled species', () => {
    const rng = new Rng(12);
    const w = world();
    for (let i = 0; i < 5000; i++) {
      const roll = rollVisitor(rng, w);
      const species = SPECIES.find((s) => s.id === roll.speciesId)!;
      expect(species.rarity).toBe(roll.rarity);
      expect(species.variants.map((v) => v.id)).toContain(roll.variantId);
    }
  });

  it('rolls litter sizes 1-5 with the configured weights', () => {
    const rng = new Rng(13);
    const counts = [0, 0, 0, 0, 0, 0];
    const n = 100_000;
    for (let i = 0; i < n; i++) counts[rollLitterSize(rng)]!++;
    expect(counts[0]).toBe(0);
    const weights = BALANCE.pregnancy.litterWeights;
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    for (const size of [1, 2, 3, 4, 5] as const) {
      expect(Math.abs(counts[size]! / n - weights[size] / total)).toBeLessThan(0.01);
    }
  });
});
