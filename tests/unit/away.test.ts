import { describe, expect, it } from 'vitest';
import { awayCard, formatAway } from '../../src/bridge/away';
import { DEFAULT_PROFILE, GameSession } from '../../src/bridge/gameSession';
import { BALANCE } from '../../src/config/balance';
import { MemoryStore } from '../../src/save/SaveManager';
import { FakeClock } from '../../src/sim/clock';
import type { OfflineSummary } from '../../src/sim/types';
import { HOUR, MIN, START } from './sim/helpers';

const nothing: OfflineSummary = {
  awayMs: 2 * HOUR,
  simulatedMs: 2 * HOUR,
  visitorsWaiting: 0,
  babiesBorn: 0,
  grewUp: 0,
  readyToSell: 0,
};

describe('"While you were away" card (DESIGN 14)', () => {
  it('says how long, in friendly words', () => {
    expect(formatAway(30_000)).toBe('1 minute');
    expect(formatAway(7 * MIN)).toBe('7 minutes');
    expect(formatAway(HOUR)).toBe('1 hour');
    expect(formatAway(47 * HOUR)).toBe('47 hours');
    expect(formatAway(72 * HOUR)).toBe('3 days');
  });

  it('only shows after a real break', () => {
    const min = BALANCE.offline.summaryMinMinutes * MIN;
    expect(awayCard({ ...nothing, awayMs: min - 1 }, true)).toBeNull();
    expect(awayCard({ ...nothing, awayMs: min }, true)).not.toBeNull();
  });

  it('lists what happened, with the right words for one or many', () => {
    const card = awayCard(
      { ...nothing, visitorsWaiting: 1, babiesBorn: 3, grewUp: 2, readyToSell: 1 },
      true,
    )!;
    expect(card.away).toBe('2 hours');
    expect(card.lines.map((l) => l.text)).toEqual([
      '1 visitor is waiting at the gate',
      '3 babies were born',
      '2 babies grew up',
      '1 animal is ready to sell',
      'Nobody got hungry or sick while you were gone',
    ]);
  });

  it('is always good news, even when nothing happened or time was paused', () => {
    expect(awayCard(nothing, true)!.lines.map((l) => l.icon)).toEqual(['💤', '💚']);
    expect(awayCard(nothing, false)!.lines[0]).toEqual({
      icon: '⏸️',
      text: 'Everything waited for you',
    });
  });
});

describe('the session shows the card', () => {
  async function played() {
    const store = new MemoryStore();
    const first = await GameSession.start({
      store,
      source: new FakeClock(START),
      newSeed: () => 7,
    });
    await first.save();
    return store;
  }

  it('after loading a save from hours ago, until it is closed', async () => {
    const store = await played();
    const session = await GameSession.start({ store, source: new FakeClock(START + 3 * HOUR) });
    expect(session.away?.away).toBe('3 hours');
    expect(session.away?.lines[0]?.icon).toBe('🐾');
    let closed = false;
    session.events.on('awayChanged', ({ card }) => (closed = card === null));
    session.dismissAway();
    expect(session.away).toBeNull();
    expect(closed).toBe(true);
  });

  it('after coming back to a hidden page, but not after a quick peek away', async () => {
    const store = await played();
    const source = new FakeClock(START);
    const session = await GameSession.start({ store, source });
    expect(session.away).toBeNull();
    await session.hidden();
    source.advance(MIN);
    session.visible();
    expect(session.away).toBeNull();
    await session.hidden();
    source.advance(20 * MIN);
    session.visible();
    expect(session.away?.away).toBe('20 minutes');
  });

  it('never during the first-time tutorial', async () => {
    const store = new MemoryStore();
    const source = new FakeClock(START);
    const session = await GameSession.start({
      store,
      source,
      create: {
        profile: { ...DEFAULT_PROFILE, id: 'kid', tutorial: 'reveal' },
        houseColor: '#f6c65b',
      },
    });
    await session.hidden();
    source.advance(HOUR);
    session.visible();
    expect(session.away).toBeNull();
  });
});
