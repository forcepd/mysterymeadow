import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PROFILE, GameSession } from '../../src/bridge/gameSession';
import {
  AVATAR_CATEGORIES,
  AVATAR_ITEMS,
  AVATAR_SLOTS,
  REQUIRED_SLOTS,
  itemsForSlot,
} from '../../src/config/avatarItems';
import { BALANCE } from '../../src/config/balance';
import { addActivity } from '../../src/profile/activity';
import {
  DEFAULT_LOADOUT,
  equip,
  isValidLoadout,
  owns,
  unequip,
  wornIn,
  wornItems,
} from '../../src/profile/avatar';
import { checkPin, isValidPin, makePin, numberInWords } from '../../src/profile/pin';
import { checkUsername } from '../../src/profile/username';
import { backupFileName, makeBackup, readBackup } from '../../src/save/backup';
import { DEVICE_KEY, DeviceManager, sortedProfiles } from '../../src/save/device';
import { SaveError } from '../../src/save/migrations';
import { MemoryStore, SaveManager } from '../../src/save/SaveManager';
import { CURRENT_SCHEMA_VERSION, newProfile, toSaveFile } from '../../src/save/schema';
import { FakeClock } from '../../src/sim/clock';
import { debugSpawnVisitor } from '../../src/sim/debugCommands';
import { GameSim } from '../../src/sim/GameSim';
import { MIN, SEC, START, newSim, play } from './sim/helpers';

describe('avatar items (DESIGN 13.3)', () => {
  it('cover every slot, with unique ids, and every Boutique category', () => {
    expect(new Set(AVATAR_ITEMS.map((a) => a.id)).size).toBe(AVATAR_ITEMS.length);
    for (const slot of AVATAR_SLOTS) expect(itemsForSlot(slot).length, slot).toBeGreaterThan(0);
    const covered = AVATAR_CATEGORIES.flatMap((c) => c.slots);
    expect([...covered].sort()).toEqual([...AVATAR_SLOTS].sort());
  });

  it('has a small free starter set (about 3 per clothing category) and Boutique items at 10-80 gems', () => {
    for (const slot of ['eyes', 'brows', 'mouth', 'hairStyle', 'top', 'bottom', 'shoes'] as const) {
      const free = itemsForSlot(slot).filter((a) => a.cost === 0).length;
      expect(free, slot).toBeGreaterThanOrEqual(3);
      expect(free, slot).toBeLessThanOrEqual(4);
    }
    for (const a of AVATAR_ITEMS) {
      if (a.cost > 0) {
        expect(a.cost, a.id).toBeGreaterThanOrEqual(10);
        expect(a.cost, a.id).toBeLessThanOrEqual(80);
      }
    }
  });

  it('body shapes and skin tones are always free (a wide range of skin tones)', () => {
    for (const slot of ['bodyShape', 'skinTone'] as const) {
      for (const a of itemsForSlot(slot)) expect(a.cost, a.id).toBe(0);
    }
    expect(itemsForSlot('skinTone').length).toBeGreaterThanOrEqual(8);
    expect(itemsForSlot('bodyShape')).toHaveLength(3);
  });
});

describe('avatar loadouts', () => {
  it('the default outfit is valid and all starter items', () => {
    expect(isValidLoadout(DEFAULT_LOADOUT, [])).toBe(true);
    for (const slot of REQUIRED_SLOTS) expect(wornIn(DEFAULT_LOADOUT, slot)).toBeDefined();
  });

  it('equipping replaces the item in that slot', () => {
    const l = equip(DEFAULT_LOADOUT, 'hair_bob');
    expect(l.hairStyle).toBe('hair_bob');
    expect(DEFAULT_LOADOUT.hairStyle).toBe('hair_short'); // Not mutated.
    expect(equip(l, 'lips_rose').makeup).toEqual({ lips: 'lips_rose' });
  });

  it('a one-piece replaces the top and bottom, and back again', () => {
    const dress = equip(DEFAULT_LOADOUT, 'dress_sun');
    expect(dress.onePiece).toBe('dress_sun');
    expect(dress.top).toBeUndefined();
    expect(dress.bottom).toBeUndefined();
    const tee = equip(dress, 'top_tee_red');
    expect(tee.onePiece).toBeUndefined();
    expect(tee.top).toBe('top_tee_red');
  });

  it('one accessory per accessory slot', () => {
    let l = equip(DEFAULT_LOADOUT, 'hat_cap');
    l = equip(l, 'glasses_round');
    l = equip(l, 'hat_crown');
    expect([...l.accessories].sort()).toEqual(['glasses_round', 'hat_crown']);
    expect(wornIn(l, 'hat')).toBe('hat_crown');
    expect(unequip(l, 'hat').accessories).toEqual(['glasses_round']);
  });

  it('optional slots can be taken off; required ones stay', () => {
    expect(unequip(DEFAULT_LOADOUT, 'shoes').shoes).toBeUndefined();
    expect(unequip(DEFAULT_LOADOUT, 'hairStyle')).toEqual(DEFAULT_LOADOUT);
    const madeUp = equip(DEFAULT_LOADOUT, 'blush_pink');
    expect(unequip(madeUp, 'blush').makeup).toEqual({});
  });

  it('is invalid with Boutique items not owned, unknown items, or a missing required slot', () => {
    const fancy = equip(DEFAULT_LOADOUT, 'hat_crown');
    expect(isValidLoadout(fancy, [])).toBe(false);
    expect(isValidLoadout(fancy, ['hat_crown'])).toBe(true);
    expect(isValidLoadout({ ...DEFAULT_LOADOUT, eyes: 'nope' }, [])).toBe(false);
    expect(isValidLoadout({ ...DEFAULT_LOADOUT, eyes: 'hair_bob' }, [])).toBe(false);
    expect(owns([], 'hair_bob')).toBe(true);
    expect(owns([], 'hair_buns')).toBe(false);
    expect(wornItems(DEFAULT_LOADOUT)).toContain('shoes_sneakers');
  });
});

describe('usernames (DESIGN 5)', () => {
  it.each([
    ['Sunny_Fox', true],
    ['abc', true],
    ['ab', false],
    ['a'.repeat(17), false],
    ['has space', false],
    ['émile', false],
    ['StupidCat', true], // "Stupid" is only blocked as a whole word...
    ['Stupid_Cat', false], // ...and underscores count as spaces.
    ['sh1tty', false],
  ])('%s -> %s', (name, ok) => {
    expect(checkUsername(name).ok).toBe(ok);
  });

  it('trims, and refuses a name already used on this device (any case)', () => {
    expect(checkUsername('  Pip  ')).toEqual({ ok: true, name: 'Pip' });
    expect(checkUsername('pip', ['PIP'])).toEqual({
      ok: false,
      reason: 'Someone here already uses that name!',
    });
  });
});

describe('Parent PIN (DESIGN 20)', () => {
  it('only 4 digits', () => {
    expect(isValidPin('1234')).toBe(true);
    for (const bad of ['123', '12345', '12a4', '']) expect(isValidPin(bad)).toBe(false);
  });

  it('is stored hashed, and checks', () => {
    const rec = makePin('2468', 'salty');
    expect(JSON.stringify(rec)).not.toContain('2468');
    expect(checkPin(rec, '2468')).toBe(true);
    expect(checkPin(rec, '2469')).toBe(false);
    expect(checkPin(undefined, '2468')).toBe(false);
    expect(makePin('2468', 'other').hash).not.toBe(rec.hash);
  });

  it.each([
    [6, 'six'],
    [47, 'forty-seven'],
    [100, 'one hundred'],
    [115, 'one hundred and fifteen'],
    [47_006, 'forty-seven thousand and six'],
    [300_450, 'three hundred thousand four hundred and fifty'],
    [999_999, 'nine hundred and ninety-nine thousand nine hundred and ninety-nine'],
  ])('writes %i as "%s" (the forgot-PIN grown-up check)', (n, words) => {
    expect(numberInWords(n)).toBe(words);
  });
});

describe('activity log', () => {
  it('keeps the newest entries, newest first', () => {
    let log: ReturnType<typeof addActivity> = [];
    for (let i = 0; i < 60; i++) log = addActivity(log, { at: i, icon: '🪙', text: `e${i}` });
    expect(log).toHaveLength(BALANCE.profiles.activityLogSize);
    expect(log[0]!.text).toBe('e59');
  });
});

describe('device record', () => {
  it('adopts saves from before profiles existed, then keeps its own record', async () => {
    const store = new MemoryStore();
    const saves = new SaveManager(store);
    await saves.save(toSaveFile(DEFAULT_PROFILE, newSim().sim.toState()));
    const device = new DeviceManager(store, saves);
    const record = await device.load();
    expect(record.profiles.map((p) => [p.id, p.username])).toEqual([['default', 'Player']]);
    expect(record.pin).toBeUndefined();
    expect(await store.get(DEVICE_KEY)).toEqual(record);
  });

  it('lists the most recently played first', () => {
    const p = (id: string, lastPlayedAt: number) => ({
      id,
      username: id,
      avatar: DEFAULT_LOADOUT,
      lastPlayedAt,
    });
    expect(
      sortedProfiles({ version: 1, profiles: [p('a', 1), p('b', 3), p('c', 2)] }).map((x) => x.id),
    ).toEqual(['b', 'c', 'a']);
  });
});

describe('backups', () => {
  it('round-trips, and names the file by date', () => {
    const file = toSaveFile(DEFAULT_PROFILE, newSim().sim.toState());
    const text = JSON.stringify(makeBackup([file], START));
    expect(readBackup(text)).toEqual([file]);
    expect(text).not.toContain('pin');
    expect(backupFileName(Date.UTC(2026, 8, 7, 12))).toBe('mystery-meadow-backup-2026-09-07.json');
  });

  it('upgrades old saves inside a backup', () => {
    const old = { ...toSaveFile(DEFAULT_PROFILE, newSim().sim.toState()), schemaVersion: 4 };
    const [out] = readBackup(JSON.stringify(makeBackup([old], START)));
    expect(out!.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it.each([
    ['not JSON', 'hello'],
    ['another file', JSON.stringify({ hi: 1 })],
    ['empty', JSON.stringify(makeBackup([], START))],
    ['a broken save', JSON.stringify(makeBackup([{ schemaVersion: 5 } as never], START))],
  ])('rejects %s', (_label, text) => {
    expect(() => readBackup(text)).toThrow(SaveError);
  });
});

describe('gems (DESIGN 4, 20)', () => {
  it('spends only what you have', () => {
    const { sim } = newSim();
    expect(sim.spendGems(20)).toEqual({ ok: true });
    expect(sim.state.world.gems).toBe(BALANCE.startingGems - 20);
    expect(sim.spendGems(1000)).toEqual({ ok: false, reason: 'Not enough gems!' });
    expect(sim.spendGems(0).ok).toBe(false);
  });

  it('a grown-up can grant 1-500 at a time', () => {
    const { sim } = newSim();
    const granted = vi.fn();
    sim.events.on('gemsGranted', granted);
    expect(sim.grantGems(50)).toEqual({ ok: true });
    expect(sim.state.world.gems).toBe(BALANCE.startingGems + 50);
    expect(sim.grantGems(501).ok).toBe(false);
    expect(sim.grantGems(0).ok).toBe(false);
    expect(sim.grantGems(2.5).ok).toBe(false);
    expect(granted).toHaveBeenCalledOnce();
  });
});

describe('Parent Mode settings', () => {
  it('changes settings and says so', () => {
    const { sim } = newSim();
    const changed = vi.fn();
    sim.events.on('settingsChanged', changed);
    sim.updateSettings({ sicknessEnabled: false, dailyTrickGemCap: 20 });
    expect(sim.state.world.settings).toMatchObject({
      sicknessEnabled: false,
      dailyTrickGemCap: 20,
    });
    expect(changed).toHaveBeenCalledOnce();
  });
});

describe('new player and tutorial (DESIGN 5)', () => {
  it('a tutorial game: the house color picked, the first visitor right away, an empty bowl', () => {
    const clock = new FakeClock(START);
    const sim = GameSim.newGame({ clock, seed: 1, houseColor: 'mint', tutorial: true });
    expect(sim.state.world.house.exteriorColor).toBe('mint');
    expect(sim.bowls()[0]!.servings).toBe(0);
    const h = { sim, clock };
    play(h, SEC);
    expect(sim.state.world.gateQueue).toHaveLength(1);
  });

  it('an unknown house color falls back to the default', () => {
    const sim = GameSim.newGame({ clock: new FakeClock(START), seed: 1, houseColor: 'plaid' });
    expect(sim.state.world.house.exteriorColor).toBe('butter');
  });

  it('the nudge makes the first visitor hungry and poop soon (never later)', () => {
    const h = newSim();
    debugSpawnVisitor(h.sim, { speciesId: 'bunny', pregnant: false });
    h.sim.revealVisitor(h.sim.state.world.gateQueue[0]!.id);
    const id = h.sim.state.world.animals[0]!.id;
    expect(h.sim.tutorialNudge(id)).toEqual({ ok: true });
    const a = h.sim.getAnimal(id)!;
    expect(a.needs.hunger).toBe(BALANCE.tutorial.visitorHunger);
    expect(a.nextPoopAt).toBe(h.sim.now() + BALANCE.tutorial.firstPoopSeconds * SEC);
    play(h, BALANCE.tutorial.firstPoopSeconds * SEC);
    expect(h.sim.state.world.poops).toHaveLength(1);
    expect(h.sim.tutorialNudge('nope').ok).toBe(false);
  });
});

describe('GameSession profile', () => {
  async function start(store = new MemoryStore()) {
    const profile = newProfile('kid1', 'Sunny_Fox', DEFAULT_LOADOUT);
    const session = await GameSession.start({
      store,
      source: new FakeClock(START),
      newSeed: () => 3,
      create: { profile, houseColor: 'rose' },
    });
    return { session, store };
  }

  it('creates a new player: tutorial on, house color, saved right away', async () => {
    const { session, store } = await start();
    expect(session.profile.tutorial).toBe('reveal');
    expect(session.sim.state.world.house.exteriorColor).toBe('rose');
    const saved = await new SaveManager(store).load('kid1');
    expect(saved!.profile.username).toBe('Sunny_Fox');
  });

  it('buys Boutique items with gems; starters and owned items can’t be bought', async () => {
    const { session } = await start();
    const gems = session.sim.state.world.gems;
    expect(session.buyAvatarItem('hair_buns')).toEqual({ ok: true });
    expect(session.sim.state.world.gems).toBe(gems - 30);
    expect(session.profile.ownedAvatarItems).toEqual(['hair_buns']);
    expect(session.buyAvatarItem('hair_buns').ok).toBe(false);
    expect(session.buyAvatarItem('hair_bob')).toEqual({
      ok: false,
      reason: 'You already have it!',
    });
    expect(session.buyAvatarItem('dress_star')).toEqual({ ok: false, reason: 'Not enough gems!' });
    expect(session.activity[0]!.text).toBe('Bought Space buns for 30 gems');
  });

  it('wears only owned outfits, and saves 3 favorites', async () => {
    const { session } = await start();
    const crown = equip(DEFAULT_LOADOUT, 'hat_crown');
    expect(session.wear(crown).ok).toBe(false);
    const bob = equip(DEFAULT_LOADOUT, 'hair_bob');
    expect(session.wear(bob)).toEqual({ ok: true });
    expect(session.saveOutfit(2)).toEqual({ ok: true });
    session.wear(DEFAULT_LOADOUT);
    expect(session.wearOutfit(2)).toEqual({ ok: true });
    expect(session.profile.avatar.hairStyle).toBe('hair_bob');
    expect(session.wearOutfit(0).ok).toBe(false);
    expect(session.saveOutfit(3).ok).toBe(false);
  });

  it('remembers the tutorial step, and the whole profile survives a reload', async () => {
    const { session, store } = await start();
    session.setTutorial('poop');
    session.buyAvatarItem('hat_cap'); // A starter: refused, nothing changes.
    await session.stop();
    const again = await GameSession.start({
      store,
      source: new FakeClock(START + MIN),
      profileId: 'kid1',
    });
    expect(again.profile.tutorial).toBe('poop');
    expect(again.isNewGame).toBe(false);
  });

  it('logs activity for Parent Mode, and saves it', async () => {
    const { session, store } = await start();
    session.sim.grantGems(10);
    await session.save();
    const saved = await new SaveManager(store).load('kid1');
    expect(saved!.activity[0]).toMatchObject({ icon: '🎁', text: 'A grown-up gave 10 gems' });
  });

  it('after stop, nothing more is saved', async () => {
    const { session, store } = await start();
    await session.stop();
    const set = vi.spyOn(store, 'set');
    session.sim.grantGems(10);
    await session.save();
    expect(set).not.toHaveBeenCalled();
  });
});
