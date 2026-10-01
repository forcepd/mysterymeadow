import { describe, expect, it, vi } from 'vitest';
import { avatarSvg } from '../../src/art/avatarSvg';
import { DEFAULT_PROFILE, GameSession } from '../../src/bridge/gameSession';
import { AVATAR_CATEGORIES, getAvatarItem, itemsForSlot } from '../../src/config/avatarItems';
import { BIRTHDAY } from '../../src/config/birthday';
import {
  DEFAULT_LOADOUT,
  equip,
  isStarter,
  isValidLoadout,
  owns,
  shownLoadout,
  starterItems,
  wornIn,
} from '../../src/profile/avatar';
import { migrate } from '../../src/save/migrations';
import { MemoryStore } from '../../src/save/SaveManager';
import { CURRENT_SCHEMA_VERSION, toSaveFile, toSimState } from '../../src/save/schema';
import { FakeClock } from '../../src/sim/clock';
import { GameSim } from '../../src/sim/GameSim';
import { isBirthday } from '../../src/sim/systems/birthday';
import { dayKey } from '../../src/sim/systems/tricks';
import { DAY, HOUR, SEC } from './sim/helpers';

/** Local times, so the tests hold in any time zone. */
const at = (month: number, day: number, hour = 12, year = 2026) =>
  new Date(year, month - 1, day, hour).getTime();
const BDAY = at(BIRTHDAY.month, BIRTHDAY.day);
const HAT = BIRTHDAY.hatItemId;

function simAt(now: number) {
  const clock = new FakeClock(now);
  return { sim: GameSim.newGame({ clock, seed: 1 }), clock };
}

describe('birthday config', () => {
  it('is Grace’s birthday on October 1, with a real hat', () => {
    expect(BIRTHDAY).toMatchObject({ name: 'Grace', month: 10, day: 1 });
    expect(getAvatarItem(HAT)).toMatchObject({ slot: 'hat', special: true });
  });
});

describe('isBirthday', () => {
  it('is true all day on October 1 (local time), and not the days around it', () => {
    expect(isBirthday(at(10, 1, 0))).toBe(true);
    expect(isBirthday(BDAY)).toBe(true);
    expect(isBirthday(at(10, 1, 23) + 59 * 60_000)).toBe(true);
    expect(isBirthday(at(9, 30, 23))).toBe(false);
    expect(isBirthday(at(10, 2, 0))).toBe(false);
    expect(isBirthday(at(1, 10))).toBe(false); // January 10, not October 1
    expect(isBirthday(at(10, 1, 12, 2030))).toBe(true); // every year
  });
});

describe('birthday card (sim)', () => {
  it('waits on the birthday, even for a brand new game, and shows once', () => {
    const { sim } = simAt(BDAY);
    expect(sim.birthdayToday()).toBe(true);
    expect(sim.birthdayGreetingReady()).toBe(true);
    const greeted = vi.fn();
    sim.events.on('birthdayGreeted', greeted);
    expect(sim.seeBirthdayGreeting()).toBe(true);
    expect(greeted).toHaveBeenCalledOnce();
    expect(sim.state.world.birthday.lastGreetedDay).toBe(dayKey(BDAY));
    expect(sim.birthdayGreetingReady()).toBe(false);
    expect(sim.seeBirthdayGreeting()).toBe(false);
    expect(greeted).toHaveBeenCalledOnce();
  });

  it('stays seen for the rest of the day, even after a reload', () => {
    const { sim, clock } = simAt(BDAY);
    sim.seeBirthdayGreeting();
    clock.advance(6 * HOUR);
    const again = GameSim.fromState(structuredClone(sim.toState()), clock);
    expect(again.birthdayToday()).toBe(true);
    expect(again.birthdayGreetingReady()).toBe(false);
  });

  it('never waits on other days', () => {
    const { sim, clock } = simAt(at(9, 30));
    expect(sim.birthdayGreetingReady()).toBe(false);
    expect(sim.seeBirthdayGreeting()).toBe(false);
    expect(sim.state.world.birthday.lastGreetedDay).toBe('');
    clock.advance(DAY);
    sim.catchUp();
    expect(sim.birthdayGreetingReady()).toBe(true); // Oct 1 came while playing
    clock.advance(DAY);
    sim.catchUp();
    expect(sim.birthdayGreetingReady()).toBe(false);
  });

  it('comes back next year', () => {
    const { sim, clock } = simAt(BDAY);
    sim.seeBirthdayGreeting();
    clock.set(at(10, 1, 9, 2027));
    sim.catchUp();
    expect(sim.birthdayGreetingReady()).toBe(true);
  });
});

describe('birthday hat', () => {
  it('is never sold, offered, or owned', () => {
    for (const c of AVATAR_CATEGORIES)
      for (const slot of c.slots) expect(itemsForSlot(slot).map((a) => a.id)).not.toContain(HAT);
    expect(starterItems('hat').map((a) => a.id)).not.toContain(HAT);
    expect(isStarter(HAT)).toBe(false);
    expect(owns([], HAT)).toBe(false);
    // So it can't be saved into an outfit.
    expect(isValidLoadout(equip(DEFAULT_LOADOUT, HAT), [])).toBe(false);
  });

  it('is worn on the birthday in place of any other hat, without changing the outfit', () => {
    const outfit = equip(DEFAULT_LOADOUT, 'hat_crown');
    const before = structuredClone(outfit);
    const shown = shownLoadout(outfit, true);
    expect(wornIn(shown, 'hat')).toBe(HAT);
    expect(shown.accessories.filter((id) => getAvatarItem(id)?.slot === 'hat')).toEqual([HAT]);
    expect(outfit).toEqual(before);
    expect(shownLoadout(outfit, false)).toBe(outfit);
  });

  it('is drawn in the original’s pictures', () => {
    const plain = avatarSvg(DEFAULT_LOADOUT);
    const party = avatarSvg(shownLoadout(DEFAULT_LOADOUT, true));
    expect(party).not.toBe(plain);
    expect(party).toContain(getAvatarItem(HAT)!.color);
  });
});

describe('birthday in a game session', () => {
  const start = (source: FakeClock) =>
    GameSession.start({ store: new MemoryStore(), source, newSeed: () => 7 });

  it('shows the hat on the birthday only, and keeps the saved outfit as it was', async () => {
    const session = await start(new FakeClock(BDAY));
    expect(wornIn(session.shownAvatar, 'hat')).toBe(HAT);
    expect(session.shownAvatar).toBe(session.shownAvatar); // same object until something changes
    expect(session.profile.avatar).toEqual(DEFAULT_PROFILE.avatar);
    expect(session.toSaveFile().profile.avatar.accessories).not.toContain(HAT);

    const other = await start(new FakeClock(at(10, 2)));
    expect(other.shownAvatar).toEqual(other.profile.avatar);
  });

  it('puts the hat on at midnight, and takes it off the next midnight', async () => {
    const source = new FakeClock(at(9, 30, 23) + 59 * 60_000);
    const session = await start(source);
    const changed = vi.fn();
    session.events.on('profileChanged', changed);
    expect(wornIn(session.shownAvatar, 'hat')).toBeUndefined();
    source.advance(61 * SEC);
    session.frame();
    expect(changed).toHaveBeenCalledOnce();
    expect(wornIn(session.shownAvatar, 'hat')).toBe(HAT);
    source.advance(DAY);
    session.frame();
    expect(changed).toHaveBeenCalledTimes(2);
    expect(wornIn(session.shownAvatar, 'hat')).toBeUndefined();
  });

  it('wearing a new outfit on the birthday keeps the hat on top', async () => {
    const session = await start(new FakeClock(BDAY));
    expect(session.wear(equip(DEFAULT_LOADOUT, 'hat_cap')).ok).toBe(true);
    expect(wornIn(session.profile.avatar, 'hat')).toBe('hat_cap');
    expect(wornIn(session.shownAvatar, 'hat')).toBe(HAT);
  });

  it('saves right away once the card is seen', async () => {
    const store = new MemoryStore();
    const source = new FakeClock(BDAY);
    const session = await GameSession.start({ store, source, newSeed: () => 7 });
    session.sim.seeBirthdayGreeting();
    await session.save();
    const later = await GameSession.start({ store, source });
    expect(later.sim.birthdayGreetingReady()).toBe(false);
  });
});

describe('migration v7 -> v8 (birthday)', () => {
  it('an existing game has never seen the card, and gets it on the birthday', () => {
    const save = toSaveFile(DEFAULT_PROFILE, simAt(BDAY).sim.toState());
    const world = { ...save.world } as Partial<typeof save.world>;
    delete world.birthday;
    const out = migrate({ ...save, schemaVersion: 7, world });
    expect(out.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(out.world.birthday).toEqual({ lastGreetedDay: '' });
    const sim = GameSim.fromState(toSimState(out), new FakeClock(BDAY));
    expect(sim.birthdayGreetingReady()).toBe(true);
  });
});
