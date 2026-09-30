import { describe, expect, it, vi } from 'vitest';
import { BALANCE } from '../../../src/config/balance';
import { salePrice } from '../../../src/sim/systems/selling';
import { RARITIES, type Animal } from '../../../src/sim/types';
import { MIN, START, edit, makeAnimal, newSim } from './helpers';

/** Care history averaging 40 maps to exactly 1.0x, so prices here are the base formula. */
const NEUTRAL_CARE = [40];

function sellable(overrides: Partial<Animal> = {}) {
  const h = edit(newSim(), (s) =>
    s.world.animals.push(
      makeAnimal(s, { id: 'x', holdUntil: START, careHistory: NEUTRAL_CARE, ...overrides }),
    ),
  );
  return h;
}

describe('sale price (DESIGN 7.5)', () => {
  it.each(RARITIES)('uses the %s base price', (rarity) => {
    const h = sellable({ rarity });
    expect(h.sim.salePrice('x')).toBe(BALANCE.rarity.basePrice[rarity]);
  });

  it('triples for Sparkle', () => {
    expect(sellable({ rarity: 'rare', isSparkle: true }).sim.salePrice('x')).toBe(300);
  });

  it('adds 10% per known trick and rounds', () => {
    const h = newSim();
    const state = h.sim.toState();
    const base = makeAnimal(state, { rarity: 'uncommon', careHistory: NEUTRAL_CARE });
    const withTricks = (n: number) =>
      salePrice(state.world, {
        ...base,
        tricks: { ...base.tricks, known: Array.from({ length: n }, (_, i) => `t${i}`) },
      });
    expect(withTricks(0)).toBe(45);
    expect(withTricks(1)).toBe(Math.round(45 * 1.1));
    expect(withTricks(3)).toBe(Math.round(45 * 1.3));
    expect(Number.isInteger(withTricks(1))).toBe(true);
  });

  it('is undefined for an unknown animal', () => {
    expect(newSim().sim.salePrice('nope')).toBeUndefined();
  });
});

describe('selling', () => {
  it('adds the price to coins, removes the animal, and emits events', () => {
    const h = sellable({ rarity: 'epic' });
    const sold = vi.fn();
    const coins = vi.fn();
    h.sim.events.on('animalSold', sold);
    h.sim.events.on('coinsChanged', coins);
    expect(h.sim.sell('x')).toEqual({ ok: true });
    expect(h.sim.state.world.coins).toBe(BALANCE.startingCoins + 250);
    expect(h.sim.getAnimal('x')).toBeUndefined();
    expect(sold).toHaveBeenCalledWith(expect.objectContaining({ price: 250 }));
    expect(coins).toHaveBeenCalledWith({ coins: BALANCE.startingCoins + 250, delta: 250 });
  });

  it('announces the sale only after the coins are in (so save-after-sale sees them)', () => {
    const h = sellable({ rarity: 'rare' });
    let coinsAtEvent = -1;
    h.sim.events.on('animalSold', () => (coinsAtEvent = h.sim.state.world.coins));
    h.sim.sell('x');
    expect(coinsAtEvent).toBe(BALANCE.startingCoins + 100);
  });

  it('refuses before the hold timer is done', () => {
    const h = sellable({ holdUntil: START + MIN });
    expect(h.sim.sell('x')).toEqual({ ok: false, reason: 'Not ready to sell yet.' });
    expect(h.sim.state.world.coins).toBe(BALANCE.startingCoins);
  });

  it('refuses sick, kept, or pregnant animals', () => {
    expect(sellable({ sickness: { illnessId: 'sniffles', since: START } }).sim.sell('x').ok).toBe(
      false,
    );
    expect(sellable({ isKept: true }).sim.sell('x').ok).toBe(false);
    expect(sellable({ pregnancy: { birthAt: START + MIN, litterSize: 2 } }).sim.sell('x').ok).toBe(
      false,
    );
  });

  it('refuses an unknown animal and cannot sell twice', () => {
    const h = sellable();
    expect(h.sim.sell('nope').ok).toBe(false);
    expect(h.sim.sell('x').ok).toBe(true);
    expect(h.sim.sell('x').ok).toBe(false);
  });

  it('outfits stay yours after a sale (bought once, never used up; Phase 9)', () => {
    const h = edit(sellable({ outfit: { head: 'big_bow', face: 'round_specs' } }), (s) => {
      s.world.inventory = { big_bow: 1, round_specs: 1 };
    });
    h.sim.sell('x');
    expect(h.sim.state.world.inventory).toEqual({ big_bow: 1, round_specs: 1 });
  });

  it('does not show Ready to Sell on kept pets', () => {
    const h = sellable({ isKept: true });
    expect(h.sim.badges('x')).toEqual(['new', 'kept']);
  });
});

describe('capacity (DESIGN 12.2)', () => {
  it('is the tier base capacity plus room expansions', () => {
    const h = newSim();
    expect(h.sim.capacity()).toBe(6);
    edit(h, (s) => {
      s.world.house.tierId = 'farmhouse';
      s.world.house.roomExpansions = 3;
    });
    expect(h.sim.capacity()).toBe(12 + 3);
  });

  it('counts every animal out in the world but not stored pets', () => {
    const h = edit(newSim(), (s) => {
      s.world.animals.push(makeAnimal(s), makeAnimal(s, { isKept: true, zone: 'house' }));
      s.world.petStorage.push({ animal: makeAnimal(s, { isKept: true }), storedAt: START });
    });
    expect(h.sim.animalCount()).toBe(2);
    expect(h.sim.freeCapacity()).toBe(4);
  });
});

describe('coins', () => {
  it('stay whole numbers and never go negative', async () => {
    const { addCoins } = await import('../../../src/sim/systems/economy');
    const h = newSim();
    const ctx = (h.sim as unknown as { ctx: Parameters<typeof addCoins>[0] }).ctx;
    expect(() => addCoins(ctx, 1.5)).toThrow(RangeError);
    expect(() => addCoins(ctx, -(BALANCE.startingCoins + 1))).toThrow(RangeError);
    expect(h.sim.state.world.coins).toBe(BALANCE.startingCoins);
    addCoins(ctx, -BALANCE.startingCoins);
    expect(h.sim.state.world.coins).toBe(0);
  });
});
