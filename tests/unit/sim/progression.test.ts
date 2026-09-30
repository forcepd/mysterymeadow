import { describe, expect, it, vi } from 'vitest';
import { BALANCE } from '../../../src/config/balance';
import { runEconomy } from '../../../src/sim/harness/economy';
import type { Animal, PlacedItem, SimState } from '../../../src/sim/types';
import {
  ECONOMY_TIMEOUT_MS,
  HOUR,
  MIN,
  SEC,
  START,
  edit,
  makeAnimal,
  makeVisitor,
  newSim,
  play,
} from './helpers';

const FAR = START + 999 * HOUR;

function rich(coins = 1_000_000, mutate?: (s: SimState) => void) {
  return edit(newSim(), (s) => {
    s.world.coins = coins;
    s.world.settings.sicknessEnabled = false;
    s.world.nextVisitorAt = FAR;
    mutate?.(s);
  });
}

function item(
  id: string,
  itemId: string,
  zone: 'yard' | 'house',
  x: number,
  y: number,
): PlacedItem {
  return { id, itemId, zone, tile: { x, y }, rotation: 0 };
}

describe('house upgrades (DESIGN 12.1)', () => {
  it('go in order, each at its balance.ts price, and every tier number follows', () => {
    const h = rich(100_000);
    const upgraded = vi.fn();
    h.sim.events.on('houseUpgraded', upgraded);
    let coins = h.sim.state.world.coins;
    for (const tier of BALANCE.houseTiers.slice(1)) {
      expect(h.sim.realEstate().next?.id).toBe(tier.id);
      expect(h.sim.upgradeHouse()).toEqual({ ok: true });
      coins -= tier.cost;
      expect(h.sim.state.world.coins).toBe(coins);
      // Everything about the house now comes from this tier.
      expect(h.sim.houseTier()).toEqual(tier);
      expect(h.sim.capacity()).toBe(tier.baseCapacity);
      expect(h.sim.gridSize('house')).toEqual({
        cols: tier.interiorGrid[0],
        rows: tier.interiorGrid[1],
      });
      expect(h.sim.lureSlots().total).toBe(tier.lureSlots);
      expect(h.sim.lureScore()).toBe(tier.baseLure);
      expect(h.sim.realEstate().rooms.max).toBe(tier.maxRoomExpansions);
    }
    expect(upgraded.mock.calls.map((c) => c[0].tierId)).toEqual(['bungalow', 'farmhouse', 'manor']);
    expect(h.sim.realEstate().next).toBeNull();
    expect(h.sim.upgradeHouse()).toEqual({
      ok: false,
      reason: 'You have the biggest house already!',
    });
  });

  it('the new visitor interval applies from the next visitor on', () => {
    const h = rich(100_000, (s) => (s.world.nextVisitorAt = START + 10 * MIN));
    h.sim.upgradeHouse();
    const arrived = vi.fn();
    h.sim.events.on('visitorArrived', arrived);
    play(h, 10 * MIN);
    expect(arrived).toHaveBeenCalledOnce();
    expect(h.sim.msUntilNextVisitor()).toBe(BALANCE.houseTiers[1].visitorMinutes * MIN);
  });

  it('refuses without enough coins, and changes nothing', () => {
    const h = rich(1499);
    expect(h.sim.upgradeHouse()).toEqual({ ok: false, reason: 'Not enough coins!' });
    expect(h.sim.houseTier().id).toBe('cottage');
    expect(h.sim.state.world.coins).toBe(1499);
  });

  it('keeps every animal, stored pet, and item that still fits', () => {
    const h = rich(100_000, (s) => {
      for (let i = 0; i < 5; i++) s.world.animals.push(makeAnimal(s, { id: `a${i}` }));
      s.world.animals.push(makeAnimal(s, { id: 'in', zone: 'house' }));
      s.world.petStorage.push({
        animal: makeAnimal(s, { id: 'st', isKept: true }),
        storedAt: START,
      });
      s.world.placedItems.push(
        item('bed', 'bed_basic', 'house', 7, 5),
        item('sofa', 'sofa', 'house', 0, 0),
      );
    });
    const before = h.sim.toState();
    h.sim.upgradeHouse();
    const after = h.sim.state.world;
    expect(after.animals.map((a) => a.id)).toEqual(before.world.animals.map((a: Animal) => a.id));
    expect(after.petStorage).toHaveLength(1);
    expect(after.placedItems.map((p) => p.id).sort()).toEqual(['bed', 'sofa', 'start1'].sort());
    expect(h.sim.getAnimal('in')!.zone).toBe('house');
  });

  it('items that don’t fit the house go to the inventory (the last bowl never does)', () => {
    // Out of bounds even for the Bungalow's 10x7 grid (e.g. a tier was edited to be smaller).
    const h = rich(100_000, (s) => {
      s.world.placedItems.push(item('big', 'armchair', 'house', 12, 0));
      s.world.placedItems.find((p) => p.id === 'start1')!.tile = { x: 40, y: 0 };
    });
    const stored = vi.fn();
    h.sim.events.on('itemStored', stored);
    h.sim.upgradeHouse();
    const world = h.sim.state.world;
    expect(world.inventory.armchair).toBe(1);
    expect(world.placedItems.find((p) => p.id === 'big')).toBeUndefined();
    const bowl = world.placedItems.find((p) => p.itemId === 'food_bowl')!;
    expect(bowl.tile).toEqual({ x: 0, y: 0 });
    expect(stored).toHaveBeenCalledOnce();
  });

  it('the exterior color can be re-picked for free when upgrading', () => {
    const h = rich(1500);
    expect(h.sim.upgradeHouse('mint')).toEqual({ ok: true });
    expect(h.sim.state.world.house.exteriorColor).toBe('mint');
    expect(h.sim.state.world.coins).toBe(0);
    expect(rich(1_000_000).sim.upgradeHouse('plaid').ok).toBe(false);
  });

  it('bigger capacity lets a visitor waiting at the gate in right away', () => {
    const h = rich(100_000, (s) => {
      for (let i = 0; i < 6; i++) s.world.animals.push(makeAnimal(s));
      s.world.gateQueue.push(makeVisitor(s, {}, { revealed: true }));
    });
    h.sim.upgradeHouse();
    expect(h.sim.state.world.gateQueue).toHaveLength(0);
    expect(h.sim.animalCount()).toBe(7);
  });
});

describe('extra rooms, Pet Slots, Storage, paint (DESIGN 12.5)', () => {
  it('rooms: +1 capacity each at the listed prices, up to the tier’s limit', () => {
    const h = rich(100_000);
    const costs = BALANCE.roomExpansionCosts;
    expect(h.sim.realEstate().rooms).toEqual({ bought: 0, max: 2, nextCost: costs[0] });
    h.sim.buyRoomExpansion();
    h.sim.buyRoomExpansion();
    expect(h.sim.capacity()).toBe(8);
    expect(h.sim.state.world.coins).toBe(100_000 - costs[0]! - costs[1]!);
    expect(h.sim.realEstate().rooms.nextCost).toBeNull();
    expect(h.sim.buyRoomExpansion()).toEqual({
      ok: false,
      reason: 'No more room to add. Upgrade your house for more!',
    });
    // A bigger house allows more rooms; the count and prices carry on.
    h.sim.upgradeHouse();
    expect(h.sim.realEstate().rooms).toEqual({ bought: 2, max: 3, nextCost: costs[2] });
    expect(h.sim.capacity()).toBe(9 + 2);
  });

  it('Pet Slots: 6 more at the listed prices', () => {
    const h = rich();
    for (const cost of BALANCE.petSlots.costs) {
      const coins = h.sim.state.world.coins;
      expect(h.sim.buyPetSlot()).toEqual({ ok: true });
      expect(coins - h.sim.state.world.coins).toBe(cost);
    }
    expect(h.sim.petSlots().total).toBe(2 + 6);
    expect(h.sim.buyPetSlot()).toEqual({ ok: false, reason: 'You have every Pet Slot!' });
  });

  it('Storage: +10 spaces each, 3 times', () => {
    const h = rich();
    for (const cost of BALANCE.petStorage.expansionCosts) {
      const coins = h.sim.state.world.coins;
      expect(h.sim.buyStorageExpansion().ok).toBe(true);
      expect(coins - h.sim.state.world.coins).toBe(cost);
    }
    expect(h.sim.petStorage().total).toBe(50);
    expect(h.sim.buyStorageExpansion().ok).toBe(false);
  });

  it('repainting costs 50 and needs a real, different color', () => {
    const h = rich(60);
    expect(h.sim.changeHouseColor('butter')).toEqual({
      ok: false,
      reason: 'It’s already that color!',
    });
    expect(h.sim.changeHouseColor('nope').ok).toBe(false);
    expect(h.sim.changeHouseColor('rose')).toEqual({ ok: true });
    expect(h.sim.state.world.coins).toBe(10);
    expect(h.sim.changeHouseColor('sky')).toEqual({ ok: false, reason: 'Not enough coins!' });
  });

  it('every purchase refuses without enough coins and changes nothing', () => {
    const h = rich(0);
    for (const buy of [
      () => h.sim.buyRoomExpansion(),
      () => h.sim.buyPetSlot(),
      () => h.sim.buyStorageExpansion(),
    ]) {
      expect(buy()).toEqual({ ok: false, reason: 'Not enough coins!' });
    }
    expect(h.sim.state.world.house).toMatchObject({
      roomExpansions: 0,
      petSlotsPurchased: 0,
      storageExpansions: 0,
    });
  });
});

describe('helpers', () => {
  function poops(s: SimState, n: number, zone: 'yard' | 'house' = 'yard') {
    for (let i = 0; i < n; i++) {
      s.world.poops.push({
        id: `${zone}p${i}`,
        zone,
        position: { x: 0.5, y: 0.5 },
        createdAt: START + i,
      });
    }
  }

  it('are bought once in the Home Store and never placed', () => {
    const h = rich();
    expect(h.sim.hasHelper('scoopBot')).toBe(false);
    expect(h.sim.buyItem('scoop_bot')).toEqual({ ok: true });
    expect(h.sim.hasHelper('scoopBot')).toBe(true);
    expect(h.sim.buyItem('scoop_bot')).toEqual({ ok: false, reason: 'You already have it!' });
    expect(h.sim.placeItem('scoop_bot', 'yard', { x: 0, y: 0 }).ok).toBe(false);
  });

  it('Scoop Bot cleans the oldest yard poop once a minute, never house poop', () => {
    const h = rich(1_000_000, (s) => {
      s.world.inventory.scoop_bot = 1;
      poops(s, 3);
      poops(s, 2, 'house');
    });
    const cleaned = vi.fn();
    h.sim.events.on('poopCleaned', cleaned);
    play(h, MIN - SEC);
    expect(cleaned).not.toHaveBeenCalled();
    play(h, SEC);
    expect(cleaned).toHaveBeenCalledWith(expect.objectContaining({ by: 'scoopBot' }));
    expect(cleaned.mock.calls[0]![0].poop.id).toBe('yardp0');
    play(h, 5 * MIN);
    expect(h.sim.state.world.poops.map((p) => p.id).sort()).toEqual(['housep0', 'housep1']);
  });

  it('Auto-Feeder refills every empty bowl within a minute', () => {
    const h = rich(1_000_000, (s) => {
      s.world.inventory.auto_feeder = 1;
      s.world.placedItems.push({ ...item('b2', 'food_bowl', 'house', 0, 0), servings: 0 });
      s.world.placedItems.find((p) => p.id === 'start1')!.servings = 0;
    });
    play(h, MIN);
    expect(h.sim.bowls().map((b) => b.servings)).toEqual([5, 5]);
  });

  it('do nothing without being bought, or while the player is away', () => {
    const h = rich(1_000_000, (s) => {
      poops(s, 2);
      s.world.placedItems.find((p) => p.id === 'start1')!.servings = 0;
    });
    play(h, 5 * MIN);
    expect(h.sim.state.world.poops).toHaveLength(2);
    edit(h, (s) => {
      s.world.inventory.scoop_bot = 1;
      s.world.inventory.auto_feeder = 1;
    });
    h.clock.advance(2 * HOUR);
    h.sim.catchUp();
    expect(h.sim.state.world.poops).toHaveLength(2);
    expect(h.sim.bowls()[0]!.servings).toBe(0);
  });
});

describe('all four tiers are reachable (Phase 7 done-when)', () => {
  it(
    'a player who saves up moves all the way to the Grand Manor',
    () => {
      const r = runEconomy({ hours: 36, seed: 1, spend: true });
      const reached = Object.entries(r.hoursToReach);
      expect(reached.map(([id]) => id)).toEqual(['bungalow', 'farmhouse', 'manor']);
      for (const [, h] of reached) expect(h).not.toBeNull();
      const [b, f, m] = reached.map(([, h]) => h!);
      expect(b).toBeLessThan(f!);
      expect(f).toBeLessThan(m!);
    },
    ECONOMY_TIMEOUT_MS,
  );

  it(
    'the first upgrade takes a few hours of play, on average (DESIGN 15.1)',
    () => {
      // Averaged, so one lucky early Legendary can't decide it. Includes the new-player quick start.
      const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
      const avg =
        seeds
          .map((seed) => runEconomy({ hours: 12, seed, spend: true }).hoursToReach.bungalow ?? 12)
          .reduce((a, b) => a + b, 0) / seeds.length;
      expect(avg).toBeGreaterThan(1.5);
      expect(avg).toBeLessThan(6);
    },
    ECONOMY_TIMEOUT_MS,
  );
});
