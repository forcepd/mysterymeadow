import { describe, expect, it, vi } from 'vitest';
import { BALANCE } from '../../../src/config/balance';
import { checkName, isFriendly } from '../../../src/sim/systems/naming';
import type { Animal, Poop, SimState } from '../../../src/sim/types';
import { HOUR, MIN, SEC, START, edit, fillAnimals, makeAnimal, newSim, play } from './helpers';

const BOWL = 'start1';

function withAnimal(overrides: Partial<Animal> = {}, mutate?: (s: SimState) => void) {
  return edit(newSim(), (s) => {
    s.world.animals.push(makeAnimal(s, { id: 'x', nextPoopAt: START + 99 * HOUR, ...overrides }));
    mutate?.(s);
  });
}

function poop(s: SimState, n: number, zone: 'yard' | 'house' = 'yard'): void {
  for (let i = 0; i < n; i++) {
    const p: Poop = { id: `poop${zone}${i}`, zone, position: { x: 0.5, y: 0.5 }, createdAt: START };
    s.world.poops.push(p);
  }
}

const emptyBowl = (s: SimState) => {
  s.world.placedItems.find((p) => p.id === BOWL)!.servings = 0;
};

describe('needs decay (DESIGN 8.1)', () => {
  it('hunger drains 100 -> 0 over 30 minutes and happiness over 40', () => {
    const h = withAnimal({}, emptyBowl);
    play(h, 15 * MIN);
    const a = h.sim.getAnimal('x')!;
    expect(a.needs.hunger).toBeCloseTo(50, 6);
    expect(a.needs.happiness).toBeCloseTo(100 - (15 / 40) * 100, 6);
    play(h, 15 * MIN);
    expect(h.sim.getAnimal('x')!.needs.hunger).toBeCloseTo(0, 6);
  });

  it('never goes below 0', () => {
    const h = withAnimal({}, emptyBowl);
    play(h, 2 * HOUR, 10 * SEC);
    const a = h.sim.getAnimal('x')!;
    expect(a.needs.hunger).toBe(0);
    expect(a.needs.happiness).toBe(0);
  });

  it('happiness drains 1.5x faster while Crowded', () => {
    // Stays put: wandering indoors would change how fast it drains.
    const h = withAnimal({ id: 'x', nextWanderAt: START + 99 * HOUR }, (s) => {
      emptyBowl(s);
      fillAnimals(s, 6, { nextPoopAt: START + 99 * HOUR, holdUntil: START + 99 * HOUR });
    });
    expect(h.sim.isCrowded()).toBe(true);
    play(h, 10 * MIN);
    expect(h.sim.getAnimal('x')!.needs.happiness).toBeCloseTo(100 - (10 / 40) * 100 * 1.5, 6);
  });

  it('pauses while offline', () => {
    const h = withAnimal({}, emptyBowl);
    h.clock.advance(3 * HOUR);
    h.sim.catchUp();
    expect(h.sim.getAnimal('x')!.needs).toEqual({ hunger: 100, happiness: 100 });
  });
});

describe('food bowls (DESIGN 8.2)', () => {
  it('a new game starts with a full bowl in the yard', () => {
    const [bowl] = newSim().sim.bowls();
    expect(bowl).toMatchObject({ zone: 'yard', servings: BALANCE.needs.bowlServings });
  });

  it('a hungry animal (hunger < 50) walks to the bowl and eats one serving', () => {
    const h = withAnimal({ needs: { hunger: 49, happiness: 100 } });
    const ate = vi.fn();
    h.sim.events.on('animalAte', ate);
    play(h, SEC);
    const a = h.sim.getAnimal('x')!;
    expect(a.needs.hunger).toBe(100);
    expect(h.sim.bowls()[0]!.servings).toBe(BALANCE.needs.bowlServings - 1);
    expect(ate).toHaveBeenCalledWith(expect.objectContaining({ bowlId: BOWL }));
    // It moved next to the bowl (tile 1,0 of the 12x5 yard grid).
    expect(a.position.x).toBeCloseTo(1.5 / 12, 1);
  });

  it('an animal that is not hungry does not eat', () => {
    const h = withAnimal({ needs: { hunger: 60, happiness: 100 } });
    play(h, SEC);
    expect(h.sim.bowls()[0]!.servings).toBe(BALANCE.needs.bowlServings);
  });

  it('shares servings until the bowl is empty, then announces it', () => {
    const h = edit(newSim(), (s) => {
      for (let i = 0; i < 6; i++) {
        s.world.animals.push(
          makeAnimal(s, { needs: { hunger: 10, happiness: 100 }, nextPoopAt: START + HOUR }),
        );
      }
    });
    const emptied = vi.fn();
    h.sim.events.on('bowlEmptied', emptied);
    play(h, SEC);
    const fed = h.sim.state.world.animals.filter((a) => a.needs.hunger > 90).length;
    expect(fed).toBe(BALANCE.needs.bowlServings);
    expect(h.sim.bowls()[0]!.servings).toBe(0);
    expect(emptied).toHaveBeenCalledOnce();
  });

  it('an indoor animal with no house bowl walks out to eat from a yard bowl (Phase 6)', () => {
    const h = withAnimal({ zone: 'house', needs: { hunger: 10, happiness: 100 } });
    const moved = vi.fn();
    h.sim.events.on('animalMovedZone', moved);
    play(h, SEC);
    expect(h.sim.bowls()[0]!.servings).toBe(BALANCE.needs.bowlServings - 1);
    expect(h.sim.getAnimal('x')!.zone).toBe('yard');
    expect(moved).toHaveBeenCalledWith(expect.objectContaining({ to: 'yard', reason: 'food' }));
  });

  it('refilling is free, fills the bowl, and refuses when full or not a bowl', () => {
    const h = withAnimal({}, emptyBowl);
    expect(h.sim.refillBowl(BOWL)).toEqual({ ok: true });
    expect(h.sim.bowls()[0]!.servings).toBe(BALANCE.needs.bowlServings);
    expect(h.sim.state.world.coins).toBe(BALANCE.startingCoins);
    expect(h.sim.refillBowl(BOWL).ok).toBe(false);
    expect(h.sim.refillBowl('nope').ok).toBe(false);
  });

  it('a hungry animal with no food stays hungry (never harmed) until the bowl is refilled', () => {
    const h = withAnimal({ needs: { hunger: 5, happiness: 100 } }, emptyBowl);
    play(h, MIN);
    expect(h.sim.getAnimal('x')!.needs.hunger).toBeCloseTo(5 - 100 / 30, 6);
    h.sim.refillBowl(BOWL);
    play(h, SEC);
    expect(h.sim.getAnimal('x')!.needs.hunger).toBe(100);
  });
});

describe('treats (DESIGN 8.2)', () => {
  it('cost coins and give hunger and happiness', () => {
    const h = withAnimal({ needs: { hunger: 50, happiness: 50 } });
    const coins = vi.fn();
    h.sim.events.on('coinsChanged', coins);
    expect(h.sim.feedTreat('x')).toEqual({ ok: true });
    const { cost, hungerGain, happinessGain } = BALANCE.treat;
    expect(h.sim.state.world.coins).toBe(BALANCE.startingCoins - cost);
    expect(h.sim.getAnimal('x')!.needs.hunger).toBeCloseTo(50 + hungerGain, 0);
    expect(h.sim.getAnimal('x')!.needs.happiness).toBeCloseTo(50 + happinessGain, 0);
    expect(coins).toHaveBeenCalledWith({ coins: BALANCE.startingCoins - cost, delta: -cost });
  });

  it('cap needs at 100', () => {
    const h = withAnimal({ needs: { hunger: 95, happiness: 99 } });
    h.sim.feedTreat('x');
    expect(h.sim.getAnimal('x')!.needs).toEqual({ hunger: 100, happiness: 100 });
  });

  it('refuse without enough coins, when already full, or for an unknown animal', () => {
    const poor = withAnimal({ needs: { hunger: 10, happiness: 10 } }, (s) => (s.world.coins = 4));
    expect(poor.sim.feedTreat('x')).toEqual({ ok: false, reason: 'Not enough coins!' });
    expect(poor.sim.state.world.coins).toBe(4);
    expect(withAnimal().sim.feedTreat('x').ok).toBe(false);
    expect(withAnimal().sim.feedTreat('nope').ok).toBe(false);
  });
});

describe('poop (DESIGN 8.3)', () => {
  it('appears at the animal’s spot when its timer is up, then every 8-14 minutes', () => {
    const h = withAnimal({ nextPoopAt: START + 5 * SEC, position: { x: 0.3, y: 0.4 } });
    const appeared = vi.fn();
    h.sim.events.on('poopAppeared', appeared);
    play(h, 5 * SEC);
    expect(appeared).toHaveBeenCalledOnce();
    const [p] = h.sim.state.world.poops;
    expect(p).toMatchObject({ zone: 'yard', createdAt: START + 5 * SEC });
    expect(p!.position.x).toBeCloseTo(0.3);
    const next = h.sim.getAnimal('x')!.nextPoopAt - (START + 5 * SEC);
    expect(next).toBeGreaterThanOrEqual(BALANCE.poop.minMinutes * MIN);
    expect(next).toBeLessThanOrEqual(BALANCE.poop.maxMinutes * MIN);
  });

  it('tapping cleans it; cleaning twice is refused', () => {
    const h = withAnimal({}, (s) => poop(s, 1));
    const cleaned = vi.fn();
    h.sim.events.on('poopCleaned', cleaned);
    expect(h.sim.cleanPoop('poopyard0')).toEqual({ ok: true });
    expect(h.sim.state.world.poops).toHaveLength(0);
    expect(cleaned).toHaveBeenCalledOnce();
    expect(h.sim.cleanPoop('poopyard0').ok).toBe(false);
  });

  it('lowers cleanliness per zone, 20 per poop, never below 0', () => {
    const h = withAnimal({}, (s) => {
      poop(s, 2, 'yard');
      poop(s, 1, 'house');
    });
    expect(h.sim.cleanliness('yard')).toBe(60);
    expect(h.sim.cleanliness('house')).toBe(80);
    edit(h, (s) => poop(s, 9, 'house'));
    expect(h.sim.cleanliness('house')).toBe(0);
  });

  it('nobody poops while the player is away, and there is no pile-up on return', () => {
    const h = withAnimal({ nextPoopAt: START + MIN });
    h.clock.advance(5 * HOUR);
    h.sim.catchUp();
    expect(h.sim.state.world.poops).toHaveLength(0);
    expect(h.sim.getAnimal('x')!.nextPoopAt).toBeGreaterThan(h.sim.now());
    play(h, SEC);
    expect(h.sim.state.world.poops).toHaveLength(0);
  });
});

describe('petting (DESIGN 8.4)', () => {
  it('adds happiness, then has a 20 second cooldown', () => {
    const h = withAnimal({ needs: { hunger: 100, happiness: 50 } });
    const petted = vi.fn();
    h.sim.events.on('animalPetted', petted);
    expect(h.sim.pet('x')).toEqual({ ok: true });
    expect(h.sim.getAnimal('x')!.needs.happiness).toBe(50 + BALANCE.needs.petHappinessGain);
    expect(h.sim.pet('x').ok).toBe(false);
    play(h, (BALANCE.needs.petCooldownSeconds - 1) * SEC);
    expect(h.sim.pet('x').ok).toBe(false);
    play(h, SEC);
    expect(h.sim.pet('x').ok).toBe(true);
    expect(petted).toHaveBeenCalledTimes(2);
  });

  it('caps happiness at 100 and refuses unknown animals', () => {
    const h = withAnimal({ needs: { hunger: 100, happiness: 95 } });
    h.sim.pet('x');
    expect(h.sim.getAnimal('x')!.needs.happiness).toBe(100);
    expect(h.sim.pet('nope').ok).toBe(false);
  });
});

describe('care multiplier (DESIGN 7.5)', () => {
  it('maps the care score linearly onto 0.8..1.3', () => {
    const at = (careHistory: number[]) => withAnimal({ careHistory }).sim.careMultiplier('x');
    expect(at([0])).toBeCloseTo(0.8);
    expect(at([100])).toBeCloseTo(1.3);
    expect(at([40])).toBeCloseTo(1.0);
    expect(at([50])).toBeCloseTo(1.05);
    expect(at([20, 60])).toBeCloseTo(1.0);
  });

  it('uses current needs (and zone cleanliness) before any samples exist', () => {
    const fresh = withAnimal({ needs: { hunger: 100, happiness: 100 } });
    expect(fresh.sim.careMultiplier('x')).toBeCloseTo(1.3);
    const dirty = withAnimal({ needs: { hunger: 100, happiness: 100 } }, (s) => poop(s, 5));
    // (100 + 100 + 0) / 3 = 66.7 -> 0.8 + 0.5 * 0.667
    expect(dirty.sim.careMultiplier('x')).toBeCloseTo(0.8 + 0.5 * (200 / 3 / 100));
  });

  it('samples once a minute and keeps only the last 10 minutes', () => {
    const h = withAnimal({}, emptyBowl);
    play(h, MIN - SEC);
    expect(h.sim.getAnimal('x')!.careHistory).toHaveLength(0);
    play(h, SEC);
    expect(h.sim.getAnimal('x')!.careHistory).toHaveLength(1);
    play(h, 30 * MIN, 10 * SEC);
    expect(h.sim.getAnimal('x')!.careHistory).toHaveLength(BALANCE.care.windowMinutes);
  });

  it('neglect lowers the sale price and care raises it', () => {
    const neglected = withAnimal(
      { holdUntil: START, rarity: 'rare', needs: { hunger: 0, happiness: 0 } },
      (s) => {
        emptyBowl(s);
        poop(s, 5);
      },
    );
    const loved = withAnimal({ holdUntil: START, rarity: 'rare' });
    play(neglected, 10 * MIN, 10 * SEC);
    play(loved, 10 * MIN, 10 * SEC);
    expect(neglected.sim.salePrice('x')).toBe(80); // 100 x 0.8
    expect(loved.sim.salePrice('x')).toBeGreaterThan(100);
  });

  it('pauses sampling while offline', () => {
    const h = withAnimal();
    h.clock.advance(2 * HOUR);
    h.sim.catchUp();
    expect(h.sim.getAnimal('x')!.careHistory).toHaveLength(0);
  });
});

describe('naming (DESIGN 10.2)', () => {
  it('names an animal and clears the name with an empty string', () => {
    const h = withAnimal();
    const renamed = vi.fn();
    h.sim.events.on('animalRenamed', renamed);
    expect(h.sim.rename('x', '  Biscuit   Jr ')).toEqual({ ok: true });
    expect(h.sim.getAnimal('x')!.name).toBe('Biscuit Jr');
    expect(h.sim.rename('x', '')).toEqual({ ok: true });
    expect(h.sim.getAnimal('x')!.name).toBeUndefined();
    expect(renamed).toHaveBeenCalledTimes(2);
  });

  it('accepts 1 to 14 characters and refuses longer', () => {
    expect(checkName('Q')).toEqual({ ok: true, name: 'Q' });
    expect(checkName('Abcdefghijklmn').ok).toBe(true);
    expect(checkName('Abcdefghijklmno').ok).toBe(false);
  });

  it('allows letters in any language, numbers, and a little punctuation', () => {
    for (const ok of ['Zoë', 'Mr. Fluff', 'Pip-2', "O'Malley", 'Mochi', 'Café', 'ゆき']) {
      expect(checkName(ok).ok, ok).toBe(true);
    }
    for (const bad of ['<b>', 'a@b.com', 'hi!!', '💩💩'])
      expect(checkName(bad).ok, bad).toBe(false);
  });

  it('blocks unkind words, including spaced-out and leetspeak tricks', () => {
    for (const bad of ['Stupid', 'Fat Cat', 'sh1t', 'f u c k', 'xXfuckXx', 'IDIOTS']) {
      expect(isFriendly(bad), bad).toBe(false);
    }
    expect(checkName('Stupid')).toEqual({ ok: false, reason: 'Let’s pick a kinder name!' });
  });

  it('does not block ordinary names that contain a blocked word inside them', () => {
    for (const ok of [
      'Cassie',
      'Hello',
      'Grape',
      'Cucumber',
      'Fuku',
      'Dickens',
      'Hamlet',
      'Shadow',
    ]) {
      expect(isFriendly(ok), ok).toBe(true);
    }
  });

  it('refuses unknown animals and keeps the name through save and load', () => {
    const h = withAnimal();
    expect(h.sim.rename('nope', 'Pip').ok).toBe(false);
    h.sim.rename('x', 'Pip');
    edit(h, () => {});
    expect(h.sim.getAnimal('x')!.name).toBe('Pip');
  });
});
