import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/config/balance';
import { HOUSE_COLORS, DEFAULT_HOUSE_COLOR } from '../../src/config/houseColors';
import { EXAM_TOOLS, ILLNESSES, TREATMENTS, getTreatment } from '../../src/config/illnesses';
import {
  DEFAULT_FLOORING,
  DEFAULT_WALLPAPER,
  ITEMS,
  getItem,
  isPlaceable,
  layerOf,
} from '../../src/config/items';
import { SPECIES, getSpecies } from '../../src/config/species';
import { RARITIES } from '../../src/sim/types';

describe('BALANCE', () => {
  it('is deeply frozen', () => {
    expect(Object.isFrozen(BALANCE)).toBe(true);
    expect(Object.isFrozen(BALANCE.houseTiers)).toBe(true);
    expect(Object.isFrozen(BALANCE.houseTiers[0])).toBe(true);
    expect(Object.isFrozen(BALANCE.houseTiers[0]?.interiorGrid)).toBe(true);
    expect(Object.isFrozen(BALANCE.rarity.baseWeights)).toBe(true);
    expect(() => {
      (BALANCE as { startingCoins: number }).startingCoins = 1;
    }).toThrow();
  });

  it('has the four house tiers in order with increasing cost and capacity', () => {
    expect(BALANCE.houseTiers.map((t) => t.id)).toEqual([
      'cottage',
      'bungalow',
      'farmhouse',
      'manor',
    ]);
    for (let i = 1; i < BALANCE.houseTiers.length; i++) {
      const prev = BALANCE.houseTiers[i - 1]!;
      const cur = BALANCE.houseTiers[i]!;
      expect(cur.cost).toBeGreaterThan(prev.cost);
      expect(cur.baseCapacity).toBeGreaterThan(prev.baseCapacity);
      expect(cur.visitorMinutes).toBeLessThanOrEqual(prev.visitorMinutes);
    }
    expect(BALANCE.houseTiers[0]!.cost).toBe(0);
  });

  it('has enough room expansion prices for the tier with the most expansions', () => {
    const most = Math.max(...BALANCE.houseTiers.map((t) => t.maxRoomExpansions));
    expect(BALANCE.roomExpansionCosts.length).toBeGreaterThanOrEqual(most);
  });

  it('defines every rarity table for every rarity', () => {
    const tables = [
      BALANCE.rarity.baseWeights,
      BALANCE.rarity.lureBoost,
      BALANCE.rarity.floorFactor,
      BALANCE.rarity.basePrice,
      BALANCE.tricks.maxByRarity,
    ];
    for (const table of tables) {
      expect(Object.keys(table).sort()).toEqual([...RARITIES].sort());
    }
  });

  it('keeps probabilities in [0, 1] and ranges ordered', () => {
    for (const p of [
      BALANCE.rarity.sparkleChance,
      BALANCE.pregnancy.chance,
      BALANCE.pregnancy.babyKeepsMotherColor,
      BALANCE.pregnancy.sparkleInheritChance,
      BALANCE.sickness.baseChancePerMinute,
    ]) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
    expect(BALANCE.poop.minMinutes).toBeLessThanOrEqual(BALANCE.poop.maxMinutes);
    expect(BALANCE.wander.minSeconds).toBeLessThanOrEqual(BALANCE.wander.maxSeconds);
    expect(BALANCE.care.minMultiplier).toBeLessThanOrEqual(BALANCE.care.maxMultiplier);
  });

  it('caps litters at 5 (DESIGN 7.3)', () => {
    const sizes = Object.keys(BALANCE.pregnancy.litterWeights).map(Number);
    expect(Math.max(...sizes)).toBe(5);
    expect(Math.min(...sizes)).toBe(1);
  });
});

describe('SPECIES', () => {
  // DESIGN 7.1 says "(20)" but its table lists 21; we follow the table (see PROGRESS.md).
  it('has the starter roster from the DESIGN 7.1 table with the right rarity counts', () => {
    expect(SPECIES).toHaveLength(21);
    const count = (r: string) => SPECIES.filter((s) => s.rarity === r).length;
    expect(count('common')).toBe(6);
    expect(count('uncommon')).toBe(5);
    expect(count('rare')).toBe(4);
    expect(count('epic')).toBe(3);
    expect(count('legendary')).toBe(3);
  });

  it('has unique species ids and asset keys', () => {
    expect(new Set(SPECIES.map((s) => s.id)).size).toBe(SPECIES.length);
    expect(new Set(SPECIES.map((s) => s.assetKey)).size).toBe(SPECIES.length);
  });

  it('gives each species 3–5 uniquely named color variants', () => {
    for (const s of SPECIES) {
      expect(s.variants.length, s.id).toBeGreaterThanOrEqual(3);
      expect(s.variants.length, s.id).toBeLessThanOrEqual(5);
      expect(new Set(s.variants.map((v) => v.id)).size, s.id).toBe(s.variants.length);
      for (const v of s.variants)
        for (const c of Object.values(v.colors))
          expect(c, `${s.id} ${v.id}`).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('has at least one species in every rarity so every rarity roll can resolve', () => {
    for (const r of RARITIES) expect(SPECIES.some((s) => s.rarity === r)).toBe(true);
  });

  it('looks species up by id', () => {
    expect(getSpecies('red_panda')?.name).toBe('Red Panda');
    expect(getSpecies('nope')).toBeUndefined();
  });

  it('is frozen', () => {
    expect(Object.isFrozen(SPECIES)).toBe(true);
    expect(Object.isFrozen(SPECIES[0]?.variants)).toBe(true);
  });
});

describe('ITEMS (yard lures, DESIGN 6.5)', () => {
  it('has the 10 starter lures with unique ids', () => {
    const lures = ITEMS.filter((i) => i.category === 'lure');
    expect(lures).toHaveLength(10);
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(ITEMS.length);
  });

  it('only names real species in affinities', () => {
    for (const item of ITEMS) {
      if (item.category !== 'lure') continue;
      for (const id of item.affinity) expect(getSpecies(id), `${item.id} -> ${id}`).toBeDefined();
    }
  });

  it('has positive costs (except the free starter wallpaper and flooring) and lure values', () => {
    for (const item of ITEMS) {
      if ('starter' in item && item.starter) expect(item.cost).toBe(0);
      else expect(item.cost).toBeGreaterThan(0);
      if (item.category === 'lure') expect(item.lure).toBeGreaterThan(0);
    }
    const pond = getItem('little_pond');
    expect(pond?.category === 'lure' && pond.lure).toBe(8);
    expect(getItem('food_bowl')?.category).toBe('bowl');
    expect(getItem('nope')).toBeUndefined();
  });
});

describe('ITEMS (house, DESIGN 12.3-12.4)', () => {
  it('has every decorating category, and three bed styles', () => {
    const groups = new Set(ITEMS.flatMap((i) => (i.category === 'furniture' ? [i.group] : [])));
    expect([...groups].sort()).toEqual(
      ['lamp', 'plant', 'rug', 'seating', 'shelf', 'table', 'tv', 'wallArt'].sort(),
    );
    const beds = ITEMS.filter((i) => i.category === 'bed');
    expect(beds.map((b) => b.category === 'bed' && b.style)).toEqual(['basic', 'fluffy', 'royal']);
    expect(ITEMS.some((i) => i.category === 'wallpaper')).toBe(true);
    expect(ITEMS.some((i) => i.category === 'flooring')).toBe(true);
  });

  it('beds get better with price; exactly one free starter wallpaper and flooring', () => {
    const beds = ITEMS.flatMap((i) => (i.category === 'bed' ? [i] : []));
    for (let i = 1; i < beds.length; i++) {
      expect(beds[i]!.cost).toBeGreaterThan(beds[i - 1]!.cost);
      expect(beds[i]!.happinessPerMinute).toBeGreaterThan(beds[i - 1]!.happinessPerMinute);
    }
    const starters = ITEMS.filter((i) => 'starter' in i && i.starter).map((i) => i.id);
    expect(starters.sort()).toEqual([DEFAULT_FLOORING, DEFAULT_WALLPAPER].sort());
  });

  it('every placeable item fits in the smallest grids', () => {
    for (const item of ITEMS) {
      if (!isPlaceable(item)) continue;
      expect(item.size.w).toBeGreaterThan(0);
      expect(item.size.h).toBeGreaterThan(0);
      expect(Math.max(item.size.w, item.size.h)).toBeLessThanOrEqual(5); // Yard is 12x5.
      if (layerOf(item) === 'wall') expect(item.size.h).toBe(1);
    }
  });
});

describe('HOUSE_COLORS', () => {
  it('has 8 unique swatches and a valid default', () => {
    expect(HOUSE_COLORS).toHaveLength(8);
    expect(new Set(HOUSE_COLORS.map((c) => c.id)).size).toBe(8);
    for (const c of HOUSE_COLORS) expect(c.color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(HOUSE_COLORS.map((c) => c.id)).toContain(DEFAULT_HOUSE_COLOR);
  });
});

describe('illnesses, exam tools, and treatments (DESIGN 9.4)', () => {
  it('has the six starter illnesses, each cured by its own cabinet treatment', () => {
    expect(ILLNESSES.map((i) => i.name)).toEqual([
      'Sniffles',
      'Tummy Trouble',
      'Itchy Fleas',
      'Sore Paw',
      'Spotty Fever',
      'Sleepy Sickness',
    ]);
    expect(TREATMENTS).toHaveLength(6);
    const cures = ILLNESSES.map((i) => i.treatmentId);
    expect(new Set(cures).size).toBe(ILLNESSES.length);
    for (const id of cures) expect(getTreatment(id)).toBeDefined();
  });

  it('ids are unique and every illness has a symptom icon and text', () => {
    for (const list of [ILLNESSES, TREATMENTS, EXAM_TOOLS]) {
      expect(new Set(list.map((x) => x.id)).size).toBe(list.length);
    }
    for (const i of ILLNESSES) {
      expect(i.symptomIcon).not.toBe('');
      expect(i.symptoms).not.toBe('');
    }
  });

  it('every tool reveals at least one clue for every illness', () => {
    for (const i of ILLNESSES) {
      expect(Object.keys(i.clues).sort()).toEqual(EXAM_TOOLS.map((t) => t.id).sort());
      for (const tool of EXAM_TOOLS) expect(i.clues[tool.id]!.length).toBeGreaterThan(0);
    }
  });

  it('no two illnesses look the same through all three tools', () => {
    const signature = (i: (typeof ILLNESSES)[number]) =>
      EXAM_TOOLS.map((t) => i.clues[t.id]!.map((c) => c.text).join('|')).join('#');
    expect(new Set(ILLNESSES.map(signature)).size).toBe(ILLNESSES.length);
  });

  it('sickness and vet tunables match DESIGN 15', () => {
    expect(BALANCE.vet).toEqual({ visitFee: 20, treatmentCost: 10, freeClinicWaitMinutes: 3 });
    expect(BALANCE.sickness).toMatchObject({
      baseChancePerMinute: 0.002,
      lowHungerMultiplier: 2,
      poopThreshold: 3,
      poopMultiplier: 2,
      lowHappinessMultiplier: 1.5,
      contagionPerSickPerMinute: 0.01,
      immunityMinutes: 30,
      sickHappinessDrainMultiplier: 2,
    });
  });
});
