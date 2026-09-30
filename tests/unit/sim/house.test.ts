import { describe, expect, it, vi } from 'vitest';
import { BALANCE } from '../../../src/config/balance';
import { getItem } from '../../../src/config/items';
import { emptySummary, type SimContext } from '../../../src/sim/context';
import { Rng } from '../../../src/sim/rng';
import { debugSetNeeds } from '../../../src/sim/debugCommands';
import { tickSickness } from '../../../src/sim/systems/sickness';
import type { Animal, PlacedItem, SimState } from '../../../src/sim/types';
import { HOUR, MIN, SEC, START, edit, makeAnimal, newSim, play } from './helpers';

const FAR = START + 999 * HOUR;

/** A quiet world: no visitors or sickness unless a test asks; lots of coins. */
function house(mutate?: (s: SimState) => void) {
  return edit(newSim(), (s) => {
    s.world.coins = 100_000;
    s.world.settings.sicknessEnabled = false;
    s.world.nextVisitorAt = FAR;
    mutate?.(s);
  });
}

let placedN = 0;
function placed(itemId: string, zone: 'yard' | 'house', x: number, y: number): PlacedItem {
  const item: PlacedItem = { id: `pi${++placedN}`, itemId, zone, tile: { x, y }, rotation: 0 };
  if (getItem(itemId)?.category === 'bowl') item.servings = BALANCE.needs.bowlServings;
  return item;
}

function beds(s: SimState, n: number): void {
  for (let i = 0; i < n; i++)
    s.world.placedItems.push(placed('bed_basic', 'house', i % 8, Math.floor(i / 8)));
}

function animals(s: SimState, n: number, extra: Partial<Animal> = {}): void {
  for (let i = 0; i < n; i++) {
    s.world.animals.push(makeAnimal(s, { id: `a${i}`, nextPoopAt: FAR, holdUntil: FAR, ...extra }));
  }
}

describe('Home Store purchases', () => {
  it('buying costs coins and adds one to the inventory', () => {
    const h = house((s) => (s.world.coins = 100));
    const bought = vi.fn();
    h.sim.events.on('itemBought', bought);
    expect(h.sim.buyItem('bed_basic')).toEqual({ ok: true });
    expect(h.sim.state.world.coins).toBe(100 - 60);
    expect(h.sim.state.world.inventory).toEqual({ bed_basic: 1 });
    expect(h.sim.buyItem('sofa')).toEqual({ ok: false, reason: 'Not enough coins!' });
    expect(h.sim.buyItem('nope').ok).toBe(false);
    expect(bought).toHaveBeenCalledOnce();
  });

  it('wallpaper and flooring are bought once; the starters are owned from the start', () => {
    const h = house();
    expect(h.sim.ownedCount('wallpaper_cream')).toBe(1);
    expect(h.sim.buyItem('wallpaper_cream')).toEqual({ ok: false, reason: 'You already have it!' });
    expect(h.sim.buyItem('wallpaper_mint').ok).toBe(true);
    expect(h.sim.buyItem('wallpaper_mint').ok).toBe(false);
  });
});

describe('placing items (DESIGN 12.3, 6.5)', () => {
  it('places from the inventory onto a free tile, and stores back', () => {
    const h = house();
    h.sim.buyItem('armchair');
    const r = h.sim.placeItem('armchair', 'house', { x: 2, y: 3 });
    expect(r.ok).toBe(true);
    expect(h.sim.state.world.inventory.armchair).toBeUndefined();
    expect(h.sim.placeItem('armchair', 'house', { x: 0, y: 0 })).toEqual({
      ok: false,
      reason: 'You don’t have one to place.',
    });
    expect(h.sim.storeItem(r.placedId!)).toEqual({ ok: true });
    expect(h.sim.state.world.inventory.armchair).toBe(1);
  });

  it('keeps footprints inside the grid (house 8x6 for the Cottage, yard 12x5)', () => {
    const h = house((s) => (s.world.inventory = { sofa: 2, little_pond: 1 }));
    expect(h.sim.gridSize('house')).toEqual({ cols: 8, rows: 6 });
    expect(h.sim.gridSize('yard')).toEqual({ cols: 12, rows: 5 });
    expect(h.sim.canPlace('sofa', 'house', { x: 7, y: 0 }).ok).toBe(false); // 2 wide
    expect(h.sim.canPlace('sofa', 'house', { x: 6, y: 5 }).ok).toBe(true);
    expect(h.sim.canPlace('sofa', 'house', { x: 0, y: 6 }).ok).toBe(false);
    expect(h.sim.canPlace('sofa', 'house', { x: -1, y: 0 }).ok).toBe(false);
    expect(h.sim.canPlace('little_pond', 'yard', { x: 10, y: 4 }).ok).toBe(true);
    expect(h.sim.canPlace('little_pond', 'yard', { x: 11, y: 4 }).ok).toBe(false);
  });

  it('refuses overlaps on the same layer; rugs go under furniture', () => {
    const h = house((s) => (s.world.inventory = { sofa: 2, round_rug: 2 }));
    h.sim.placeItem('sofa', 'house', { x: 2, y: 2 });
    expect(h.sim.canPlace('sofa', 'house', { x: 3, y: 2 })).toEqual({
      ok: false,
      reason: 'Something is already there.',
    });
    expect(h.sim.canPlace('sofa', 'house', { x: 4, y: 2 }).ok).toBe(true);
    expect(h.sim.placeItem('round_rug', 'house', { x: 2, y: 2 }).ok).toBe(true);
    expect(h.sim.canPlace('round_rug', 'house', { x: 3, y: 3 }).ok).toBe(false);
  });

  it('wall art hangs on the one-row wall strip, apart from the floor', () => {
    const h = house((s) => (s.world.inventory = { paw_poster: 2, sofa: 1 }));
    expect(h.sim.gridSize('house', true)).toEqual({ cols: 8, rows: 1 });
    expect(h.sim.placeItem('paw_poster', 'house', { x: 0, y: 0 }).ok).toBe(true);
    expect(h.sim.canPlace('paw_poster', 'house', { x: 0, y: 1 }).ok).toBe(false);
    expect(h.sim.canPlace('paw_poster', 'house', { x: 1, y: 0 }).ok).toBe(false);
    expect(h.sim.placeItem('sofa', 'house', { x: 0, y: 0 }).ok).toBe(true); // Floor, below it.
  });

  it('items only go in their zones: lures outside, furniture and beds inside, bowls either', () => {
    const h = house();
    expect(h.sim.canPlace('carrot_patch', 'house', { x: 0, y: 0 })).toEqual({
      ok: false,
      reason: 'That goes in the yard.',
    });
    expect(h.sim.canPlace('bed_basic', 'yard', { x: 5, y: 1 })).toEqual({
      ok: false,
      reason: 'That goes inside the house.',
    });
    expect(h.sim.canPlace('food_bowl', 'house', { x: 0, y: 0 }).ok).toBe(true);
    expect(h.sim.canPlace('food_bowl', 'yard', { x: 5, y: 1 }).ok).toBe(true);
    expect(h.sim.canPlace('wallpaper_mint', 'house', { x: 0, y: 0 }).ok).toBe(false);
  });

  it('moves and rotates (90° swaps the footprint), refusing spots that don’t fit', () => {
    const h = house((s) => (s.world.inventory = { sofa: 1, armchair: 1 }));
    const sofa = h.sim.placeItem('sofa', 'house', { x: 0, y: 0 }).placedId!;
    expect(h.sim.moveItem(sofa, { x: 5, y: 4 })).toEqual({ ok: true });
    expect(h.sim.rotateItem(sofa)).toEqual({ ok: true });
    const item = h.sim.state.world.placedItems.find((p) => p.id === sofa)!;
    expect(item.rotation).toBe(90);
    // Now 1 wide, 2 tall: at y 5 it would hang off the bottom.
    expect(h.sim.moveItem(sofa, { x: 7, y: 5 }).ok).toBe(false);
    expect(h.sim.moveItem(sofa, { x: 7, y: 4 }).ok).toBe(true);
    // In the last column, 180° (2 wide) doesn't fit, so rotating skips to 270°.
    expect(h.sim.rotateItem(sofa)).toEqual({ ok: true });
    expect(item.rotation).toBe(270);
    // Wall art only turns around, never onto its side.
    h.sim.buyItem('paw_poster');
    const poster = h.sim.placeItem('paw_poster', 'house', { x: 0, y: 0 }).placedId!;
    h.sim.rotateItem(poster);
    expect(h.sim.state.world.placedItems.find((p) => p.id === poster)!.rotation).toBe(180);
    expect(h.sim.canPlace('paw_poster', 'house', { x: 4, y: 0 }, 90).ok).toBe(false);
  });

  it('the yard has lure slots per tier: 3 for the Cottage', () => {
    const h = house((s) => (s.world.inventory = { carrot_patch: 4 }));
    for (let i = 0; i < 3; i++) {
      expect(h.sim.placeItem('carrot_patch', 'yard', { x: 3 + i * 2, y: 3 }).ok).toBe(true);
    }
    expect(h.sim.lureSlots()).toEqual({ total: 3, used: 3 });
    expect(h.sim.placeItem('carrot_patch', 'yard', { x: 3, y: 1 })).toEqual({
      ok: false,
      reason: 'All 3 lure slots are full!',
    });
    // Moving a placed lure doesn't need another slot.
    const lure = h.sim.state.world.placedItems.find((p) => p.itemId === 'carrot_patch')!;
    expect(h.sim.moveItem(lure.id, { x: 3, y: 1 }).ok).toBe(true);
  });

  it('placed yard lures feed Lure Score and species affinity; stored ones don’t', () => {
    const h = house((s) => (s.world.inventory = { little_pond: 1, flower_garden: 1 }));
    expect(h.sim.lureScore()).toBe(0);
    const pond = h.sim.placeItem('little_pond', 'yard', { x: 4, y: 2 }).placedId!;
    h.sim.placeItem('flower_garden', 'yard', { x: 8, y: 2 });
    expect(h.sim.lureScore()).toBe(8 + 6);
    h.sim.storeItem(pond);
    expect(h.sim.lureScore()).toBe(6);
  });

  it('the last food bowl can’t be stored; a placed bowl starts full', () => {
    const h = house((s) => (s.world.inventory = { food_bowl: 1 }));
    const start = h.sim.bowls()[0]!.id;
    expect(h.sim.storeItem(start)).toEqual({
      ok: false,
      reason: 'Your animals need at least one food bowl!',
    });
    const inside = h.sim.placeItem('food_bowl', 'house', { x: 0, y: 5 }).placedId!;
    expect(h.sim.bowls().find((b) => b.id === inside)!.servings).toBe(BALANCE.needs.bowlServings);
    expect(h.sim.storeItem(start).ok).toBe(true);
    expect(h.sim.storeItem(inside).ok).toBe(false);
  });

  it('wallpaper and flooring apply only when owned', () => {
    const h = house();
    expect(h.sim.applySurface('wallpaper_sky')).toEqual({
      ok: false,
      reason: 'Buy it in the Home Store first.',
    });
    h.sim.buyItem('wallpaper_sky');
    expect(h.sim.applySurface('wallpaper_sky').ok).toBe(true);
    expect(h.sim.state.world.house.wallpaperId).toBe('wallpaper_sky');
    expect(h.sim.applySurface('sofa').ok).toBe(false);
  });
});

describe('beds and zones (DESIGN 12.4)', () => {
  it('indoor slots = pet beds in the house; beds add no capacity', () => {
    const h = house((s) => beds(s, 3));
    expect(h.sim.indoorSlots()).toEqual({ total: 3, used: 0 });
    expect(h.sim.capacity()).toBe(6);
  });

  it('drag to the door: in needs a free bed, out always works', () => {
    const h = house((s) => animals(s, 3));
    expect(h.sim.moveAnimalToZone('a0', 'house')).toEqual({
      ok: false,
      reason: 'Animals need a pet bed to come inside. Get one in the Home Store!',
    });
    h.sim.buyItem('bed_basic');
    h.sim.placeItem('bed_basic', 'house', { x: 0, y: 0 });
    expect(h.sim.moveAnimalToZone('a0', 'house')).toEqual({ ok: true });
    expect(h.sim.getAnimal('a0')!.zone).toBe('house');
    expect(h.sim.moveAnimalToZone('a1', 'house')).toEqual({
      ok: false,
      reason: 'Every pet bed is taken!',
    });
    expect(h.sim.moveAnimalToZone('a0', 'house')).toEqual({ ok: false, reason: 'Already inside!' });
    expect(h.sim.moveAnimalToZone('a0', 'yard')).toEqual({ ok: true });
    expect(h.sim.moveAnimalToZone('a1', 'house').ok).toBe(true);
  });

  it('storing a bed in use sends its animal outside', () => {
    const h = house((s) => {
      animals(s, 2, { zone: 'house' });
      beds(s, 2);
    });
    const bed = h.sim.state.world.placedItems.find((p) => p.itemId === 'bed_basic')!;
    const moved = vi.fn();
    h.sim.events.on('animalMovedZone', moved);
    h.sim.storeItem(bed.id);
    expect(h.sim.indoorSlots()).toEqual({ total: 1, used: 1 });
    expect(moved).toHaveBeenCalledWith(expect.objectContaining({ to: 'yard', reason: 'noBed' }));
  });

  /** Plays and checks the indoor count against the beds on every single tick. */
  function watch(h: ReturnType<typeof house>, ms: number) {
    const inside = new Set<string>();
    let max = 0;
    let ticks = 0;
    let occupied = 0;
    const end = h.clock.now() + ms;
    while (h.clock.now() < end) {
      h.clock.advance(SEC);
      h.sim.update();
      const now = h.sim.state.world.animals.filter((a) => a.zone === 'house');
      max = Math.max(max, now.length);
      expect(now.length).toBeLessThanOrEqual(h.sim.indoorSlots().total);
      for (const a of now) inside.add(a.id);
      ticks++;
      if (now.length > 0) occupied++;
    }
    return { visitors: inside.size, max, occupiedShare: occupied / ticks };
  }

  it('example: capacity 7, 1 bed -> at most 1 inside; one wanders in, another wanders out', () => {
    const h = house((s) => {
      s.world.house.roomExpansions = 1; // Capacity 7.
      animals(s, 7);
      beds(s, 1);
    });
    expect(h.sim.capacity()).toBe(7);
    const r = watch(h, 3 * HOUR);
    expect(r.max).toBe(1);
    expect(r.visitors).toBeGreaterThanOrEqual(5); // Many different animals take turns.
    expect(r.occupiedShare).toBeGreaterThan(0.5); // The bed is in use most of the time.
  });

  it('example: capacity 7, 7 beds -> all 7 can be indoors', () => {
    const h = house((s) => {
      s.world.house.roomExpansions = 1;
      animals(s, 7);
      beds(s, 7);
    });
    for (let i = 0; i < 7; i++) expect(h.sim.moveAnimalToZone(`a${i}`, 'house').ok).toBe(true);
    expect(h.sim.indoorSlots()).toEqual({ total: 7, used: 7 });
    // And on their own too: kept pets like it inside, so all 7 end up in together.
    const h2 = house((s) => {
      s.world.house.roomExpansions = 1;
      animals(s, 7, { isKept: true });
      beds(s, 7);
    });
    expect(watch(h2, 2 * HOUR).max).toBe(7);
  });

  it('kept pets and unhappy animals spend more time indoors', () => {
    /** Share of time inside over 4 hours, with happiness held at `happiness`. */
    const share = (extra: Partial<Animal>, happiness: number) => {
      const h = house((s) => {
        animals(s, 4, extra);
        beds(s, 4);
      });
      let inside = 0;
      let samples = 0;
      const end = h.clock.now() + 4 * HOUR;
      while (h.clock.now() < end) {
        debugSetNeeds(h.sim, 100, happiness);
        h.clock.advance(10 * SEC);
        h.sim.update();
        inside += h.sim.indoorSlots().used;
        samples += 4;
      }
      return inside / samples;
    };
    // Switching 25% each way -> about half the time inside.
    const normal = share({}, 100);
    expect(normal).toBeGreaterThan(0.35);
    expect(normal).toBeLessThan(0.65);
    // In 60%, out 10% -> about 86% inside.
    expect(share({ isKept: true }, 100)).toBeGreaterThan(0.75);
    expect(share({}, 30)).toBeGreaterThan(0.75);
  });

  it('nobody switches zones while the player is away', () => {
    const h = house((s) => {
      animals(s, 4);
      beds(s, 4);
    });
    const moved = vi.fn();
    h.sim.events.on('animalMovedZone', moved);
    h.clock.advance(6 * HOUR);
    h.sim.catchUp();
    expect(h.sim.indoorSlots().used).toBe(0);
    expect(moved).not.toHaveBeenCalled();
  });

  it('contagion stays in its zone when some animals are inside', () => {
    const state = house((s) => beds(s, 50)).sim.toState();
    const sick = makeAnimal(state, {
      zone: 'house',
      sickness: { illnessId: 'sniffles', since: START },
    });
    state.world.animals.push(sick);
    const yard: Animal[] = [];
    const inside: Animal[] = [];
    for (let i = 0; i < 40_000; i++) {
      const a = makeAnimal(state, { zone: i % 2 ? 'house' : 'yard', nextPoopAt: FAR });
      (a.zone === 'house' ? inside : yard).push(a);
      state.world.animals.push(a);
    }
    state.world.settings.sicknessEnabled = true;
    const ctx: SimContext = {
      state,
      rng: new Rng(3),
      offline: false,
      summary: emptySummary(),
      emit: () => {},
    };
    tickSickness(ctx, START + MIN);
    const rate = (list: Animal[]) => list.filter((a) => a.sickness).length / list.length;
    expect(rate(yard)).toBeLessThan(0.004); // Base 0.002 only.
    expect(rate(inside)).toBeGreaterThan(0.009); // Base + 0.01 contagion.
  });
});

describe('Coziness (DESIGN 12.3) and beds restore happiness', () => {
  it('sums house decor, beds, wallpaper, and flooring, capped at 100', () => {
    const h = house((s) => {
      s.world.placedItems.push(placed('sofa', 'house', 0, 0), placed('bed_royal', 'house', 3, 3));
      s.world.placedItems.push(placed('flower_garden', 'yard', 5, 2)); // Yard: no coziness.
    });
    expect(h.sim.coziness()).toBe(12 + 8);
    h.sim.buyItem('wallpaper_sky');
    h.sim.applySurface('wallpaper_sky');
    expect(h.sim.coziness()).toBe(12 + 8 + 8);
    const lots = house((s) => {
      for (let i = 0; i < 20; i++)
        s.world.placedItems.push(placed('tv', 'house', i % 8, Math.floor(i / 8)));
    });
    expect(lots.sim.coziness()).toBe(100);
  });

  it('indoors, happiness comes back from Coziness plus the bed; outdoors it doesn’t', () => {
    const h = house((s) => {
      for (let i = 0; i < 20; i++)
        s.world.placedItems.push(placed('tv', 'house', i % 8, Math.floor(i / 8)));
      s.world.placedItems.push(placed('bed_royal', 'house', 4, 5));
      animals(s, 1, { zone: 'house', needs: { hunger: 100, happiness: 40 }, nextWanderAt: FAR });
      s.world.animals.push(
        makeAnimal(s, {
          id: 'out',
          needs: { hunger: 100, happiness: 40 },
          nextWanderAt: FAR,
          nextPoopAt: FAR,
        }),
      );
    });
    expect(h.sim.indoorHappinessPerMinute('a0')).toBeCloseTo(1.5 + 1, 9);
    expect(h.sim.indoorHappinessPerMinute('out')).toBe(0);
    play(h, 10 * MIN);
    const drain = (10 / 40) * 100;
    expect(h.sim.getAnimal('a0')!.needs.happiness).toBeCloseTo(40 - drain + 25, 4);
    expect(h.sim.getAnimal('out')!.needs.happiness).toBeCloseTo(40 - drain, 4);
  });

  it('a bare room with a Basic bed barely helps', () => {
    const h = house((s) => {
      beds(s, 1);
      animals(s, 1, { zone: 'house' });
    });
    expect(h.sim.indoorHappinessPerMinute('a0')).toBeCloseTo((2 / 100) * 1.5 + 0.25, 9);
  });

  it('the best bed goes to the first animal inside', () => {
    const h = house((s) => {
      s.world.placedItems.push(
        placed('bed_basic', 'house', 0, 0),
        placed('bed_royal', 'house', 1, 0),
      );
      animals(s, 2, { zone: 'house' });
    });
    const cozy = (h.sim.coziness() / 100) * 1.5;
    expect(h.sim.indoorHappinessPerMinute('a0')).toBeCloseTo(cozy + 1, 9);
    expect(h.sim.indoorHappinessPerMinute('a1')).toBeCloseTo(cozy + 0.25, 9);
  });
});
