import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../../src/config/balance';
import { DEFAULT_HOUSE_COLOR } from '../../../src/config/houseColors';
import { formatEconomyReport, runEconomy } from '../../../src/sim/harness/economy';
import { ECONOMY_TIMEOUT_MS, HOUR, MIN, SEC, START, newSim, play } from './helpers';

describe('new game', () => {
  it('starts with the configured balances in a Cozy Cottage', () => {
    const { sim } = newSim();
    const { world, meta } = sim.state;
    expect(world.coins).toBe(BALANCE.startingCoins);
    expect(world.gems).toBe(BALANCE.startingGems);
    expect(world.house).toEqual({
      tierId: 'cottage',
      exteriorColor: DEFAULT_HOUSE_COLOR,
      roomExpansions: 0,
      petSlotsPurchased: 0,
      storageExpansions: 0,
      wallpaperId: 'wallpaper_cream',
      flooringId: 'flooring_wood',
    });
    expect(world.animals).toEqual([]);
    expect(world.settings.offlineProgress).toBe(true);
    expect(world.settings.dailyTrickGemCap).toBe(BALANCE.tricks.dailyGemCap);
    expect(meta.createdAt).toBe(START);
    expect(sim.lureScore()).toBe(0);
    expect(sim.houseTier().id).toBe('cottage');
  });
});

describe('tick loop', () => {
  it('advances in whole 1-second ticks, never ahead of the clock', () => {
    const h = newSim();
    h.clock.advance(2500);
    h.sim.update();
    expect(h.sim.now()).toBe(START + 2000);
    h.clock.advance(400);
    h.sim.update();
    expect(h.sim.now()).toBe(START + 2000);
    h.clock.advance(100);
    h.sim.update();
    expect(h.sim.now()).toBe(START + 3000);
  });

  it('gives the same result whether updated every second or every few minutes', () => {
    const a = newSim(9);
    const b = newSim(9);
    play(a, 2 * HOUR, SEC);
    play(b, 2 * HOUR, 4 * MIN);
    expect(b.sim.toState()).toEqual(a.sim.toState());
  });

  it('is deterministic for a given seed and differs between seeds', () => {
    const a = newSim(1);
    const b = newSim(1);
    const c = newSim(2);
    for (const h of [a, b, c]) play(h, 3 * HOUR, MIN);
    expect(a.sim.toState()).toEqual(b.sim.toState());
    expect(a.sim.toState().world.animals).not.toEqual(c.sim.toState().world.animals);
  });

  it('gives commands a result and never throws for bad ids', () => {
    const { sim } = newSim();
    expect(sim.sell('ghost')).toMatchObject({ ok: false });
    expect(sim.revealVisitor('ghost')).toMatchObject({ ok: false });
    expect(sim.canSell('ghost')).toMatchObject({ ok: false });
    expect(sim.badges('ghost')).toEqual([]);
  });
});

describe('economy harness (DESIGN 21, Phase 1 done-when)', () => {
  it('simulates 3 hours in under a second and prints a summary', () => {
    const started = performance.now();
    const report = runEconomy({ hours: 3, seed: 1 });
    const elapsed = performance.now() - started;
    expect(elapsed).toBeLessThan(1000);
    expect(report.visitorsArrived).toBeGreaterThan(10);
    expect(report.coinsEarned).toBeGreaterThan(0);
    const text = formatEconomyReport(report, elapsed);
    expect(text).toContain('Economy summary: 3 h');
    expect(text).toContain('Coins earned');
  });

  it(
    'pays a caring player more than a neglectful one (Phase 3 done-when)',
    () => {
      const avg = (bot: 'caring' | 'neglect') => {
        let coins = 0;
        let care = 0;
        const runs = 24; // Enough seeds that luck evens out.
        for (let seed = 1; seed <= runs; seed++) {
          // Without the new-player quick start: this compares care, and the quick start is the
          // same for both bots.
          const r = runEconomy({ hours: 12, seed, bot, welcome: false });
          coins += r.coinsPerHour;
          care += r.avgCareMultiplier;
        }
        return { coins: coins / runs, care: care / runs };
      };
      const caring = avg('caring');
      const neglect = avg('neglect');
      expect(caring.care).toBeGreaterThan(1.15);
      expect(neglect.care).toBeLessThan(1.05);
      expect(caring.coins).toBeGreaterThan(neglect.coins * 1.15);
      // DESIGN 15.1 estimates ~500/hour at care x1.0; good care lands above it.
      expect(neglect.coins).toBeGreaterThan(380);
      expect(caring.coins).toBeLessThan(750);
    },
    ECONOMY_TIMEOUT_MS,
  );

  it(
    'reports sickness: neglected animals get sick more often',
    () => {
      const sickCases = (bot: 'caring' | 'neglect') => {
        let sick = 0;
        for (let seed = 1; seed <= 6; seed++)
          sick += runEconomy({ hours: 12, seed, bot }).sickCases;
        return sick;
      };
      const caring = sickCases('caring');
      expect(caring).toBeGreaterThan(0);
      expect(sickCases('neglect')).toBeGreaterThan(caring * 1.3);
    },
    ECONOMY_TIMEOUT_MS,
  );
});
