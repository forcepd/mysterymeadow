import { describe, expect, it, vi } from 'vitest';
import { BALANCE } from '../../../src/config/balance';
import { shiftWorld } from '../../../src/sim/systems/timeShift';
import type { Animal } from '../../../src/sim/types';
import {
  HOUR,
  MIN,
  SEC,
  START,
  edit,
  fillAnimals,
  makeAnimal,
  makeVisitor,
  newSim,
} from './helpers';

const INTERVAL = BALANCE.houseTiers[0].visitorMinutes * MIN;
const CAP = BALANCE.offline.maxCatchUpHours * HOUR;

describe('offline catch-up (DESIGN 14)', () => {
  it('queues up to 3 unrevealed visitors at the gate', () => {
    const h = newSim();
    h.clock.advance(2 * HOUR);
    const summary = h.sim.catchUp();
    expect(h.sim.state.world.gateQueue).toHaveLength(BALANCE.offline.maxGateQueue);
    expect(h.sim.state.world.gateQueue.every((v) => !v.revealed)).toBe(true);
    expect(h.sim.animalCount()).toBe(0);
    expect(summary.visitorsWaiting).toBe(3);
    // The timer kept running the whole time.
    expect(h.sim.state.world.nextVisitorAt).toBe(START + 13 * INTERVAL);
  });

  it('bounds the gate queue by free capacity', () => {
    const h = edit(newSim(), (s) => fillAnimals(s, 5, { holdUntil: START + 99 * HOUR }));
    h.clock.advance(2 * HOUR);
    h.sim.catchUp();
    expect(h.sim.state.world.gateQueue).toHaveLength(1);
  });

  it('queues nobody when full or crowded', () => {
    const h = edit(newSim(), (s) => fillAnimals(s, 7));
    h.clock.advance(2 * HOUR);
    h.sim.catchUp();
    expect(h.sim.state.world.gateQueue).toHaveLength(0);
  });

  it('gives waiting visitors a fresh wait so nobody leaves unseen', () => {
    const h = edit(newSim(), (s) => {
      fillAnimals(s, 6, { holdUntil: START + 99 * HOUR });
      s.world.gateQueue.push(makeVisitor(s, {}, { id: 'old', revealed: true }));
    });
    h.clock.advance(HOUR);
    h.sim.catchUp();
    const old = h.sim.state.world.gateQueue.find((v) => v.id === 'old')!;
    expect(old.leavesAt).toBe(START + HOUR + BALANCE.visitor.gateWaitMinutes * MIN);
  });

  it('progresses births, hold timers, and growth, and summarizes them', () => {
    const h = edit(newSim(), (s) =>
      s.world.animals.push(
        makeAnimal(s, { pregnancy: { birthAt: START + 3 * MIN, litterSize: 4 } }),
      ),
    );
    h.clock.advance(HOUR);
    const summary = h.sim.catchUp();
    expect(h.sim.animalCount()).toBe(5);
    expect(summary).toMatchObject({
      awayMs: HOUR,
      simulatedMs: HOUR,
      babiesBorn: 4,
      grewUp: 4,
      readyToSell: 5,
    });
    for (const a of h.sim.state.world.animals) expect(h.sim.canSell(a.id).ok).toBe(true);
  });

  it('lets offline births overfill capacity, but then queues no visitors', () => {
    const h = edit(newSim(), (s) => {
      fillAnimals(s, 5, { holdUntil: START + 99 * HOUR });
      s.world.animals.push(makeAnimal(s, { pregnancy: { birthAt: START + MIN, litterSize: 5 } }));
    });
    h.clock.advance(2 * HOUR);
    h.sim.catchUp();
    expect(h.sim.animalCount()).toBe(11);
    expect(h.sim.isCrowded()).toBe(true);
    expect(h.sim.state.world.gateQueue).toHaveLength(0);
  });

  it('sends only a caughtUp summary, not per-item events', () => {
    const h = edit(newSim(), (s) =>
      s.world.animals.push(makeAnimal(s, { pregnancy: { birthAt: START + MIN, litterSize: 2 } })),
    );
    const born = vi.fn();
    const arrived = vi.fn();
    const caughtUp = vi.fn();
    h.sim.events.on('animalBorn', born);
    h.sim.events.on('visitorArrived', arrived);
    h.sim.events.on('caughtUp', caughtUp);
    h.clock.advance(HOUR);
    h.sim.catchUp();
    expect(born).not.toHaveBeenCalled();
    expect(arrived).not.toHaveBeenCalled();
    expect(caughtUp).toHaveBeenCalledTimes(1);
  });

  it('caps catch-up at 8 hours: the rest is paused time', () => {
    const holdUntil = START + 9 * HOUR;
    const h = edit(newSim(), (s) => s.world.animals.push(makeAnimal(s, { id: 'slow', holdUntil })));
    const away = 3 * 24 * HOUR;
    h.clock.advance(away);
    const summary = h.sim.catchUp();
    expect(summary.awayMs).toBe(away);
    expect(summary.simulatedMs).toBe(CAP);
    // Only 8 of its 9 hours passed, so it still has an hour to go.
    const slow = h.sim.getAnimal('slow')!;
    expect(slow.holdUntil - h.sim.now()).toBe(HOUR);
    expect(h.sim.canSell('slow').ok).toBe(false);
    expect(h.sim.now()).toBe(START + away);
  });

  it('with offline progress off, nothing progresses at all', () => {
    const h = edit(newSim(), (s) => {
      s.world.settings.offlineProgress = false;
      s.world.animals.push(
        makeAnimal(s, { id: 'mom', pregnancy: { birthAt: START + MIN, litterSize: 2 } }),
      );
    });
    h.clock.advance(5 * HOUR);
    const summary = h.sim.catchUp();
    expect(summary.simulatedMs).toBe(0);
    expect(h.sim.animalCount()).toBe(1);
    expect(h.sim.state.world.gateQueue).toHaveLength(0);
    expect(h.sim.getAnimal('mom')!.pregnancy!.birthAt - h.sim.now()).toBe(MIN);
    expect(h.sim.msUntilNextVisitor()).toBe(INTERVAL);
  });

  it('update() treats a long gap as offline time', () => {
    const h = newSim();
    const caughtUp = vi.fn();
    h.sim.events.on('caughtUp', caughtUp);
    h.clock.advance(BALANCE.time.offlineGapSeconds * SEC);
    h.sim.update();
    expect(caughtUp).not.toHaveBeenCalled();
    h.clock.advance(HOUR);
    h.sim.update();
    expect(caughtUp).toHaveBeenCalledTimes(1);
    expect(h.sim.state.world.gateQueue.length).toBeGreaterThan(0);
  });

  it('is a no-op with no time away', () => {
    const h = newSim();
    const caughtUp = vi.fn();
    h.sim.events.on('caughtUp', caughtUp);
    expect(h.sim.catchUp().awayMs).toBe(0);
    expect(caughtUp).not.toHaveBeenCalled();
  });
});

describe('shiftWorld', () => {
  it('shifts every timestamp on animals, visitors, poops, and the visitor timer', () => {
    const h = newSim();
    const state = h.sim.toState();
    const full: Animal = makeAnimal(state, {
      bornAt: 1,
      grownAt: 2,
      pregnancy: { birthAt: 3, litterSize: 1 },
      sickness: { illnessId: 'sniffles', since: 4, atClinicUntil: 5 },
      immunities: { fleas: 6 },
    });
    state.world.animals.push(full);
    state.world.gateQueue.push(makeVisitor(state));
    state.world.poops.push({ id: 'p', zone: 'yard', position: { x: 0, y: 0 }, createdAt: 7 });
    state.world.finds.push({ id: 'f', kind: 'coin', position: { x: 0, y: 0 }, expiresAt: 8 });
    const before = structuredClone(state.world);
    shiftWorld(state.world, 1000);

    // Every number that is a timestamp (by field name) must move by exactly 1000.
    const timeKeys = /At$|AtGate$|Until$|^since$|^fleas$/;
    const walk = (a: unknown, b: unknown, key: string): void => {
      if (typeof a === 'number') {
        expect(b, key).toBe(timeKeys.test(key) ? a + 1000 : a);
      } else if (a && typeof a === 'object') {
        for (const k of Object.keys(a)) walk((a as never)[k], (b as never)[k], k);
      }
    };
    walk(before, state.world, 'world');
    expect(state.world.animals[0]!.holdUntil).toBe(before.animals[0]!.holdUntil + 1000);
  });
});
