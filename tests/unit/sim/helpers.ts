import { BALANCE } from '../../../src/config/balance';
import { FakeClock } from '../../../src/sim/clock';
import { GameSim } from '../../../src/sim/GameSim';
import type { Animal, SimState, Visitor, VisitorRoll } from '../../../src/sim/types';

export const START = Date.UTC(2026, 0, 1);
export const SEC = 1000;
export const MIN = 60 * SEC;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

/**
 * Time limit for tests that run the economy harness for many simulated hours and seeds. They take
 * a few seconds here and about twice that on CI's machines, past Vitest's 5-second default.
 */
export const ECONOMY_TIMEOUT_MS = 30_000;

export interface Harness {
  sim: GameSim;
  clock: FakeClock;
}

/**
 * A new game without the new-player quick start, so tests of other rules see the plain
 * timings. Tests of the quick start pass `welcome = true`.
 */
export function newSim(seed = 1, welcome = false): Harness {
  const clock = new FakeClock(START);
  return { sim: GameSim.newGame({ clock, seed, welcome }), clock };
}

/** Plays online for `ms`, updating every `stepMs` like a running app. */
export function play(h: Harness, ms: number, stepMs = SEC): void {
  const end = h.clock.now() + ms;
  while (h.clock.now() < end) {
    h.clock.advance(Math.min(stepMs, end - h.clock.now()));
    h.sim.update();
  }
}

/** Rebuilds the sim from edited state (tests only: the real UI never mutates state). */
export function edit(h: Harness, mutate: (state: SimState) => void): Harness {
  const state = h.sim.toState();
  mutate(state);
  h.sim = GameSim.fromState(state, h.clock);
  return h;
}

let fakeId = 0;

export function makeAnimal(state: SimState, overrides: Partial<Animal> = {}): Animal {
  const now = state.meta.lastSeenAt;
  return {
    id: `test${++fakeId}`,
    speciesId: 'bunny',
    variantId: 'white',
    isSparkle: false,
    rarity: 'common',
    arrivedAt: now,
    holdUntil: now + BALANCE.holdMinutes * MIN,
    zone: 'yard',
    position: { x: 0.5, y: 0.5 },
    needs: { hunger: 100, happiness: 100 },
    careHistory: [],
    immunities: {},
    isKept: false,
    outfit: {},
    tricks: { known: [], progress: {}, nextTrainAt: now },
    nextPoopAt: now + 10 * MIN,
    nextWanderAt: now + 90 * SEC,
    nextPetAt: now,
    ...overrides,
  };
}

export function makeVisitor(
  state: SimState,
  roll: Partial<VisitorRoll> = {},
  overrides: Partial<Visitor> = {},
): Visitor {
  const now = state.meta.lastSeenAt;
  return {
    id: `testv${++fakeId}`,
    arrivedAtGate: now,
    autoRevealAt: now + BALANCE.visitor.autoRevealSeconds * SEC,
    leavesAt: now + BALANCE.visitor.gateWaitMinutes * MIN,
    revealed: false,
    roll: {
      speciesId: 'kitten',
      variantId: 'orange',
      isSparkle: false,
      rarity: 'common',
      litterSize: 0,
      ...roll,
    },
    ...overrides,
  };
}

/** Fills the world with `n` ready-to-sell adults. */
export function fillAnimals(state: SimState, n: number, overrides: Partial<Animal> = {}): void {
  for (let i = 0; i < n; i++) state.world.animals.push(makeAnimal(state, overrides));
}

export const capacityOf = (h: Harness) => h.sim.capacity();
