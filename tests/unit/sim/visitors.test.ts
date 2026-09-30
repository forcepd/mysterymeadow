import { describe, expect, it, vi } from 'vitest';
import { BALANCE } from '../../../src/config/balance';
import { MIN, SEC, START, edit, fillAnimals, makeVisitor, newSim, play } from './helpers';

const INTERVAL = BALANCE.houseTiers[0].visitorMinutes * MIN;
const AUTO_REVEAL = BALANCE.visitor.autoRevealSeconds * SEC;
const GATE_WAIT = BALANCE.visitor.gateWaitMinutes * MIN;

describe('visitor timer (DESIGN 6.1)', () => {
  it('sends the first visitor one interval after a new game starts', () => {
    const h = newSim();
    const arrived = vi.fn();
    h.sim.events.on('visitorArrived', arrived);
    play(h, INTERVAL - SEC);
    expect(arrived).not.toHaveBeenCalled();
    expect(h.sim.msUntilNextVisitor()).toBe(SEC);
    play(h, SEC);
    expect(arrived).toHaveBeenCalledTimes(1);
    const visitor = h.sim.state.world.gateQueue[0]!;
    expect(visitor.revealed).toBe(false);
    expect(visitor.arrivedAtGate).toBe(START + INTERVAL);
  });

  it('keeps a steady schedule', () => {
    const h = newSim();
    const fired = vi.fn();
    // The timer fires on schedule; if babies made the yard Crowded, that visit is skipped.
    h.sim.events.on('visitorArrived', fired);
    h.sim.events.on('visitorSkipped', fired);
    play(h, 5 * INTERVAL);
    expect(fired).toHaveBeenCalledTimes(5);
    expect(h.sim.state.world.nextVisitorAt).toBe(START + 6 * INTERVAL);
  });

  it.each(BALANCE.houseTiers.map((t) => [t.id, t.visitorMinutes] as const))(
    'uses the %s interval of %i minutes',
    (tierId, minutes) => {
      const h = edit(newSim(), (s) => {
        s.world.house.tierId = tierId;
        s.world.nextVisitorAt = START + minutes * MIN;
      });
      const arrived = vi.fn();
      h.sim.events.on('visitorArrived', arrived);
      play(h, minutes * MIN * 3);
      expect(arrived).toHaveBeenCalledTimes(3);
    },
  );
});

describe('revealing', () => {
  it('reveals on tap and walks straight in when there is room', () => {
    const h = newSim();
    play(h, INTERVAL);
    const visitor = h.sim.state.world.gateQueue[0]!;
    const revealed = vi.fn();
    const entered = vi.fn();
    h.sim.events.on('visitorRevealed', revealed);
    h.sim.events.on('visitorEntered', entered);

    expect(h.sim.revealVisitor(visitor.id)).toEqual({ ok: true });
    expect(revealed).toHaveBeenCalledWith(expect.objectContaining({ auto: false }));
    expect(entered).toHaveBeenCalledTimes(1);
    expect(h.sim.state.world.gateQueue).toHaveLength(0);
    const animal = h.sim.state.world.animals[0]!;
    expect(animal.speciesId).toBe(visitor.roll.speciesId);
    expect(animal.variantId).toBe(visitor.roll.variantId);
    expect(animal.zone).toBe('yard');
    expect(animal.arrivedAt).toBe(h.sim.now());
    expect(animal.holdUntil).toBe(h.sim.now() + BALANCE.holdMinutes * MIN);
  });

  it('auto-reveals after 60 seconds', () => {
    const h = newSim();
    play(h, INTERVAL);
    const revealed = vi.fn();
    h.sim.events.on('visitorRevealed', revealed);
    play(h, AUTO_REVEAL - SEC);
    expect(revealed).not.toHaveBeenCalled();
    play(h, SEC);
    expect(revealed).toHaveBeenCalledWith(expect.objectContaining({ auto: true }));
    expect(h.sim.animalCount()).toBe(1);
  });

  it('refuses unknown or already revealed visitors', () => {
    const h = newSim();
    expect(h.sim.revealVisitor('nope').ok).toBe(false);
    h.sim = edit(h, (s) => {
      fillAnimals(s, 6);
      s.world.gateQueue.push(makeVisitor(s));
    }).sim;
    const id = h.sim.state.world.gateQueue[0]!.id;
    expect(h.sim.revealVisitor(id).ok).toBe(true);
    expect(h.sim.revealVisitor(id)).toEqual({ ok: false, reason: 'Already revealed!' });
  });

  it('adds revealed species and variants (and Sparkle) to the Dex once', () => {
    const h = edit(newSim(), (s) => {
      s.world.gateQueue.push(
        makeVisitor(s, { speciesId: 'fox', variantId: 'red', isSparkle: true }),
      );
      s.world.gateQueue.push(makeVisitor(s, { speciesId: 'fox', variantId: 'red' }));
    });
    const discovered = vi.fn();
    h.sim.events.on('dexDiscovered', discovered);
    for (const v of [...h.sim.state.world.gateQueue]) h.sim.revealVisitor(v.id);
    expect(h.sim.state.world.discoveredDex).toEqual(['fox:red', 'fox:sparkle']);
    expect(discovered).toHaveBeenCalledTimes(2);
  });
});

describe('gate queue at capacity', () => {
  function fullYard() {
    const h = edit(newSim(), (s) => fillAnimals(s, 6, { holdUntil: START + 60 * MIN }));
    expect(h.sim.freeCapacity()).toBe(0);
    return h;
  }

  it('still arrives at capacity and waits at the gate, revealed', () => {
    const h = fullYard();
    play(h, INTERVAL + AUTO_REVEAL);
    expect(h.sim.state.world.gateQueue).toHaveLength(1);
    expect(h.sim.state.world.gateQueue[0]!.revealed).toBe(true);
    expect(h.sim.animalCount()).toBe(6);
  });

  it('waves goodbye after 5 minutes if no spot frees up, and the next timer is on schedule', () => {
    const h = fullYard();
    const left = vi.fn();
    h.sim.events.on('visitorLeft', left);
    play(h, INTERVAL + GATE_WAIT - SEC);
    expect(left).not.toHaveBeenCalled();
    play(h, SEC);
    expect(left).toHaveBeenCalledTimes(1);
    expect(h.sim.state.world.gateQueue).toHaveLength(0);
    expect(h.sim.state.world.nextVisitorAt).toBe(START + 2 * INTERVAL);
  });

  it('comes in when a spot frees up before it leaves', () => {
    const h = edit(newSim(), (s) => {
      fillAnimals(s, 5, { holdUntil: START + 60 * MIN });
      fillAnimals(s, 1, { holdUntil: START }); // sellable now
    });
    play(h, INTERVAL + AUTO_REVEAL);
    expect(h.sim.state.world.gateQueue).toHaveLength(1);
    const sellable = h.sim.state.world.animals.find((a) => a.holdUntil === START)!;
    const entered = vi.fn();
    h.sim.events.on('visitorEntered', entered);
    expect(h.sim.sell(sellable.id).ok).toBe(true);
    expect(entered).toHaveBeenCalledTimes(1);
    expect(h.sim.state.world.gateQueue).toHaveLength(0);
    expect(h.sim.animalCount()).toBe(6);
  });

  it('admits waiting visitors oldest first, one per free spot', () => {
    const h = edit(newSim(), (s) => {
      fillAnimals(s, 5);
      s.world.gateQueue.push(makeVisitor(s, {}, { id: 'first', revealed: true }));
      s.world.gateQueue.push(makeVisitor(s, {}, { id: 'second', revealed: true }));
    });
    play(h, SEC);
    expect(h.sim.state.world.gateQueue.map((v) => v.id)).toEqual(['second']);
    expect(h.sim.animalCount()).toBe(6);
  });

  it('does not admit an unrevealed visitor even with room', () => {
    const h = edit(newSim(), (s) => s.world.gateQueue.push(makeVisitor(s)));
    play(h, AUTO_REVEAL - SEC);
    expect(h.sim.animalCount()).toBe(0);
  });
});

describe('Crowded (over capacity)', () => {
  it('skips visitors while crowded, keeping the timer on schedule', () => {
    const h = edit(newSim(), (s) => fillAnimals(s, 7, { holdUntil: START + 99 * MIN }));
    expect(h.sim.isCrowded()).toBe(true);
    const skipped = vi.fn();
    const arrived = vi.fn();
    h.sim.events.on('visitorSkipped', skipped);
    h.sim.events.on('visitorArrived', arrived);
    play(h, INTERVAL);
    expect(skipped).toHaveBeenCalledWith({ reason: 'crowded' });
    expect(arrived).not.toHaveBeenCalled();
    expect(h.sim.state.world.nextVisitorAt).toBe(START + 2 * INTERVAL);
  });

  it('resumes visitors once back at capacity', () => {
    const h = edit(newSim(), (s) => {
      fillAnimals(s, 6, { holdUntil: START + 99 * MIN });
      fillAnimals(s, 1, { holdUntil: START });
    });
    const crowded = vi.fn();
    h.sim.events.on('crowdedChanged', crowded);
    const extra = h.sim.state.world.animals.find((a) => a.holdUntil === START)!;
    h.sim.sell(extra.id);
    expect(crowded).toHaveBeenCalledWith({ crowded: false });
    const arrived = vi.fn();
    h.sim.events.on('visitorArrived', arrived);
    play(h, INTERVAL);
    expect(arrived).toHaveBeenCalledTimes(1);
  });
});
