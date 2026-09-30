import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PROFILE, GameSession } from '../../src/bridge/gameSession';
import { MemoryStore, type KeyValueStore } from '../../src/save/SaveManager';
import { saveKey, type SaveFile } from '../../src/save/schema';
import { FakeClock } from '../../src/sim/clock';
import { debugMakeSick, debugSetNeeds, debugSpawnVisitor } from '../../src/sim/debugCommands';
import { BALANCE } from '../../src/config/balance';
import { HOUR, MIN, SEC, START } from './sim/helpers';

async function start(store: KeyValueStore = new MemoryStore(), source = new FakeClock(START)) {
  const session = await GameSession.start({ store, source, newSeed: () => 7 });
  return { session, store, source };
}

async function saved(store: KeyValueStore): Promise<SaveFile> {
  return (await store.get(saveKey(DEFAULT_PROFILE.id))) as SaveFile;
}

function playFor(session: GameSession, source: FakeClock, ms: number) {
  const end = source.now() + ms;
  while (source.now() < end) {
    source.advance(SEC);
    session.frame();
  }
}

describe('GameSession', () => {
  it('starts a new game for the default profile and saves it right away', async () => {
    const { session, store } = await start();
    expect(session.isNewGame).toBe(true);
    expect(session.profile).toEqual(DEFAULT_PROFILE);
    expect((await saved(store)).world.coins).toBe(BALANCE.startingCoins);
    expect((await saved(store)).meta.rngSeed).toBe(7);
  });

  it('loads an existing save and catches up the time away', async () => {
    const first = await start();
    playFor(first.session, first.source, 5 * MIN);
    await first.session.save();

    const later = new FakeClock(first.source.now() + 2 * HOUR);
    const caughtUp = vi.fn();
    const { session } = await start(first.store, later);
    expect(session.isNewGame).toBe(false);
    session.sim.events.on('caughtUp', caughtUp);
    expect(session.sim.now()).toBe(later.now());
    expect(session.sim.state.world.gateQueue.length).toBeGreaterThan(0);
  });

  it('saves after a sale', async () => {
    const { session, source, store } = await start();
    debugSpawnVisitor(session.sim, { speciesId: 'bunny', pregnant: false });
    const id = session.sim.state.world.gateQueue[0]!.id;
    session.sim.revealVisitor(id);
    playFor(session, source, BALANCE.holdMinutes * MIN);
    const animal = session.sim.state.world.animals[0]!;
    const price = session.sim.salePrice(animal.id)!;
    expect(session.sim.sell(animal.id).ok).toBe(true);
    await session.save(); // wait for the queued save to finish
    expect((await saved(store)).world.coins).toBe(BALANCE.startingCoins + price);
  });

  it('saves right after a treat (a purchase) and a rename', async () => {
    const { session, store } = await start();
    debugSpawnVisitor(session.sim, { speciesId: 'bunny', pregnant: false });
    session.sim.revealVisitor(session.sim.state.world.gateQueue[0]!.id);
    const id = session.sim.state.world.animals[0]!.id;
    session.sim.rename(id, 'Pip');
    await session.save();
    expect((await saved(store)).world.animals[0]!.name).toBe('Pip');
    debugSetNeeds(session.sim, 10, 10);
    session.sim.feedTreat(id);
    await session.save();
    expect((await saved(store)).world.coins).toBe(BALANCE.startingCoins - BALANCE.treat.cost);
  });

  it('saves right after a vet visit fee and a treatment', async () => {
    const { session, store } = await start();
    debugSpawnVisitor(session.sim, { speciesId: 'bunny', pregnant: false });
    session.sim.revealVisitor(session.sim.state.world.gateQueue[0]!.id);
    const id = session.sim.state.world.animals[0]!.id;
    debugMakeSick(session.sim, { illnessId: 'sore_paw' });
    session.sim.goToVet(id);
    await session.save();
    const afterFee = await saved(store);
    expect(afterFee.world.coins).toBe(BALANCE.startingCoins - BALANCE.vet.visitFee);
    expect(afterFee.world.animals[0]!.sickness?.visit).toBe('paid');
    session.sim.vetTreat(id, 'bandage');
    await session.save();
    expect((await saved(store)).world.animals[0]!.sickness).toBeUndefined();
  });

  it('saves right after a pet goes into Storage', async () => {
    const { session, store } = await start();
    debugSpawnVisitor(session.sim, { speciesId: 'bunny', pregnant: false });
    session.sim.revealVisitor(session.sim.state.world.gateQueue[0]!.id);
    const id = session.sim.state.world.animals[0]!.id;
    await session.save();
    const set = vi.spyOn(store, 'set');
    session.sim.storePet(id); // Keeps it too: saves on petKept and petStored.
    await session.save(); // Waits for the queued saves.
    expect(set).toHaveBeenCalledTimes(3);
    const file = await saved(store);
    expect(file.world.animals).toHaveLength(0);
    expect(file.world.petStorage[0]!.animal.id).toBe(id);
  });

  it('saves right after a find is tapped, a present is opened, and a goal is collected', async () => {
    const { session, store, source } = await start();
    playFor(session, source, BALANCE.finds.firstAfterMinutes * MIN + SEC);
    source.advance(24 * HOUR);
    session.visible();
    await session.save();
    const set = vi.spyOn(store, 'set');
    const savesFor = async (run: () => void) => {
      const before = set.mock.calls.length;
      run();
      await session.save(); // Waits for the queued save, then saves once more.
      return set.mock.calls.length - before - 1;
    };
    expect(
      await savesFor(() => session.sim.collectFind(session.sim.state.world.finds[0]!.id)),
    ).toBe(1);
    expect(await savesFor(() => session.sim.openDailyGift())).toBe(1);
    debugSpawnVisitor(session.sim, { speciesId: 'bunny', pregnant: false });
    session.sim.revealVisitor(session.sim.state.world.gateQueue[0]!.id);
    session.sim.rename(session.sim.state.world.animals[0]!.id, 'Pip');
    await session.save(); // The rename's own save.
    expect(await savesFor(() => session.sim.claimGoal('name1'))).toBe(1);
    const file = await saved(store);
    expect(file.world.finds).toHaveLength(0);
    expect(file.world.dailyGift.lastDay).not.toBe('');
    expect(file.world.goals.claimed).toEqual(['name1']);
  });

  it('saves when hidden and treats hidden time as offline when visible again', async () => {
    const { session, source, store } = await start();
    await session.hidden();
    expect((await saved(store)).meta.lastSeenAt).toBe(START);
    const caughtUp = vi.fn();
    session.sim.events.on('caughtUp', caughtUp);
    source.advance(30 * MIN);
    session.visible();
    expect(caughtUp).toHaveBeenCalledOnce();
    expect(session.sim.state.world.gateQueue.every((v) => !v.revealed)).toBe(true);
  });

  it('autosave brings the sim up to date first', async () => {
    const { session, source, store } = await start();
    source.advance(10 * SEC);
    await session.autosave();
    expect((await saved(store)).meta.lastSeenAt).toBe(START + 10 * SEC);
  });

  it('reports save failures instead of throwing, and keeps going', async () => {
    const store = new MemoryStore();
    const { session } = await start(store);
    const failed = vi.fn();
    session.events.on('saveFailed', failed);
    vi.spyOn(store, 'set').mockRejectedValueOnce(new Error('quota'));
    await expect(session.save()).resolves.toBeUndefined();
    expect(failed).toHaveBeenCalledOnce();
    await session.save();
    expect(failed).toHaveBeenCalledOnce();
  });

  it('never runs game time backwards if the device clock was set back', async () => {
    const first = await start();
    playFor(first.session, first.source, MIN);
    await first.session.save();
    const earlier = new FakeClock(START - HOUR);
    const { session } = await start(first.store, earlier);
    expect(session.sim.now()).toBe(START + MIN);
    earlier.advance(5 * SEC);
    session.frame();
    expect(session.sim.now()).toBe(START + MIN + 5 * SEC);
  });

  it('stops saving once its save is deleted (dev "New game")', async () => {
    const { session, store } = await start();
    await session.deleteSave();
    await session.save();
    await session.hidden();
    expect(await store.get(saveKey(DEFAULT_PROFILE.id))).toBeUndefined();
  });

  it('bumps its version on every sim change for React', async () => {
    const { session, source } = await start();
    const listener = vi.fn();
    const off = session.subscribe(listener);
    const v = session.version;
    source.advance(SEC);
    session.frame();
    expect(session.version).toBe(v + 1);
    expect(listener).toHaveBeenCalledOnce();
    off();
  });
});
