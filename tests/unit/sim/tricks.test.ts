import { describe, expect, it, vi } from 'vitest';
import { BALANCE } from '../../../src/config/balance';
import { ITEMS } from '../../../src/config/items';
import { DEFAULT_OUTFIT_ANCHORS, SPECIES, outfitAnchors } from '../../../src/config/species';
import { TRICKS } from '../../../src/config/tricks';
import { dayKey, type TrainResult } from '../../../src/sim/systems/tricks';
import type { Animal, Rarity, SimState } from '../../../src/sim/types';
import { HOUR, MIN, SEC, START, edit, makeAnimal, newSim, play } from './helpers';

const FAR = START + 999 * HOUR;
const COOLDOWN = BALANCE.tricks.cooldownMinutes * MIN;

function withAnimal(overrides: Partial<Animal> = {}, mutate?: (s: SimState) => void) {
  return edit(newSim(), (s) => {
    s.world.settings.sicknessEnabled = false;
    s.world.nextVisitorAt = FAR;
    s.world.animals.push(
      makeAnimal(s, { id: 'x', nextPoopAt: FAR, holdUntil: START, ...overrides }),
    );
    mutate?.(s);
  });
}

/** Trains one trick through to learned, waiting out each rest. */
function learn(h: ReturnType<typeof withAnimal>, trickId: string) {
  let last: TrainResult | undefined;
  for (let i = 0; i < BALANCE.tricks.sessionsToLearn; i++) {
    last = h.sim.trainSession('x', trickId, true);
    expect(last.ok, JSON.stringify(last)).toBe(true);
    play(h, COOLDOWN, 10 * SEC);
  }
  if (!last?.ok) throw new Error('Did not learn');
  return last;
}

describe('trick data (DESIGN 11)', () => {
  it('has the 8 starter tricks with unique ids', () => {
    expect(TRICKS.map((t) => t.name)).toEqual([
      'Sit',
      'Spin',
      'High-Five',
      'Roll Over',
      'Jump',
      'Dance',
      'Wave',
      'Fetch',
    ]);
    expect(new Set(TRICKS.map((t) => t.id)).size).toBe(TRICKS.length);
  });
});

describe('training (DESIGN 11)', () => {
  it('3 successful sessions learn a trick, 5 minutes apart', () => {
    const h = withAnimal();
    const practiced = vi.fn();
    const learned = vi.fn();
    h.sim.events.on('trickPracticed', practiced);
    h.sim.events.on('trickLearned', learned);
    expect(h.sim.trainSession('x', 'spin', true)).toEqual({
      ok: true,
      progress: 1,
      learned: false,
      gems: 0,
    });
    expect(h.sim.trainSession('x', 'spin', true)).toEqual({
      ok: false,
      reason: 'It needs a rest before training again.',
    });
    play(h, COOLDOWN - SEC);
    expect(h.sim.trainBlocker('x', 'spin')).not.toBeNull();
    play(h, SEC);
    expect(h.sim.trainSession('x', 'spin', true)).toMatchObject({ progress: 2, learned: false });
    play(h, COOLDOWN);
    expect(h.sim.trainSession('x', 'spin', true)).toEqual({
      ok: true,
      progress: 3,
      learned: true,
      gems: 5,
    });
    const a = h.sim.getAnimal('x')!;
    expect(a.tricks.known).toEqual(['spin']);
    expect(a.tricks.progress).toEqual({});
    expect(h.sim.state.world.gems).toBe(BALANCE.startingGems + 5);
    expect(practiced).toHaveBeenCalledTimes(2);
    expect(learned).toHaveBeenCalledWith(expect.objectContaining({ trickId: 'spin', gems: 5 }));
  });

  it('a mistake changes nothing: no progress, no rest, try again right away', () => {
    const h = withAnimal();
    expect(h.sim.trainSession('x', 'sit', false)).toEqual({
      ok: true,
      progress: 0,
      learned: false,
      gems: 0,
    });
    expect(h.sim.trainBlocker('x', 'sit')).toBeNull();
    expect(h.sim.trainSession('x', 'sit', true)).toMatchObject({ progress: 1 });
  });

  it('can’t train while sick, a trick it knows, or an unknown trick', () => {
    const sick = withAnimal({ sickness: { illnessId: 'sniffles', since: START } });
    expect(sick.sim.trainSession('x', 'sit', true)).toEqual({
      ok: false,
      reason: 'Too sick to train. Visit the vet!',
    });
    const h = withAnimal({ tricks: { known: ['sit'], progress: {}, nextTrainAt: START } });
    expect(h.sim.trainSession('x', 'sit', true)).toEqual({
      ok: false,
      reason: 'It already knows that one!',
    });
    expect(h.sim.trainSession('x', 'moonwalk', true).ok).toBe(false);
    expect(h.sim.trainSession('nope', 'sit', true).ok).toBe(false);
  });

  it.each(Object.entries(BALANCE.tricks.maxByRarity) as [Rarity, number][])(
    'a %s animal can learn %i tricks',
    (rarity, max) => {
      const known = TRICKS.slice(0, max).map((t) => t.id);
      const h = withAnimal({ rarity, tricks: { known, progress: {}, nextTrainAt: START } });
      expect(h.sim.maxTricks('x')).toBe(max);
      expect(h.sim.trainSession('x', TRICKS[max]!.id, true)).toEqual({
        ok: false,
        reason: 'It knows all the tricks it can learn!',
      });
    },
  );

  it('different tricks train separately; progress survives a save', () => {
    const h = withAnimal();
    h.sim.trainSession('x', 'sit', true);
    play(h, COOLDOWN);
    h.sim.trainSession('x', 'wave', true);
    const a = h.sim.toState().world.animals[0]!;
    expect(a.tricks.progress).toEqual({ sit: 1, wave: 1 });
  });

  it('each known trick adds +10% to the sale price (DESIGN 7.5)', () => {
    const h = withAnimal({ careHistory: [40] }); // Care x1.0.
    expect(h.sim.salePrice('x')).toBe(20);
    learn(h, 'sit');
    learn(h, 'spin');
    edit(h, (s) => (s.world.animals[0]!.careHistory = [40]));
    expect(h.sim.salePrice('x')).toBe(Math.round(20 * 1.2));
  });

  it('stored pets keep their tricks and training timer (paused)', () => {
    const h = withAnimal({ isKept: true });
    h.sim.trainSession('x', 'sit', true);
    const left = h.sim.getAnimal('x')!.tricks.nextTrainAt - h.sim.now();
    h.sim.storePet('x');
    play(h, HOUR, MIN);
    h.sim.retrievePet('x');
    expect(h.sim.getAnimal('x')!.tricks.nextTrainAt - h.sim.now()).toBe(left);
    expect(h.sim.getAnimal('x')!.tricks.progress).toEqual({ sit: 1 });
  });
});

describe('gems for new tricks (DESIGN 11): once per animal+trick, daily cap', () => {
  it('pays 5 gems for each new trick, never twice for the same animal and trick', () => {
    const h = withAnimal({ rarity: 'legendary' });
    expect(learn(h, 'sit').gems).toBe(5);
    expect(learn(h, 'spin').gems).toBe(5);
    expect(h.sim.state.world.gems).toBe(BALANCE.startingGems + 10);
    expect(h.sim.trainSession('x', 'sit', true).ok).toBe(false);
  });

  it('respects the daily cap: a partial payout, then nothing, and the trick is still learned', () => {
    const h = withAnimal({ rarity: 'legendary' }, (s) => {
      s.meta.dailyTrickGems = { date: dayKey(START), earned: 37 };
    });
    expect(h.sim.trickGemsLeftToday()).toBe(3);
    expect(learn(h, 'sit').gems).toBe(3);
    expect(h.sim.trickGemsLeftToday()).toBe(0);
    const r = learn(h, 'spin');
    expect(r).toMatchObject({ learned: true, gems: 0 });
    expect(h.sim.getAnimal('x')!.tricks.known).toEqual(['sit', 'spin']);
    expect(h.sim.state.world.gems).toBe(BALANCE.startingGems + 3);
    expect(h.sim.state.meta.dailyTrickGems).toEqual({ date: dayKey(h.sim.now()), earned: 40 });
  });

  it('the cap counts every animal together', () => {
    const h = edit(newSim(), (s) => {
      s.world.settings.sicknessEnabled = false;
      s.world.nextVisitorAt = FAR;
      s.world.settings.dailyTrickGemCap = 12;
      for (let i = 0; i < 4; i++) {
        s.world.animals.push(makeAnimal(s, { id: `a${i}`, nextPoopAt: FAR }));
      }
    });
    let gems = 0;
    for (let session = 0; session < 3; session++) {
      for (let i = 0; i < 4; i++) {
        const r = h.sim.trainSession(`a${i}`, 'sit', true);
        if (r.ok) gems += r.gems;
      }
      play(h, COOLDOWN, 10 * SEC);
    }
    expect(gems).toBe(12);
    expect(h.sim.state.world.gems).toBe(BALANCE.startingGems + 12);
  });

  it('resets on a new day', () => {
    const h = withAnimal({ rarity: 'legendary' }, (s) => {
      s.meta.dailyTrickGems = { date: dayKey(START), earned: 40 };
    });
    expect(h.sim.trickGemsLeftToday()).toBe(0);
    // Jump ahead to the next local day.
    const tomorrow = new Date(START);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 1, 0);
    h.clock.advance(tomorrow.getTime() - h.clock.now());
    h.sim.catchUp();
    expect(h.sim.trickGemsLeftToday()).toBe(BALANCE.tricks.dailyGemCap);
    expect(learn(h, 'jump').gems).toBe(5);
  });

  it('a parent can change the cap (DESIGN 20)', () => {
    const h = withAnimal({ rarity: 'legendary' });
    h.sim.updateSettings({ dailyTrickGemCap: 0 });
    expect(learn(h, 'sit').gems).toBe(0);
    h.sim.updateSettings({ dailyTrickGemCap: 100 });
    expect(h.sim.trickGemsLeftToday()).toBe(100);
  });

  it('dayKey is the local calendar date', () => {
    const d = new Date(2026, 8, 7, 23, 59);
    expect(dayKey(d.getTime())).toBe('2026-09-07');
    expect(dayKey(d.getTime() + 2 * MIN)).toBe('2026-09-08');
  });
});

describe('performing tricks (DESIGN 11)', () => {
  it('a kept pet performs a known trick for +10 happiness, any time', () => {
    const h = withAnimal({
      isKept: true,
      needs: { hunger: 100, happiness: 50 },
      tricks: { known: ['dance'], progress: {}, nextTrainAt: START },
    });
    const performed = vi.fn();
    h.sim.events.on('trickPerformed', performed);
    expect(h.sim.performTrick('x', 'dance')).toEqual({ ok: true });
    expect(h.sim.performTrick('x', 'dance')).toEqual({ ok: true });
    expect(h.sim.getAnimal('x')!.needs.happiness).toBe(70);
    expect(performed).toHaveBeenCalledTimes(2);
  });

  it('only kept pets, and only tricks they know', () => {
    const h = withAnimal({ tricks: { known: ['dance'], progress: {}, nextTrainAt: START } });
    expect(h.sim.performTrick('x', 'dance')).toEqual({
      ok: false,
      reason: 'Only your pets perform tricks.',
    });
    h.sim.keep('x');
    expect(h.sim.performTrick('x', 'spin')).toEqual({
      ok: false,
      reason: 'It hasn’t learned that yet.',
    });
  });
});

describe('pet outfits (DESIGN 10.3)', () => {
  const outfits = ITEMS.filter((i) => i.category === 'petOutfit');

  it('the Pet Boutique has head, body, and face outfits for coins', () => {
    for (const slot of ['head', 'body', 'face']) {
      expect(
        outfits.some((o) => o.category === 'petOutfit' && o.slot === slot),
        slot,
      ).toBe(true);
    }
    for (const o of outfits) expect(o.cost).toBeGreaterThan(0);
  });

  it('bought once with coins; any number of animals can wear it', () => {
    const h = withAnimal({}, (s) => {
      s.world.coins = 500;
      s.world.animals.push(makeAnimal(s, { id: 'y' }));
    });
    expect(h.sim.dressPet('x', 'party_hat')).toEqual({
      ok: false,
      reason: 'Get it in the Pet Boutique first.',
    });
    expect(h.sim.buyItem('party_hat')).toEqual({ ok: true });
    expect(h.sim.state.world.coins).toBe(460);
    expect(h.sim.buyItem('party_hat')).toEqual({ ok: false, reason: 'You already have it!' });
    expect(h.sim.dressPet('x', 'party_hat')).toEqual({ ok: true });
    expect(h.sim.dressPet('y', 'party_hat')).toEqual({ ok: true });
    expect(h.sim.getAnimal('y')!.outfit).toEqual({ head: 'party_hat' });
    expect(h.sim.state.world.inventory.party_hat).toBe(1);
  });

  it('one outfit per slot; take off; can’t place outfits in the house', () => {
    const h = withAnimal(
      {},
      (s) => (s.world.inventory = { big_bow: 1, pet_crown: 1, hero_cape: 1 }),
    );
    h.sim.dressPet('x', 'big_bow');
    h.sim.dressPet('x', 'hero_cape');
    h.sim.dressPet('x', 'pet_crown');
    expect(h.sim.getAnimal('x')!.outfit).toEqual({ head: 'pet_crown', body: 'hero_cape' });
    expect(h.sim.undressPet('x', 'head')).toEqual({ ok: true });
    expect(h.sim.undressPet('x', 'head').ok).toBe(false);
    expect(h.sim.getAnimal('x')!.outfit).toEqual({ body: 'hero_cape' });
    expect(h.sim.dressPet('x', 'sofa').ok).toBe(false);
    expect(h.sim.placeItem('big_bow', 'house', { x: 0, y: 0 }).ok).toBe(false);
  });

  it('outfits have a place on every species (outfits render on every species)', () => {
    for (const s of SPECIES) {
      const a = outfitAnchors(s.id);
      for (const slot of ['head', 'face', 'body'] as const) {
        expect(Number.isFinite(a[slot].x), `${s.id} ${slot}`).toBe(true);
        expect(Number.isFinite(a[slot].y), `${s.id} ${slot}`).toBe(true);
      }
      expect(a.scale).toBeGreaterThan(0);
      // The head sits above the face, which sits above the body.
      expect(a.head.y).toBeLessThan(a.face.y);
      expect(a.face.y).toBeLessThan(a.body.y);
    }
    expect(outfitAnchors('unknown')).toEqual(DEFAULT_OUTFIT_ANCHORS);
  });
});
