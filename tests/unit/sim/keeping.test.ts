import { describe, expect, it, vi } from 'vitest';
import { BALANCE } from '../../../src/config/balance';
import { SPECIES } from '../../../src/config/species';
import { GameSim } from '../../../src/sim/GameSim';
import type { Animal, SimState } from '../../../src/sim/types';
import { DAY, HOUR, MIN, SEC, START, edit, makeAnimal, makeVisitor, newSim, play } from './helpers';

const FAR = START + 999 * HOUR;

/** A world with the given animals out (no poop or wander during tests unless asked). */
function world(animals: Partial<Animal>[], mutate?: (s: SimState) => void) {
  return edit(newSim(), (s) => {
    s.world.settings.sicknessEnabled = false;
    s.world.nextVisitorAt = FAR; // Only the animals set up here.
    for (const a of animals) {
      s.world.animals.push(makeAnimal(s, { nextPoopAt: FAR, nextWanderAt: FAR, ...a }));
    }
    mutate?.(s);
  });
}

describe('Pet Slots and Storage sizes (DESIGN 10.1, 12.5)', () => {
  it('start at 2 slots and 20 storage spaces, plus purchases', () => {
    const h = newSim();
    expect(h.sim.petSlots()).toEqual({ total: 2, used: 0, free: 2 });
    expect(h.sim.petStorage()).toEqual({ total: 20, used: 0, free: 20 });
    edit(h, (s) => {
      s.world.house.petSlotsPurchased = 3;
      s.world.house.storageExpansions = 2;
    });
    expect(h.sim.petSlots().total).toBe(5);
    expect(h.sim.petStorage().total).toBe(40);
    expect(BALANCE.petSlots.starting).toBe(2);
  });
});

describe('keep and un-keep', () => {
  it('keeps any animal in a free slot: sick, pregnant, or a baby', () => {
    const h = world([
      { id: 'sick', sickness: { illnessId: 'sniffles', since: START } },
      { id: 'mom', pregnancy: { birthAt: START + 3 * MIN, litterSize: 2 } },
    ]);
    const kept = vi.fn();
    h.sim.events.on('petKept', kept);
    expect(h.sim.keep('sick')).toEqual({ ok: true });
    expect(h.sim.keep('mom')).toEqual({ ok: true });
    expect(h.sim.getAnimal('sick')!.isKept).toBe(true);
    expect(h.sim.badges('sick')).toContain('kept');
    expect(h.sim.petSlots()).toEqual({ total: 2, used: 2, free: 0 });
    expect(kept).toHaveBeenCalledTimes(2);
  });

  it('with full slots, keeping is refused (the Swap screen takes over)', () => {
    const h = world([{ id: 'a', isKept: true }, { id: 'b', isKept: true }, { id: 'c' }]);
    expect(h.sim.keep('c')).toEqual({
      ok: false,
      reason: 'All your Pet Slots are full. Swap a pet into Storage!',
    });
    expect(h.sim.getAnimal('c')!.isKept).toBe(false);
  });

  it('refuses keeping twice and unknown animals', () => {
    const h = world([{ id: 'a', isKept: true }]);
    expect(h.sim.keep('a').ok).toBe(false);
    expect(h.sim.keep('zzz').ok).toBe(false);
  });

  it('a kept pet can’t be sold; un-keeping makes it sellable once healthy', () => {
    const h = world([{ id: 'a', isKept: true, holdUntil: START }]);
    expect(h.sim.canSell('a').ok).toBe(false);
    expect(h.sim.unkeep('a')).toEqual({ ok: true });
    expect(h.sim.petSlots().used).toBe(0);
    expect(h.sim.canSell('a').ok).toBe(true);
    expect(h.sim.unkeep('a').ok).toBe(false); // Not a pet any more.
  });

  it('names survive keep, storage, and un-keep (DESIGN 10.2)', () => {
    const h = world([{ id: 'a', name: 'Pip' }]);
    h.sim.keep('a');
    h.sim.storePet('a');
    h.sim.retrievePet('a');
    h.sim.unkeep('a');
    expect(h.sim.getAnimal('a')!.name).toBe('Pip');
  });

  it('a stored pet must come out before it can be un-keeped', () => {
    const h = world([{ id: 'a', isKept: true }]);
    h.sim.storePet('a');
    expect(h.sim.unkeep('a')).toEqual({
      ok: false,
      reason: 'Bring this pet out of Storage first.',
    });
  });
});

describe('Pet Storage', () => {
  it('storing takes the pet out of the world and frees capacity (and its slot)', () => {
    const h = world([{ id: 'a', isKept: true }, { id: 'b' }]);
    const stored = vi.fn();
    h.sim.events.on('petStored', stored);
    expect(h.sim.animalCount()).toBe(2);
    expect(h.sim.storePet('a')).toEqual({ ok: true });
    expect(h.sim.getAnimal('a')).toBeUndefined();
    expect(h.sim.getStoredPet('a')).toBeDefined();
    expect(h.sim.state.world.petStorage[0]!.storedAt).toBe(h.sim.now());
    expect(h.sim.animalCount()).toBe(1);
    expect(h.sim.petSlots().used).toBe(0);
    expect(h.sim.petStorage().used).toBe(1);
    expect(stored).toHaveBeenCalledOnce();
  });

  it('a new animal can go straight into Storage (kept at the same time)', () => {
    const h = world([{ id: 'new' }]);
    expect(h.sim.storePet('new')).toEqual({ ok: true });
    expect(h.sim.getStoredPet('new')!.isKept).toBe(true);
  });

  it('storing makes room, so a visitor waiting at the gate walks in', () => {
    const h = world(
      Array.from({ length: 6 }, (_, i) => ({ id: `a${i}`, isKept: i === 0 })),
      (s) => s.world.gateQueue.push(makeVisitor(s, {}, { revealed: true })),
    );
    expect(h.sim.freeCapacity()).toBe(0);
    h.sim.storePet('a0');
    expect(h.sim.state.world.gateQueue).toHaveLength(0);
    expect(h.sim.animalCount()).toBe(6);
  });

  it('refuses when Storage is full', () => {
    const h = world([{ id: 'a', isKept: true }], (s) => {
      for (let i = 0; i < 20; i++) {
        s.world.petStorage.push({ animal: makeAnimal(s, { isKept: true }), storedAt: START });
      }
    });
    expect(h.sim.storePet('a')).toEqual({ ok: false, reason: 'Pet Storage is full!' });
    expect(h.sim.getAnimal('a')).toBeDefined();
  });

  it('storing a sick pet: no sickness progress, still sick when it comes out, vet visit kept', () => {
    const h = world([
      {
        id: 'a',
        isKept: true,
        sickness: { illnessId: 'sore_paw', since: START, visit: 'paid' },
        needs: { hunger: 60, happiness: 60 },
      },
    ]);
    h.sim.storePet('a');
    play(h, 5 * HOUR, 30 * SEC);
    expect(h.sim.retrievePet('a')).toEqual({ ok: true });
    const a = h.sim.getAnimal('a')!;
    expect(a.sickness).toMatchObject({ illnessId: 'sore_paw', visit: 'paid' });
    expect(a.needs).toEqual({ hunger: 60, happiness: 60 }); // Paused: no decay.
    // Still at the vet (paid already): the cure works without another fee.
    const coins = h.sim.state.world.coins;
    expect(h.sim.vetTreat('a', 'bandage')).toMatchObject({ ok: true, cured: true });
    expect(h.sim.state.world.coins).toBe(coins - BALANCE.vet.treatmentCost);
  });

  it('stored pets never poop, get sick, or eat', () => {
    const h = world(
      [{ id: 'a', isKept: true, needs: { hunger: 10, happiness: 10 }, nextPoopAt: START + MIN }],
      (s) => (s.world.settings.sicknessEnabled = true),
    );
    h.sim.storePet('a');
    play(h, 6 * HOUR, 30 * SEC);
    expect(h.sim.state.world.poops).toHaveLength(0);
    const stored = h.sim.getStoredPet('a')!;
    expect(stored.sickness).toBeUndefined();
    expect(stored.needs).toEqual({ hunger: 10, happiness: 10 });
    expect(h.sim.bowls()[0]!.servings).toBe(BALANCE.needs.bowlServings);
  });
});

describe('retrieving from Storage', () => {
  it('needs a free slot', () => {
    const h = world(
      [
        { id: 'a', isKept: true },
        { id: 'b', isKept: true },
      ],
      (s) =>
        s.world.petStorage.push({
          animal: makeAnimal(s, { id: 's', isKept: true }),
          storedAt: START,
        }),
    );
    expect(h.sim.retrievePet('s')).toEqual({
      ok: false,
      reason: 'All your Pet Slots are full. Swap a pet into Storage!',
    });
  });

  it('with no room under capacity: “Your house is full!” (a direct swap still works)', () => {
    const h = world(
      Array.from({ length: 6 }, (_, i) => ({ id: `a${i}`, isKept: i === 0 })),
      (s) =>
        s.world.petStorage.push({
          animal: makeAnimal(s, { id: 's', isKept: true }),
          storedAt: START,
        }),
    );
    expect(h.sim.freeCapacity()).toBe(0);
    expect(h.sim.petSlots().free).toBe(1);
    expect(h.sim.retrievePet('s')).toEqual({ ok: false, reason: 'Your house is full!' });
    expect(h.sim.getStoredPet('s')).toBeDefined();

    expect(h.sim.swapPets('a0', 's')).toEqual({ ok: true });
    expect(h.sim.getAnimal('s')!.isKept).toBe(true);
    expect(h.sim.getStoredPet('a0')).toBeDefined();
    expect(h.sim.animalCount()).toBe(6);
  });

  it('refuses when over capacity (Crowded) too', () => {
    const h = world(
      Array.from({ length: 7 }, () => ({})),
      (s) =>
        s.world.petStorage.push({
          animal: makeAnimal(s, { id: 's', isKept: true }),
          storedAt: START,
        }),
    );
    expect(h.sim.isCrowded()).toBe(true);
    expect(h.sim.retrievePet('s').ok).toBe(false);
  });

  it('comes out into the yard, near the house', () => {
    const h = world([], (s) =>
      s.world.petStorage.push({
        animal: makeAnimal(s, {
          id: 's',
          isKept: true,
          zone: 'house',
          position: { x: 0.9, y: 0.9 },
        }),
        storedAt: START,
      }),
    );
    const out = vi.fn();
    h.sim.events.on('petRetrieved', out);
    h.sim.retrievePet('s');
    const a = h.sim.getAnimal('s')!;
    expect(a.zone).toBe('yard');
    expect(a.position.x).toBeLessThanOrEqual(0.3);
    expect(a.position.y).toBeLessThanOrEqual(0.2);
    expect(out).toHaveBeenCalledOnce();
  });

  it('refuses a pet that isn’t stored', () => {
    const h = world([{ id: 'a', isKept: true }]);
    expect(h.sim.retrievePet('a')).toEqual({ ok: false, reason: 'That pet isn’t in Storage.' });
  });
});

describe('timers resume exactly after long storage', () => {
  it('every timer picks up where it paused, even after 30 days', () => {
    const t0 = START + 5 * MIN;
    const h = world([
      {
        id: 'a',
        isKept: true,
        arrivedAt: START,
        holdUntil: START + 20 * MIN,
        bornAt: START,
        grownAt: START + 20 * MIN,
        pregnancy: { birthAt: START + 60 * MIN, litterSize: 2 },
        nextPoopAt: START + 10 * MIN,
        nextWanderAt: START + 90 * SEC,
        nextPetAt: START + 6 * MIN,
        tricks: { known: [], progress: {}, nextTrainAt: START + 7 * MIN },
        sickness: {
          illnessId: 'sniffles',
          since: START,
          visit: 'free',
          atClinicUntil: START + 8 * MIN,
        },
        immunities: { sore_paw: START + 30 * MIN },
      },
    ]);
    play(h, 5 * MIN);
    expect(h.sim.now()).toBe(t0);
    const before = structuredClone(h.sim.getAnimal('a')!);
    h.sim.storePet('a');

    // 30 days away (catch-up simulates the last 8 hours), then an hour of play.
    h.clock.advance(30 * DAY);
    h.sim.catchUp();
    play(h, HOUR, MIN);
    const away = h.sim.now() - t0;
    expect(away).toBeGreaterThanOrEqual(30 * DAY);
    h.sim.retrievePet('a');
    const a = h.sim.getAnimal('a')!;

    // Each timer is still the same distance in the future as when it was stored.
    expect(a.holdUntil - h.sim.now()).toBe(before.holdUntil - t0);
    expect(a.grownAt! - h.sim.now()).toBe(before.grownAt! - t0);
    expect(a.pregnancy!.birthAt - h.sim.now()).toBe(before.pregnancy!.birthAt - t0);
    expect(a.nextPoopAt - h.sim.now()).toBe(before.nextPoopAt - t0);
    expect(a.nextPetAt - h.sim.now()).toBe(before.nextPetAt - t0);
    expect(a.tricks.nextTrainAt - h.sim.now()).toBe(before.tricks.nextTrainAt - t0);
    expect(a.sickness!.atClinicUntil! - h.sim.now()).toBe(before.sickness!.atClinicUntil! - t0);
    expect(a.immunities.sore_paw! - h.sim.now()).toBe(before.immunities.sore_paw! - t0);
    expect(a.arrivedAt).toBe(before.arrivedAt + away);
    expect(h.sim.badges('a')).toContain('baby'); // Still a baby: no aging while stored.
  });

  it('a pregnant pet gives birth on schedule after coming out, not while stored', () => {
    const h = world([
      { id: 'mom', isKept: true, pregnancy: { birthAt: START + 2 * MIN, litterSize: 3 } },
    ]);
    const born = vi.fn();
    h.sim.events.on('animalBorn', born);
    play(h, MIN);
    h.sim.storePet('mom');
    play(h, 3 * HOUR, MIN);
    expect(born).not.toHaveBeenCalled();
    h.sim.retrievePet('mom');
    play(h, MIN - SEC);
    expect(born).not.toHaveBeenCalled();
    play(h, SEC);
    expect(born).toHaveBeenCalledOnce();
    expect(h.sim.animalCount()).toBe(4);
  });

  it('the hold timer stays done for a pet stored after it was ready', () => {
    const h = world([{ id: 'a', isKept: true, holdUntil: START }]);
    h.sim.storePet('a');
    play(h, DAY, HOUR);
    h.sim.retrievePet('a');
    h.sim.unkeep('a');
    expect(h.sim.canSell('a').ok).toBe(true);
  });

  it('offline catch-up leaves stored pets alone, and the save keeps them paused', () => {
    const h = world([{ id: 'a', isKept: true, holdUntil: START + 20 * MIN }]);
    h.sim.storePet('a');
    const storedAt = h.sim.state.world.petStorage[0]!.storedAt;
    const snapshot = structuredClone(h.sim.getStoredPet('a'));
    h.clock.advance(20 * HOUR); // Past the 8-hour catch-up cap too.
    h.sim.catchUp();
    h.sim = GameSim.fromState(h.sim.toState(), h.clock);
    expect(h.sim.getStoredPet('a')).toEqual(snapshot);
    expect(h.sim.state.world.petStorage[0]!.storedAt).toBe(storedAt);
    h.sim.retrievePet('a');
    expect(h.sim.getAnimal('a')!.holdUntil - h.sim.now()).toBe(20 * MIN);
  });
});

describe('swapping', () => {
  function full() {
    return world([{ id: 'a', isKept: true }, { id: 'b', isKept: true }, { id: 'new' }], (s) =>
      s.world.petStorage.push({
        animal: makeAnimal(s, { id: 's', isKept: true }),
        storedAt: START,
      }),
    );
  }

  it('a slot pet and a stored pet trade places', () => {
    const h = full();
    expect(h.sim.swapPets('b', 's')).toEqual({ ok: true });
    expect(h.sim.getAnimal('s')).toBeDefined();
    expect(h.sim.getStoredPet('b')).toBeDefined();
    expect(h.sim.petSlots().used).toBe(2);
  });

  it('refuses swaps that aren’t a slot pet with a stored pet', () => {
    const h = full();
    expect(h.sim.swapPets('new', 's').ok).toBe(false); // Not kept.
    expect(h.sim.swapPets('a', 'b').ok).toBe(false); // Both out.
    expect(h.sim.swapPets('a', 'zzz').ok).toBe(false);
  });

  it('a new pet can take a slot, bumping a pet into Storage', () => {
    const h = full();
    expect(h.sim.keepBumping('new', 'a')).toEqual({ ok: true });
    expect(h.sim.getAnimal('new')!.isKept).toBe(true);
    expect(h.sim.getStoredPet('a')).toBeDefined();
    expect(h.sim.petSlots()).toMatchObject({ used: 2, free: 0 });
  });

  it('bumping needs Storage space', () => {
    const h = world([{ id: 'a', isKept: true }, { id: 'b', isKept: true }, { id: 'new' }], (s) => {
      for (let i = 0; i < 20; i++) {
        s.world.petStorage.push({ animal: makeAnimal(s, { isKept: true }), storedAt: START });
      }
    });
    expect(h.sim.keepBumping('new', 'a')).toEqual({ ok: false, reason: 'Pet Storage is full!' });
    expect(h.sim.getAnimal('new')!.isKept).toBe(false);
  });
});

describe('Animal Dex', () => {
  it('counts species, variants, and Sparkles found', () => {
    const h = edit(newSim(), (s) => {
      s.world.discoveredDex = ['bunny:white', 'bunny:brown', 'bunny:sparkle', 'fox:red'];
    });
    const dex = h.sim.dex();
    expect(dex.speciesTotal).toBe(SPECIES.length);
    expect(dex.speciesFound).toBe(2);
    expect(dex.looksFound).toBe(4);
    const bunny = dex.entries.find((e) => e.species.id === 'bunny')!;
    expect(bunny).toMatchObject({
      discovered: true,
      variantsFound: ['white', 'brown'],
      sparkleFound: true,
    });
    expect(dex.entries.find((e) => e.species.id === 'unicorn')!.discovered).toBe(false);
    expect(dex.looksTotal).toBe(SPECIES.reduce((n, s) => n + s.variants.length + 1, 0));
  });

  it('fills in as visitors arrive', () => {
    const h = world([], (s) =>
      s.world.gateQueue.push(makeVisitor(s, { speciesId: 'kitten', variantId: 'black' })),
    );
    expect(h.sim.dex().speciesFound).toBe(0);
    h.sim.revealVisitor(h.sim.state.world.gateQueue[0]!.id);
    expect(h.sim.dex().entries.find((e) => e.species.id === 'kitten')!.variantsFound).toEqual([
      'black',
    ]);
  });
});
