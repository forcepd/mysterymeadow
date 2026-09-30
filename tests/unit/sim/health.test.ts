import { describe, expect, it, vi } from 'vitest';
import { BALANCE } from '../../../src/config/balance';
import { ILLNESSES } from '../../../src/config/illnesses';
import { emptySummary, type SimContext } from '../../../src/sim/context';
import { Rng } from '../../../src/sim/rng';
import { tickSickness, trickyCasesUnlocked } from '../../../src/sim/systems/sickness';
import type { Animal, SimState, Zone } from '../../../src/sim/types';
import { HOUR, MIN, SEC, START, edit, makeAnimal, newSim, play } from './helpers';

const S = BALANCE.sickness;

function withAnimals(mutate: (s: SimState) => void) {
  return edit(newSim(), mutate);
}

function addPoops(s: SimState, n: number, zone: Zone = 'yard'): void {
  for (let i = 0; i < n; i++) {
    s.world.poops.push({
      id: `pp${zone}${i}`,
      zone,
      position: { x: 0.5, y: 0.5 },
      createdAt: START,
    });
  }
}

/** A bare context for driving tickSickness directly with lots of animals. */
function ctxFor(state: SimState, seed = 7) {
  const emit = vi.fn();
  const ctx: SimContext = {
    state,
    rng: new Rng(seed),
    offline: false,
    summary: emptySummary(),
    emit,
  };
  return Object.assign(ctx, { emit });
}

/** `n` healthy yard animals that won't poop or wander during a test. */
function herd(state: SimState, n: number, overrides: Partial<Animal> = {}): Animal[] {
  const out: Animal[] = [];
  for (let i = 0; i < n; i++) {
    const a = makeAnimal(state, { nextPoopAt: START + 99 * HOUR, ...overrides });
    state.world.animals.push(a);
    out.push(a);
  }
  return out;
}

/** The first roll happens on the first whole minute after the game started. */
const ROLL_AT = START + BALANCE.sickness.rollSeconds * SEC;

describe('sickness chance (DESIGN 9.1)', () => {
  const chanceOf = (overrides: Partial<Animal>, mutate?: (s: SimState) => void) => {
    const h = withAnimals((s) => {
      s.world.animals.push(makeAnimal(s, { id: 'x', ...overrides }));
      mutate?.(s);
    });
    return h.sim.sickChance('x')!;
  };

  it('is the base chance for a happy, fed animal in a clean yard', () => {
    expect(chanceOf({})).toBeCloseTo(S.baseChancePerMinute, 12);
  });

  it('doubles when hunger is below 25 (25 itself is fine)', () => {
    expect(chanceOf({ needs: { hunger: 24.9, happiness: 100 } })).toBeCloseTo(0.004, 12);
    expect(chanceOf({ needs: { hunger: 25, happiness: 100 } })).toBeCloseTo(0.002, 12);
  });

  it('doubles with 3 or more poops in the zone (not 2, and not poops in another zone)', () => {
    expect(chanceOf({}, (s) => addPoops(s, 3))).toBeCloseTo(0.004, 12);
    expect(chanceOf({}, (s) => addPoops(s, 5))).toBeCloseTo(0.004, 12);
    expect(chanceOf({}, (s) => addPoops(s, 2))).toBeCloseTo(0.002, 12);
    expect(chanceOf({}, (s) => addPoops(s, 4, 'house'))).toBeCloseTo(0.002, 12);
  });

  it('is 1.5x when happiness is below 25', () => {
    expect(chanceOf({ needs: { hunger: 100, happiness: 10 } })).toBeCloseTo(0.003, 12);
  });

  it('multiplies all neglect factors together', () => {
    const c = chanceOf({ needs: { hunger: 0, happiness: 0 } }, (s) => addPoops(s, 3));
    expect(c).toBeCloseTo(0.002 * 2 * 2 * 1.5, 12);
  });

  it('adds 0.01 per contagious animal in the same zone only', () => {
    const c = chanceOf({}, (s) => {
      const sick = (zone: Zone, extra: Partial<Animal['sickness']> = {}) =>
        makeAnimal(s, { zone, sickness: { illnessId: 'sniffles', since: START, ...extra } });
      s.world.animals.push(sick('yard'), sick('yard'), sick('house'));
      // Waiting at the Free Clinic: away from the yard, so not contagious.
      s.world.animals.push(sick('yard', { atClinicUntil: START + MIN, visit: 'free' }));
    });
    expect(c).toBeCloseTo(0.002 + 2 * S.contagionPerSickPerMinute, 12);
  });

  it('is 0 for an animal that is already sick', () => {
    expect(chanceOf({ sickness: { illnessId: 'sniffles', since: START } })).toBe(0);
  });
});

describe('sickness roll', () => {
  it('rolls once a minute on the minute, not every tick', () => {
    const state = newSim().sim.toState();
    herd(state, 3);
    const ctx = ctxFor(state);
    const before = ctx.rng.getState();
    tickSickness(ctx, ROLL_AT - 30 * SEC);
    expect(ctx.rng.getState()).toEqual(before);
    tickSickness(ctx, ROLL_AT);
    expect(ctx.rng.getState()).not.toEqual(before);
  });

  it('matches the base rate statistically (100k rolls)', () => {
    const state = newSim().sim.toState();
    herd(state, 100_000);
    const ctx = ctxFor(state);
    tickSickness(ctx, ROLL_AT);
    const sick = state.world.animals.filter((a) => a.sickness).length;
    // Expected 200, standard deviation ~14.
    expect(sick).toBeGreaterThan(155);
    expect(sick).toBeLessThan(245);
    expect(ctx.emit).toHaveBeenCalledTimes(sick);
    expect(ctx.emit).toHaveBeenCalledWith('animalSick', expect.anything());
  });

  it('matches the fully neglected rate statistically', () => {
    const state = newSim().sim.toState();
    herd(state, 100_000, { needs: { hunger: 0, happiness: 0 } });
    addPoops(state, 3);
    tickSickness(ctxFor(state), ROLL_AT);
    const sick = state.world.animals.filter((a) => a.sickness).length;
    // Expected 1200, standard deviation ~34.
    expect(sick).toBeGreaterThan(1090);
    expect(sick).toBeLessThan(1310);
  });

  it('picks every illness, about evenly', () => {
    const state = newSim().sim.toState();
    herd(state, 100_000, { needs: { hunger: 0, happiness: 0 } });
    addPoops(state, 3);
    tickSickness(ctxFor(state), ROLL_AT);
    const counts = new Map<string, number>();
    for (const a of state.world.animals) {
      if (a.sickness) counts.set(a.sickness.illnessId, (counts.get(a.sickness.illnessId) ?? 0) + 1);
    }
    expect([...counts.keys()].sort()).toEqual(ILLNESSES.map((i) => i.id).sort());
    for (const n of counts.values()) expect(n).toBeGreaterThan(120); // ~200 each
  });

  it('contagion spreads the same illness as the sick neighbor', () => {
    const state = newSim().sim.toState();
    state.world.animals.push(
      makeAnimal(state, { sickness: { illnessId: 'spotty_fever', since: START } }),
    );
    const healthy = herd(state, 100_000);
    tickSickness(ctxFor(state), ROLL_AT);
    const caught = healthy.filter((a) => a.sickness);
    const fever = caught.filter((a) => a.sickness!.illnessId === 'spotty_fever').length;
    // 0.012 per minute; 0.01 of it is contagion (plus 1/6 of the base share is fever anyway).
    expect(caught.length).toBeGreaterThan(1090);
    expect(caught.length).toBeLessThan(1310);
    expect(fever / caught.length).toBeGreaterThan(0.8);
    expect(fever / caught.length).toBeLessThan(0.92);
  });

  it('contagion never crosses zones', () => {
    const state = newSim().sim.toState();
    for (let i = 0; i < 5; i++) {
      state.world.animals.push(
        makeAnimal(state, { zone: 'house', sickness: { illnessId: 'sniffles', since: START } }),
      );
    }
    const yard = herd(state, 100_000);
    tickSickness(ctxFor(state), ROLL_AT);
    const sick = yard.filter((a) => a.sickness).length;
    expect(sick).toBeLessThan(245); // Base rate only (5 house neighbors would make it 10,400).
  });

  it('spreads one step per minute: animals that just got sick do not infect others yet', () => {
    const state = newSim().sim.toState();
    const all = herd(state, 20_000, { needs: { hunger: 0, happiness: 0 } });
    tickSickness(ctxFor(state), ROLL_AT);
    const firstWave = all.filter((a) => a.sickness).length;
    // Expected ~240. If new cases spread within the same tick, nearly everyone would be sick.
    expect(firstWave).toBeLessThan(320);
  });

  it('never gives an illness the animal is immune to (recently cured)', () => {
    const state = newSim().sim.toState();
    state.world.animals.push(
      makeAnimal(state, { sickness: { illnessId: 'sniffles', since: START } }),
    );
    const immuneTo = ILLNESSES.filter((i) => i.id !== 'sore_paw').map((i) => i.id);
    const healthy = herd(state, 50_000, {
      immunities: Object.fromEntries(immuneTo.map((id) => [id, START + 10 * MIN])),
    });
    for (const a of healthy) a.immunities = { ...a.immunities };
    tickSickness(ctxFor(state), ROLL_AT);
    const caught = healthy.filter((a) => a.sickness);
    expect(caught.length).toBeGreaterThan(0);
    expect(caught.every((a) => a.sickness!.illnessId === 'sore_paw')).toBe(true);
  });

  it('an animal immune to everything stays healthy; expired immunities are dropped', () => {
    const state = newSim().sim.toState();
    const all = Object.fromEntries(ILLNESSES.map((i) => [i.id, ROLL_AT + MIN]));
    const guarded = herd(state, 20_000, { needs: { hunger: 0, happiness: 0 } });
    for (const a of guarded) a.immunities = { ...all };
    const expired = makeAnimal(state, { immunities: { sniffles: ROLL_AT - 1 } });
    state.world.animals.push(expired);
    tickSickness(ctxFor(state), ROLL_AT);
    expect(guarded.some((a) => a.sickness)).toBe(false);
    expect(expired.immunities).toEqual({});
  });

  it('never happens offline', () => {
    const h = withAnimals((s) => {
      herd(s, 5, { needs: { hunger: 0, happiness: 0 } });
      s.world.animals.push(makeAnimal(s, { sickness: { illnessId: 'sniffles', since: START } }));
      addPoops(s, 5);
    });
    h.clock.advance(8 * HOUR);
    h.sim.catchUp();
    expect(h.sim.state.world.animals.filter((a) => a.sickness)).toHaveLength(1);
  });

  it('never happens when the parent turns sickness off', () => {
    const h = withAnimals((s) => {
      s.world.settings.sicknessEnabled = false;
      herd(s, 5, { needs: { hunger: 0, happiness: 0 }, holdUntil: START + 99 * HOUR });
      addPoops(s, 5);
    });
    play(h, 3 * HOUR, 10 * SEC);
    expect(h.sim.state.world.animals.some((a) => a.sickness)).toBe(false);
  });

  it('does happen online over time to neglected animals, with a toast event', () => {
    const h = withAnimals((s) => {
      for (const p of s.world.placedItems) p.servings = 0;
      herd(s, 5, { needs: { hunger: 0, happiness: 0 }, holdUntil: START + 99 * HOUR });
      addPoops(s, 5);
    });
    const onSick = vi.fn();
    h.sim.events.on('animalSick', onSick);
    play(h, 2 * HOUR, 10 * SEC);
    expect(onSick).toHaveBeenCalled();
    expect(h.sim.state.world.animals.some((a) => a.sickness)).toBe(true);
  });

  it('stored pets never get sick (they are paused)', () => {
    const h = withAnimals((s) => {
      s.world.petStorage.push({
        animal: makeAnimal(s, { id: 'stored', isKept: true, needs: { hunger: 0, happiness: 0 } }),
        storedAt: START,
      });
      s.world.animals.push(makeAnimal(s, { sickness: { illnessId: 'sniffles', since: START } }));
      addPoops(s, 5);
    });
    play(h, 3 * HOUR, 30 * SEC);
    expect(h.sim.state.world.petStorage[0]!.animal.sickness).toBeUndefined();
  });

  it('kept pets out in the world can get sick', () => {
    const state = newSim().sim.toState();
    const pets = herd(state, 20_000, { isKept: true, needs: { hunger: 0, happiness: 0 } });
    tickSickness(ctxFor(state), ROLL_AT);
    expect(pets.some((a) => a.sickness)).toBe(true);
  });
});

describe('effects of sickness (DESIGN 9.3)', () => {
  const sickAnimal = () =>
    withAnimals((s) =>
      s.world.animals.push(
        makeAnimal(s, {
          id: 'x',
          holdUntil: START,
          sickness: { illnessId: 'sniffles', since: START },
        }),
      ),
    );

  it('cannot be sold or trained', () => {
    const h = sickAnimal();
    expect(h.sim.canSell('x')).toEqual({ ok: false, reason: 'Too sick to sell. Visit the vet!' });
    expect(h.sim.sell('x').ok).toBe(false);
    expect(h.sim.canTrain('x').ok).toBe(false);
    expect(h.sim.badges('x')).toContain('sick');
    expect(h.sim.badges('x')).not.toContain('readyToSell');
  });

  it('happiness drains twice as fast', () => {
    const h = sickAnimal();
    play(h, 10 * MIN);
    expect(h.sim.getAnimal('x')!.needs.happiness).toBeCloseTo(100 - (10 / 40) * 100 * 2, 6);
  });

  it('is never fatal: a sick animal stays sick (and present) indefinitely', () => {
    const h = sickAnimal();
    play(h, 6 * HOUR, 30 * SEC);
    expect(h.sim.getAnimal('x')!.sickness?.illnessId).toBe('sniffles');
  });

  it('healthy animals can train', () => {
    const h = withAnimals((s) => s.world.animals.push(makeAnimal(s, { id: 'x' })));
    expect(h.sim.canTrain('x').ok).toBe(true);
  });
});

describe('tricky cases (DESIGN 9.5 step 6)', () => {
  it('start at the Farmhouse tier', () => {
    const state = newSim().sim.toState();
    const unlocked = (tierId: string) => {
      state.world.house.tierId = tierId;
      return trickyCasesUnlocked(state.world);
    };
    expect(unlocked('cottage')).toBe(false);
    expect(unlocked('bungalow')).toBe(false);
    expect(unlocked('farmhouse')).toBe(true);
    expect(unlocked('manor')).toBe(true);
  });

  it('never happen before the Farmhouse', () => {
    const state = newSim().sim.toState();
    state.world.house.tierId = 'bungalow';
    herd(state, 100_000, { needs: { hunger: 0, happiness: 0 } });
    addPoops(state, 3);
    tickSickness(ctxFor(state), ROLL_AT);
    expect(state.world.animals.some((a) => a.sickness?.secondIllnessId)).toBe(false);
  });

  it('are about 20% of new sicknesses at the Farmhouse, always two different illnesses', () => {
    const state = newSim().sim.toState();
    state.world.house.tierId = 'farmhouse';
    herd(state, 100_000, { needs: { hunger: 0, happiness: 0 } });
    addPoops(state, 3);
    const ctx = ctxFor(state);
    tickSickness(ctx, ROLL_AT);
    const sick = state.world.animals.filter((a) => a.sickness);
    const tricky = sick.filter((a) => a.sickness!.secondIllnessId);
    // ~1200 sick; expected 20% tricky (240), standard deviation ~14.
    expect(tricky.length / sick.length).toBeGreaterThan(S.trickyCaseChance - 0.05);
    expect(tricky.length / sick.length).toBeLessThan(S.trickyCaseChance + 0.05);
    for (const a of tricky) expect(a.sickness!.secondIllnessId).not.toBe(a.sickness!.illnessId);
    expect(ctx.emit).toHaveBeenCalledWith(
      'animalSick',
      expect.objectContaining({ secondIllnessId: expect.any(String) }),
    );
  });

  it('never skip an illness the animal is immune to', () => {
    const state = newSim().sim.toState();
    state.world.house.tierId = 'farmhouse';
    const immune = { sniffles: START + HOUR, tummy_trouble: START + HOUR };
    herd(state, 100_000, { needs: { hunger: 0, happiness: 0 }, immunities: immune });
    addPoops(state, 3);
    tickSickness(ctxFor(state), ROLL_AT);
    for (const a of state.world.animals) {
      if (!a.sickness) continue;
      expect(immune).not.toHaveProperty(a.sickness.illnessId);
      if (a.sickness.secondIllnessId) expect(immune).not.toHaveProperty(a.sickness.secondIllnessId);
    }
  });

  it('only the first illness spreads', () => {
    const state = newSim().sim.toState();
    state.world.house.tierId = 'farmhouse';
    state.world.animals.push(
      makeAnimal(state, {
        id: 'patient',
        sickness: { illnessId: 'sniffles', secondIllnessId: 'sore_paw', since: START },
        nextPoopAt: START + 99 * HOUR,
      }),
    );
    herd(state, 20_000);
    tickSickness(ctxFor(state), ROLL_AT);
    const caught = state.world.animals.filter((a) => a.id !== 'patient' && a.sickness);
    // Mostly caught Sniffles (0.01) vs a few random ones (0.002): sore paw only by chance.
    const sniffles = caught.filter((a) => a.sickness!.illnessId === 'sniffles').length;
    expect(sniffles / caught.length).toBeGreaterThan(0.75);
  });
});
