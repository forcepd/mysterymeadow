import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../src/sim/clock';
import { DEFAULT_PROFILE } from '../../src/bridge/gameSession';
import { isValidLoadout } from '../../src/profile/avatar';
import { GameSim } from '../../src/sim/GameSim';
import { MemoryStore, SaveManager } from '../../src/save/SaveManager';
import { MIGRATIONS, SaveError, migrate, type Migration } from '../../src/save/migrations';
import {
  CURRENT_SCHEMA_VERSION,
  toSaveFile,
  toSimState,
  type SaveFile,
} from '../../src/save/schema';
import { HOUR, MIN, SEC, START, makeAnimal, newSim, play } from './sim/helpers';

const profile = { ...DEFAULT_PROFILE, id: 'p1', username: 'Sunny_Fox' };

/** A bot that taps visitors and sells whatever it can. Exercises the RNG. */
function botStep(sim: GameSim): void {
  for (const v of [...sim.state.world.gateQueue]) if (!v.revealed) sim.revealVisitor(v.id);
  for (const a of [...sim.state.world.animals]) if (sim.canSell(a.id).ok) sim.sell(a.id);
}

function playWithBot(sim: GameSim, clock: FakeClock, ms: number): void {
  const end = clock.now() + ms;
  while (clock.now() < end) {
    clock.advance(SEC);
    sim.update();
    botStep(sim);
  }
}

describe('save round-trip', () => {
  it('saves, loads, and continues exactly like an uninterrupted game', async () => {
    const a = newSim(42);
    const b = newSim(42);
    playWithBot(a.sim, a.clock, 90 * MIN);
    playWithBot(b.sim, b.clock, 90 * MIN);

    const manager = new SaveManager(new MemoryStore());
    await manager.save(toSaveFile(profile, b.sim.toState()));
    const loaded = await manager.load(profile.id);
    expect(loaded).toBeDefined();
    expect(loaded!.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(loaded!.profile).toEqual(profile);
    const resumed = GameSim.fromState(toSimState(loaded!), b.clock);

    playWithBot(a.sim, a.clock, 90 * MIN);
    playWithBot(resumed, b.clock, 90 * MIN);
    expect(resumed.toState()).toEqual(a.sim.toState());
    expect(a.sim.state.world.coins).toBeGreaterThan(100);
  });

  it('survives JSON export/import unchanged', () => {
    const h = newSim(3);
    play(h, 45 * MIN);
    const file = toSaveFile(profile, h.sim.toState());
    const text = JSON.stringify(file);
    expect(migrate(JSON.parse(text))).toEqual(file);
  });

  it('catches up offline time after loading', async () => {
    const h = newSim(5);
    play(h, 5 * MIN);
    const manager = new SaveManager(new MemoryStore());
    await manager.save(toSaveFile(profile, h.sim.toState()));

    const later = new FakeClock(h.clock.now() + 2 * HOUR);
    const sim = GameSim.fromState(toSimState((await manager.load(profile.id))!), later);
    const summary = sim.catchUp();
    expect(summary.awayMs).toBe(2 * HOUR);
    expect(sim.state.world.gateQueue.length).toBeGreaterThan(0);
  });

  it('keeps profiles separate and lists them', async () => {
    const manager = new SaveManager(new MemoryStore());
    const h = newSim();
    await manager.save(toSaveFile({ ...profile, id: 'a', username: 'A' }, h.sim.toState()));
    await manager.save(toSaveFile({ ...profile, id: 'b', username: 'B' }, h.sim.toState()));
    expect((await manager.listProfileIds()).sort()).toEqual(['a', 'b']);
    await manager.delete('a');
    expect(await manager.listProfileIds()).toEqual(['b']);
    expect(await manager.load('a')).toBeUndefined();
  });

  it('does not share state between the sim and the save', () => {
    const h = newSim();
    const state = h.sim.toState();
    state.world.coins = 99999;
    expect(h.sim.state.world.coins).not.toBe(99999);
    const resumed = GameSim.fromState(state, h.clock);
    state.world.coins = 1;
    expect(resumed.state.world.coins).toBe(99999);
  });
});

describe('migrations', () => {
  function currentSave(): SaveFile {
    return toSaveFile(profile, newSim().sim.toState());
  }

  it('passes a current save through', () => {
    const save = currentSave();
    expect(migrate(structuredClone(save))).toEqual(save);
  });

  it('runs each migration in order from the save version up', () => {
    const save = currentSave() as unknown as Record<string, unknown>;
    const v1 = { ...save, schemaVersion: 1, legacy: true };
    const migrations: Record<number, Migration> = {
      1: (s) => ({ ...s, schemaVersion: 2, steps: ['1to2'] }),
      2: (s) => ({ ...s, schemaVersion: 3, steps: [...(s.steps as string[]), '2to3'] }),
    };
    const out = migrate(v1, migrations, 3) as unknown as Record<string, unknown>;
    expect(out.schemaVersion).toBe(3);
    expect(out.steps).toEqual(['1to2', '2to3']);
    expect(out.legacy).toBe(true);
  });

  it('refuses saves from a newer game version', () => {
    const save = { ...currentSave(), schemaVersion: CURRENT_SCHEMA_VERSION + 1 };
    expect(() => migrate(save)).toThrow(SaveError);
    try {
      migrate(save);
    } catch (e) {
      expect((e as SaveError).code).toBe('tooNew');
    }
  });

  it('refuses a missing migration step', () => {
    expect(() => migrate({ ...currentSave(), schemaVersion: 1 }, {}, 2)).toThrow(
      /No migration from version 1/,
    );
  });

  it('refuses a migration that forgets to bump the version', () => {
    expect(() => migrate({ ...currentSave(), schemaVersion: 1 }, { 1: (s) => s }, 2)).toThrow(
      SaveError,
    );
  });

  it.each([
    ['null', null],
    ['a string', 'hello'],
    ['an array', []],
    ['no version', { world: {} }],
    ['version 0', { schemaVersion: 0 }],
    ['a fractional version', { schemaVersion: 1.5 }],
    ['missing world', { schemaVersion: 1, profile: { id: 'x' }, meta: {} }],
  ])('refuses garbage: %s', (_label, raw) => {
    expect(() => migrate(raw)).toThrow(SaveError);
  });

  it('refuses a save with a broken RNG state', () => {
    const save = currentSave();
    (save.meta as { rngState: unknown }).rngState = [1, 2];
    expect(() => migrate(save)).toThrow(SaveError);
  });

  it('stamps the current schema version on new saves', () => {
    expect(currentSave().schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(currentSave().meta.createdAt).toBe(START);
  });
});

describe('migration v1 -> v2 (Phase 3)', () => {
  /** A real Phase 1/2 save shape: no nextPetAt, no bowl. */
  function v1Save() {
    const save = toSaveFile(profile, newSim().sim.toState()) as unknown as {
      schemaVersion: number;
      world: {
        animals: Record<string, unknown>[];
        petStorage: { animal: Record<string, unknown>; storedAt: number }[];
        placedItems: unknown[];
      };
      meta: { lastSeenAt: number };
    };
    save.schemaVersion = 1;
    save.world.placedItems = [];
    const state = newSim().sim.toState();
    const v1Animal = (id: string) => {
      const a: Record<string, unknown> = { ...makeAnimal(state, { id, nextPoopAt: 5 }) };
      delete a.nextPetAt;
      return a;
    };
    save.world.animals = [v1Animal('a1')];
    save.world.petStorage = [{ animal: v1Animal('a2'), storedAt: 1 }];
    return save;
  }

  it('adds a petting timer to every animal, out or stored', () => {
    const out = migrate(v1Save());
    expect(out.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(out.world.animals[0]!.nextPetAt).toBe(out.meta.lastSeenAt);
    expect(out.world.petStorage[0]!.animal.nextPetAt).toBe(out.meta.lastSeenAt);
    expect(out.world.animals[0]!.nextPoopAt).toBe(5);
  });

  it('gives a game with no bowl a full starting bowl, and leaves existing bowls alone', () => {
    const out = migrate(v1Save());
    expect(out.world.placedItems).toEqual([
      {
        id: 'start1',
        itemId: 'food_bowl',
        zone: 'yard',
        tile: { x: 1, y: 0 },
        rotation: 0,
        servings: 5,
      },
    ]);
    const withBowl = v1Save();
    withBowl.world.placedItems = [
      {
        id: 'b',
        itemId: 'food_bowl',
        zone: 'yard',
        tile: { x: 3, y: 1 },
        rotation: 0,
        servings: 2,
      },
    ];
    expect(migrate(withBowl).world.placedItems).toHaveLength(1);
  });

  it('a migrated v1 save loads and plays', () => {
    const save = migrate(v1Save());
    const sim = GameSim.fromState(toSimState(save), new FakeClock(save.meta.lastSeenAt));
    expect(sim.bowls()).toHaveLength(1);
    expect(sim.pet('a1').ok).toBe(true);
  });
});

describe('migration v2 -> v3 (Phase 4)', () => {
  /** A Phase 3 save with an animal out and one stored. */
  function v2Save() {
    const h = newSim();
    const save = toSaveFile(profile, h.sim.toState());
    const state = h.sim.toState();
    save.world.animals = [makeAnimal(state, { id: 'a1', needs: { hunger: 30, happiness: 70 } })];
    save.world.petStorage = [{ animal: makeAnimal(state, { id: 'a2' }), storedAt: 1 }];
    return { ...save, schemaVersion: 2 };
  }

  it('only bumps the version: every animal and value is kept as it was', () => {
    const before = v2Save();
    const out = MIGRATIONS[2]!(structuredClone(before));
    expect(out.schemaVersion).toBe(3);
    expect({ ...out, schemaVersion: 2 }).toEqual(before);
  });

  it('a migrated v2 save loads, and its animals can get sick and visit the vet', () => {
    const save = migrate(v2Save());
    const clock = new FakeClock(save.meta.lastSeenAt);
    const sim = GameSim.fromState(toSimState(save), clock);
    expect(sim.getAnimal('a1')!.sickness).toBeUndefined();
    const state = sim.toState();
    state.world.animals[0]!.sickness = { illnessId: 'sniffles', since: state.meta.lastSeenAt };
    const sick = GameSim.fromState(state, clock);
    expect(sick.goToVet('a1').ok).toBe(true);
    expect(sick.vetTreat('a1', 'medicine_drops')).toMatchObject({ ok: true, cured: true });
  });
});

describe('migration v3 -> v4 (Phase 6)', () => {
  /** A Phase 4/5 save: the house has no wallpaper or flooring yet. */
  function v3Save() {
    const save = toSaveFile(profile, newSim().sim.toState()) as unknown as {
      schemaVersion: number;
      world: { house: Record<string, unknown> };
    };
    delete save.world.house.wallpaperId;
    delete save.world.house.flooringId;
    save.world.house.exteriorColor = 'mint';
    return { ...save, schemaVersion: 3 };
  }

  it('gives the house the free starter wallpaper and flooring, keeping everything else', () => {
    const out = migrate(v3Save());
    expect(out.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(out.world.house).toMatchObject({
      wallpaperId: 'wallpaper_cream',
      flooringId: 'flooring_wood',
      exteriorColor: 'mint',
      tierId: 'cottage',
    });
  });

  it('a migrated v3 save loads and can decorate', () => {
    const save = migrate(v3Save());
    const sim = GameSim.fromState(toSimState(save), new FakeClock(save.meta.lastSeenAt));
    expect(sim.coziness()).toBe(0);
    expect(sim.buyItem('bed_basic').ok).toBe(true);
    expect(sim.placeItem('bed_basic', 'house', { x: 0, y: 0 }).ok).toBe(true);
    expect(sim.indoorSlots()).toEqual({ total: 1, used: 0 });
  });
});

describe('migration v4 -> v5 (Phase 8)', () => {
  /** A Phase 6/7 save: the profile is just an id and a username; no activity log. */
  function v4Save() {
    const save = toSaveFile(profile, newSim().sim.toState()) as unknown as Record<string, unknown>;
    delete save.activity;
    return { ...save, schemaVersion: 4, profile: { id: 'p1', username: 'Sunny_Fox' } };
  }

  it('gives the profile the starter avatar, empty outfits, a finished tutorial, and a log', () => {
    const out = migrate(v4Save());
    expect(out.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(out.profile).toEqual({ ...DEFAULT_PROFILE, id: 'p1', username: 'Sunny_Fox' });
    expect(out.activity).toEqual([]);
  });

  it('the default avatar in the migration is a valid starter outfit', () => {
    const out = migrate(v4Save());
    expect(isValidLoadout(out.profile.avatar, [])).toBe(true);
  });

  it('refuses a v5 save whose profile has no avatar', () => {
    const bad = {
      ...toSaveFile(profile, newSim().sim.toState()),
      profile: { id: 'x', username: 'X' },
    };
    expect(() => migrate(bad)).toThrow(SaveError);
  });
});

describe('migration v5 -> v6 (Phase 10)', () => {
  /** A Phase 8/9 save: settings have volumes but no mute switch. */
  function v5Save() {
    const save = toSaveFile(profile, newSim().sim.toState());
    const settings = { ...save.world.settings } as Partial<typeof save.world.settings>;
    delete settings.muted;
    return { ...save, schemaVersion: 5, world: { ...save.world, settings } };
  }

  it('adds the mute switch, off, and keeps the volumes', () => {
    const raw = v5Save();
    raw.world.settings.musicVolume = 0.3;
    const out = migrate(raw);
    expect(out.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(out.world.settings.muted).toBe(false);
    expect(out.world.settings.musicVolume).toBe(0.3);
  });

  it('a migrated v5 save loads and can change its sound settings', () => {
    const save = migrate(v5Save());
    const sim = GameSim.fromState(toSimState(save), new FakeClock(save.meta.lastSeenAt));
    expect(sim.updateSettings({ muted: true }).ok).toBe(true);
    expect(sim.state.world.settings.muted).toBe(true);
  });
});

describe('migration v6 -> v7 (early-game pass)', () => {
  /** A Phase 10 save: no quick start, goals, finds, or daily present yet. */
  function v6Save() {
    const save = toSaveFile(profile, newSim().sim.toState());
    const world = { ...save.world } as Partial<typeof save.world>;
    delete world.welcome;
    delete world.goals;
    delete world.finds;
    delete world.nextFindAt;
    delete world.dailyGift;
    return { ...save, schemaVersion: 6, world };
  }

  it('an existing game skips the quick start, starts goals fresh, and has a present waiting', () => {
    const raw = v6Save();
    const out = migrate(raw);
    expect(out.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(out.world.welcome).toEqual({ fastVisitorsLeft: 0, quickHoldsLeft: 0, surprises: [] });
    expect(out.world.goals).toEqual({ progress: {}, claimed: [] });
    expect(out.world.finds).toEqual([]);
    expect(out.world.nextFindAt).toBe(raw.meta.lastSeenAt + 2 * 60_000);
    expect(out.world.dailyGift).toEqual({ lastDay: '' });
  });

  it('a migrated v6 save loads, opens its present, and gets yard finds', () => {
    const save = migrate(v6Save());
    const clock = new FakeClock(save.meta.lastSeenAt);
    const sim = GameSim.fromState(toSimState(save), clock);
    expect(sim.dailyGiftReady()).toBe(true);
    expect(sim.openDailyGift().ok).toBe(true);
    clock.advance(3 * 60_000);
    sim.update();
    expect(sim.state.world.finds.length).toBe(1);
  });
});
