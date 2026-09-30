import { describe, expect, it, vi } from 'vitest';
import { BALANCE } from '../../../src/config/balance';
import { ALL_GOALS_REWARD, GOALS } from '../../../src/config/goals';
import { GameSim } from '../../../src/sim/GameSim';
import { FakeClock } from '../../../src/sim/clock';
import { dayKey } from '../../../src/sim/systems/tricks';
import type { SimState } from '../../../src/sim/types';
import { DAY, HOUR, MIN, SEC, START, edit, makeAnimal, newSim, play } from './helpers';

const W = BALANCE.welcome;
const F = BALANCE.finds;

/** A real new game, with the quick start (no tutorial). */
function welcomeSim(seed = 1) {
  return newSim(seed, true);
}

/**
 * Plays like an attentive kid: every 5 seconds it taps new visitors and sells whatever is ready,
 * so the yard never gets crowded. (Commands never run inside event listeners.)
 */
function playAttentive(h: ReturnType<typeof welcomeSim>, minutes: number): void {
  for (let i = 0; i < (minutes * 60) / 5; i++) {
    play(h, 5 * SEC, 5 * SEC);
    for (const v of [...h.sim.state.world.gateQueue]) if (!v.revealed) h.sim.revealVisitor(v.id);
    for (const a of [...h.sim.state.world.animals]) if (h.sim.canSell(a.id).ok) h.sim.sell(a.id);
  }
}

/** Every visitor arrival time (minutes into the game), with nothing getting sick. */
function arrivals(minutes: number, seed = 1): number[] {
  const h = welcomeSim(seed);
  edit(h, (s) => (s.world.settings.sicknessEnabled = false));
  const times: number[] = [];
  h.sim.events.on('visitorArrived', ({ visitor }) =>
    times.push((visitor.arrivedAtGate - START) / MIN),
  );
  playAttentive(h, minutes);
  return times;
}

describe('new-player quick start: faster first visitors', () => {
  it('the first visitors come every 2 minutes, then the Cottage’s usual 10', () => {
    const times = arrivals(40);
    const gaps = times.slice(1).map((t, i) => t - times[i]!);
    expect(times[0]).toBe(W.fastVisitorMinutes);
    expect(gaps.slice(0, W.fastVisitors - 1)).toEqual(
      Array(W.fastVisitors - 1).fill(W.fastVisitorMinutes),
    );
    expect(gaps[W.fastVisitors - 1]).toBe(BALANCE.houseTiers[0].visitorMinutes);
  });

  it('without the quick start (older saves), the first visitor takes the usual time', () => {
    const h = newSim(1, false);
    expect(h.sim.msUntilNextVisitor()).toBe(BALANCE.houseTiers[0].visitorMinutes * MIN);
    expect(h.sim.state.world.welcome.fastVisitorsLeft).toBe(0);
  });

  it('the tutorial’s visitor still comes right away', () => {
    const sim = GameSim.newGame({ clock: new FakeClock(START), seed: 1, tutorial: true });
    expect(sim.msUntilNextVisitor()).toBe(0);
  });
});

describe('new-player quick start: sooner first sales', () => {
  it('the first 3 animals can be sold after 5 minutes; the 4th waits the usual 20', () => {
    const h = welcomeSim();
    edit(h, (s) => (s.world.settings.sicknessEnabled = false));
    const entered: { at: number; holdUntil: number }[] = [];
    h.sim.events.on('visitorEntered', ({ animal }) =>
      entered.push({ at: animal.arrivedAt, holdUntil: animal.holdUntil }),
    );
    playAttentive(h, 12);
    const waits = entered.map((e) => (e.holdUntil - e.at) / MIN);
    expect(waits.slice(0, W.quickHolds)).toEqual(Array(W.quickHolds).fill(W.quickHoldMinutes));
    expect(waits[W.quickHolds]).toBe(BALANCE.holdMinutes);
  });
});

describe('new-player quick start: surprises', () => {
  it('the 2nd visitor is always expecting babies and the 3rd is at least Uncommon', () => {
    // (If babies crowd the yard, a skipped visitor doesn't use up a surprise: the next one gets it.)
    for (let seed = 1; seed <= 30; seed++) {
      const h = welcomeSim(seed);
      const rolls: { rarity: string; litterSize: number }[] = [];
      h.sim.events.on('visitorArrived', ({ visitor }) => rolls.push(visitor.roll));
      playAttentive(h, 40);
      expect(rolls[1]!.litterSize, `seed ${seed}`).toBeGreaterThanOrEqual(W.surpriseMinLitter);
      expect(rolls[2]!.rarity, `seed ${seed}`).not.toBe('common');
    }
  });

  it('each surprise is used once', () => {
    const h = welcomeSim();
    playAttentive(h, 10);
    expect(h.sim.state.world.welcome.surprises).toEqual([]);
  });
});

describe('starter goals', () => {
  it('count the player’s own actions, and say when a goal is ready', () => {
    const h = edit(newSim(), (s: SimState) => {
      s.world.animals.push(makeAnimal(s, { id: 'a', nextPetAt: START }));
      s.world.poops.push({
        id: 'p1',
        zone: 'yard',
        position: { x: 0.5, y: 0.5 },
        createdAt: START,
      });
    });
    const ready = vi.fn();
    h.sim.events.on('goalReady', ready);
    h.sim.rename('a', 'Pip');
    h.sim.cleanPoop('p1');
    expect(h.sim.state.world.goals.progress).toMatchObject({ name1: 1, clean3: 1 });
    expect(ready).toHaveBeenCalledWith({ goalId: 'name1' });
    expect(h.sim.readyGoalCount()).toBe(1);
  });

  it('don’t count helpers’ work (Scoop Bot, Auto-Feeder)', () => {
    const h = newSim();
    const s = h.sim.toState();
    expect(s.world.goals.progress).toEqual({});
    // Simulate what the helpers emit.
    h.sim.debugRun((ctx) => {
      ctx.emit('poopCleaned', {
        poop: { id: 'x', zone: 'yard', position: { x: 0, y: 0 }, createdAt: START },
        by: 'scoopBot',
      });
      ctx.emit('bowlRefilled', { bowlId: 'start1', by: 'autoFeeder' });
    });
    expect(h.sim.state.world.goals.progress).toEqual({});
  });

  it('pay their reward once, only when done', () => {
    const h = edit(newSim(), (s) => s.world.animals.push(makeAnimal(s, { id: 'a' })));
    const coins = h.sim.state.world.coins;
    expect(h.sim.claimGoal('name1').ok).toBe(false);
    h.sim.rename('a', 'Pip');
    const gems = h.sim.state.world.gems;
    expect(h.sim.claimGoal('name1')).toEqual({ ok: true });
    expect(h.sim.state.world.gems).toBe(gems + GOALS.find((g) => g.id === 'name1')!.reward.gems!);
    expect(h.sim.claimGoal('name1').ok).toBe(false);
    expect(h.sim.claimGoal('nope').ok).toBe(false);
    expect(h.sim.state.world.coins).toBe(coins);
  });

  it('a lure only counts when it goes in the yard', () => {
    const h = edit(newSim(), (s) => (s.world.coins = 1000));
    h.sim.buyItem('carrot_patch');
    h.sim.buyItem('armchair');
    h.sim.placeItem('armchair', 'house', { x: 0, y: 0 });
    expect(h.sim.state.world.goals.progress.lure1).toBeUndefined();
    expect(h.sim.placeItem('carrot_patch', 'yard', { x: 3, y: 0 }).ok).toBe(true);
    expect(h.sim.state.world.goals.progress.lure1).toBe(1);
  });

  it('finishing them all gives the Flower Garden and bonus coins', () => {
    const h = edit(newSim(), (s) => {
      for (const g of GOALS) s.world.goals.progress[g.id] = g.target;
    });
    const done = vi.fn();
    h.sim.events.on('goalsCompleted', done);
    for (const g of GOALS.slice(0, -1)) h.sim.claimGoal(g.id);
    expect(done).not.toHaveBeenCalled();
    const coins = h.sim.state.world.coins;
    h.sim.claimGoal(GOALS[GOALS.length - 1]!.id);
    expect(done).toHaveBeenCalledOnce();
    expect(h.sim.ownedCount(ALL_GOALS_REWARD.itemId!)).toBe(1);
    expect(h.sim.state.world.coins).toBeGreaterThanOrEqual(coins + ALL_GOALS_REWARD.coins!);
  });

  it('every goal is reachable: a real counter, a target, and a reward', () => {
    expect(new Set(GOALS.map((g) => g.id)).size).toBe(GOALS.length);
    for (const g of GOALS) {
      expect(g.target).toBeGreaterThan(0);
      expect(
        (g.reward.coins ?? 0) + (g.reward.gems ?? 0) + (g.reward.itemId ? 1 : 0),
      ).toBeGreaterThan(0);
    }
  });
});

describe('yard finds', () => {
  it('the first one shows up a few minutes into a new game, in the yard', () => {
    const h = newSim();
    const appeared = vi.fn();
    h.sim.events.on('findAppeared', appeared);
    play(h, F.firstAfterMinutes * MIN - SEC, 5 * SEC);
    expect(appeared).not.toHaveBeenCalled();
    play(h, 2 * SEC);
    expect(appeared).toHaveBeenCalledOnce();
    const find = h.sim.state.world.finds[0]!;
    expect(Object.keys(F.kinds)).toContain(find.kind);
    expect(find.position.x).toBeGreaterThan(0);
    expect(find.position.x).toBeLessThan(1);
  });

  it('tapping one gives its coins; it can only be collected once', () => {
    const h = newSim();
    play(h, F.firstAfterMinutes * MIN + SEC, 5 * SEC);
    const find = h.sim.state.world.finds[0]!;
    const coins = h.sim.state.world.coins;
    expect(h.sim.collectFind(find.id)).toEqual({ ok: true });
    expect(h.sim.state.world.coins).toBe(coins + F.kinds[find.kind].coins);
    expect(h.sim.collectFind(find.id).ok).toBe(false);
  });

  it('never more than 2 at once, and each floats away after 3 minutes', () => {
    const h = newSim();
    let most = 0;
    const gone = vi.fn();
    h.sim.events.on('findGone', gone);
    for (let i = 0; i < 60; i++) {
      play(h, MIN, 5 * SEC);
      most = Math.max(most, h.sim.state.world.finds.length);
      for (const f of h.sim.state.world.finds)
        expect(f.expiresAt - h.sim.now()).toBeLessThanOrEqual(F.lifetimeMinutes * MIN);
    }
    expect(most).toBeGreaterThan(0);
    expect(most).toBeLessThanOrEqual(F.maxAtOnce);
    expect(gone).toHaveBeenCalled();
  });

  it('about one every 3 minutes (between 2 and 4)', () => {
    const h = newSim();
    const appeared = vi.fn();
    h.sim.events.on('findAppeared', appeared);
    // Collect each one soon, so the "2 at once" cap never skips one.
    for (let i = 0; i < 3 * 60 * 6; i++) {
      play(h, 10 * SEC, 10 * SEC);
      for (const f of [...h.sim.state.world.finds]) h.sim.collectFind(f.id);
    }
    const perHour = appeared.mock.calls.length / 3;
    expect(perHour).toBeGreaterThan(60 / F.maxMinutes - 1);
    expect(perHour).toBeLessThan(60 / F.minMinutes + 1);
  });

  it('nothing shows up while the player is away', () => {
    const h = newSim();
    h.clock.advance(3 * HOUR);
    h.sim.catchUp();
    expect(h.sim.state.world.finds).toEqual([]);
  });
});

describe('daily present', () => {
  it('not on day one; ready the next day; one per day', () => {
    const h = newSim();
    expect(h.sim.dailyGiftReady()).toBe(false);
    expect(h.sim.openDailyGift().ok).toBe(false);
    h.clock.advance(DAY);
    h.sim.catchUp();
    expect(h.sim.dailyGiftReady()).toBe(true);
    const opened = vi.fn();
    h.sim.events.on('dailyGiftOpened', opened);
    const r = h.sim.openDailyGift();
    expect(r.ok).toBe(true);
    expect(opened).toHaveBeenCalledOnce();
    expect(h.sim.dailyGiftReady()).toBe(false);
    expect(h.sim.state.world.dailyGift.lastDay).toBe(dayKey(h.sim.now()));
    // Missing days is fine: just one present when you come back.
    h.clock.advance(5 * DAY);
    h.sim.catchUp();
    expect(h.sim.openDailyGift().ok).toBe(true);
    expect(h.sim.openDailyGift().ok).toBe(false);
  });

  it('gives coins, a lure, or gems, and really adds them', () => {
    const kinds = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const h = newSim(seed);
      h.clock.advance(DAY);
      h.sim.catchUp();
      const before = structuredClone(h.sim.state.world);
      const r = h.sim.openDailyGift();
      if (!r.ok) throw new Error(r.reason);
      const w = h.sim.state.world;
      expect(w.coins).toBe(before.coins + r.reward.coins);
      expect(w.gems).toBe(before.gems + r.reward.gems);
      if (r.reward.itemId) {
        expect(BALANCE.dailyGift.items).toContain(r.reward.itemId);
        expect(w.inventory[r.reward.itemId]).toBe((before.inventory[r.reward.itemId] ?? 0) + 1);
        kinds.add('item');
      } else if (r.reward.gems) kinds.add('gems');
      else {
        expect(BALANCE.dailyGift.coins).toContain(r.reward.coins);
        kinds.add('coins');
      }
    }
    expect([...kinds].sort()).toEqual(['coins', 'gems', 'item']);
  });
});
