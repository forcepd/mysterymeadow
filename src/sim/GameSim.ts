import { BALANCE } from '../config/balance';
import { DEFAULT_HOUSE_COLOR, HOUSE_COLORS } from '../config/houseColors';
import { DEFAULT_FLOORING, DEFAULT_WALLPAPER } from '../config/items';
import { STARTING_ITEMS } from '../config/yard';
import type { Clock } from './clock';
import { emptySummary, minutes, seconds, type SimContext } from './context';
import { Emitter } from './emitter';
import type { SimEvents } from './events';
import { Rng } from './rng';
import { isBaby, isReadyToSell } from './systems/animals';
import {
  animalCount,
  freeCapacity,
  getHouseTier,
  isCrowded,
  totalCapacity,
} from './systems/housing';
import { lureScore } from './systems/rarity';
import { feedTreat, isBowl, refillBowl } from './systems/feeding';
import { renameAnimal } from './systems/naming';
import { careMultiplier, cleanliness } from './systems/needs';
import { pet } from './systems/petting';
import { dexProgress, type DexProgress } from './systems/dex';
import {
  freeSlots,
  freeStorage,
  keep,
  keepBumping,
  petSlots,
  petsOut,
  retrievePet,
  storageSpaces,
  storePet,
  swapPets,
  unkeep,
} from './systems/keeping';
import {
  applySurface,
  buyItem,
  canPlace,
  gridSize,
  lureSlots,
  luresPlaced,
  moveItem,
  ownedCount,
  placeItem,
  rotateItem,
  storeItem,
  type Rotation,
  type Tile,
} from './systems/placement';
import { cleanPoop } from './systems/poop';
import { grantGems, spendGems } from './systems/gems';
import {
  buyPetSlot,
  buyRoomExpansion,
  buyStorageExpansion,
  changeHouseColor,
  realEstate,
  upgradeHouse,
  type RealEstate,
} from './systems/realEstate';
import { hasHelper } from './systems/helpers';
import { sickChance } from './systems/sickness';
import {
  canTrain,
  maxTricks,
  performTrick,
  trainBlocker,
  trainSession,
  trickGemsLeftToday,
  type TrainResult,
} from './systems/tricks';
import { dressPet, undressPet } from './systems/petOutfits';
import { getTrick } from '../config/tricks';
import type { OutfitSlot } from '../config/items';
import {
  coziness,
  indoorAnimals,
  indoorHappinessPerMinute,
  indoorSlots,
  moveAnimalToZone,
} from './systems/zones';
import {
  examine,
  goToVet,
  isWaitingAtClinic,
  treatmentCost,
  vetQuote,
  vetTreat,
  type ExamResult,
  type VetQuote,
  type VetTreatResult,
} from './systems/vet';
import { canSell, findAnimal, salePrice, sell } from './systems/selling';
import { revealVisitor } from './systems/visitors';
import { birthdayGreetingReady, isBirthday, seeBirthdayGreeting } from './systems/birthday';
import { dailyGiftReady, openDailyGift, type DailyGiftReward } from './systems/dailyGift';
import { collectFind } from './systems/finds';
import { claimGoal, readyGoalCount, trackGoals } from './systems/goals';
import { finishedWelcome, newWelcome } from './systems/welcome';
import { dayKey } from './systems/tricks';
import { runOffline, runOnline } from './tick';
import type {
  Animal,
  CommandResult,
  GameSettings,
  Ms,
  OfflineSummary,
  PlacedItem,
  SimState,
  Zone,
} from './types';

export type Badge = 'new' | 'pregnant' | 'baby' | 'sick' | 'readyToSell' | 'kept';

export interface NewGameOptions {
  clock: Clock;
  seed: number;
  /** Exterior color picked in onboarding (DESIGN 5 step 3). */
  houseColor?: string;
  /**
   * A new player (DESIGN 5 step 4): the first visitor arrives right away instead of after the
   * usual interval, and the starting bowl is empty so the tutorial can teach filling it.
   */
  tutorial?: boolean;
  /**
   * A new player's quick start (early-game pass): faster first visitors, sooner first sales,
   * guaranteed surprises. On by default; unit tests of other rules turn it off.
   */
  welcome?: boolean;
}

/**
 * The headless game (DESIGN 18.2). UI calls commands and reads state; it never mutates state.
 * Call `update()` often (e.g. every frame) and `catchUp()` when the app returns from being hidden
 * or right after loading a save.
 */
export class GameSim {
  readonly events = new Emitter<SimEvents>();
  private readonly ctx: SimContext;
  private crowded: boolean;

  private constructor(
    private readonly clock: Clock,
    state: SimState,
  ) {
    const rng = Rng.fromState(state.meta.rngState);
    this.ctx = {
      state,
      rng,
      offline: false,
      summary: emptySummary(),
      emit: (event, payload) => {
        // Starter goals count the player's actions (which only happen online anyway).
        trackGoals(this.ctx, event, payload);
        if (!this.ctx.offline) this.events.emit(event, payload);
      },
    };
    this.crowded = isCrowded(state.world);
  }

  static newGame({ clock, seed, houseColor, tutorial, welcome = true }: NewGameOptions): GameSim {
    const now = clock.now();
    const rng = new Rng(seed);
    const cottage = BALANCE.houseTiers[0];
    const state: SimState = {
      world: {
        coins: BALANCE.startingCoins,
        gems: BALANCE.startingGems,
        house: {
          tierId: cottage.id,
          exteriorColor:
            houseColor && HOUSE_COLORS.some((c) => c.id === houseColor)
              ? houseColor
              : DEFAULT_HOUSE_COLOR,
          roomExpansions: 0,
          petSlotsPurchased: 0,
          storageExpansions: 0,
          wallpaperId: DEFAULT_WALLPAPER,
          flooringId: DEFAULT_FLOORING,
        },
        placedItems: [],
        inventory: {},
        animals: [],
        petStorage: [],
        gateQueue: [],
        poops: [],
        nextVisitorAt: tutorial
          ? now
          : now +
            minutes(
              welcome
                ? Math.min(cottage.visitorMinutes, BALANCE.welcome.fastVisitorMinutes)
                : cottage.visitorMinutes,
            ),
        discoveredDex: [],
        settings: {
          offlineProgress: true,
          sicknessEnabled: true,
          dailyTrickGemCap: BALANCE.tricks.dailyGemCap,
          musicVolume: 1,
          sfxVolume: 1,
          muted: false,
          reducedMotion: false,
        },
        // The first visitor (right away, or after one short gap) is the first of the quick ones.
        welcome: welcome
          ? { ...newWelcome(), fastVisitorsLeft: BALANCE.welcome.fastVisitors - 1 }
          : finishedWelcome(),
        goals: { progress: {}, claimed: [] },
        finds: [],
        nextFindAt: now + minutes(BALANCE.finds.firstAfterMinutes),
        // The first present comes tomorrow: day one has the tutorial and goals already.
        dailyGift: { lastDay: dayKey(now) },
        // A brand new player on the birthday gets the card too.
        birthday: { lastGreetedDay: '' },
      },
      meta: {
        createdAt: now,
        lastSeenAt: now,
        rngSeed: seed,
        rngState: rng.getState(),
        nextId: 1,
        dailyTrickGems: { date: '', earned: 0 },
      },
    };
    state.world.placedItems = STARTING_ITEMS.map((item, i) => ({
      id: `start${i + 1}`,
      itemId: item.itemId,
      zone: item.zone,
      tile: { ...item.tile },
      rotation: 0,
      ...(item.itemId === 'food_bowl'
        ? { servings: tutorial ? 0 : BALANCE.needs.bowlServings }
        : {}),
    }));
    return new GameSim(clock, state);
  }

  /** Resumes from saved state. Call `catchUp()` next to cover the time since it was saved. */
  static fromState(state: SimState, clock: Clock): GameSim {
    return new GameSim(clock, clone(state));
  }

  /** A deep copy of the full state, safe to save. */
  toState(): SimState {
    this.syncRng();
    return clone(this.ctx.state);
  }

  /** Live state for rendering. Read-only: change it only through commands. */
  get state(): Readonly<SimState> {
    return this.ctx.state;
  }

  /** Sim time: the last processed tick. */
  now(): Ms {
    return this.ctx.state.meta.lastSeenAt;
  }

  // ---- Time -------------------------------------------------------------------------------

  /** Advances to the clock's time. A long gap is treated as offline time. */
  update(): void {
    const gap = this.clock.now() - this.now();
    if (gap > seconds(BALANCE.time.offlineGapSeconds)) {
      this.catchUp();
      return;
    }
    const before = this.now();
    runOnline(this.ctx, this.clock.now());
    this.afterChange(this.now() !== before);
  }

  /** Runs offline catch-up to the clock's time and emits `caughtUp`. */
  catchUp(): OfflineSummary {
    const summary = runOffline(this.ctx, this.clock.now());
    this.afterChange(summary.awayMs > 0);
    if (summary.awayMs > 0) this.events.emit('caughtUp', summary);
    return summary;
  }

  // ---- Commands ---------------------------------------------------------------------------

  revealVisitor(visitorId: string): CommandResult {
    return this.command(() => revealVisitor(this.ctx, visitorId, this.now()));
  }

  sell(animalId: string): CommandResult {
    return this.command(() => sell(this.ctx, animalId, this.now()));
  }

  /** Tap a food bowl: fills it back up for free. */
  refillBowl(bowlId: string): CommandResult {
    return this.command(() => refillBowl(this.ctx, bowlId));
  }

  feedTreat(animalId: string): CommandResult {
    return this.command(() => feedTreat(this.ctx, animalId));
  }

  cleanPoop(poopId: string): CommandResult {
    return this.command(() => cleanPoop(this.ctx, poopId));
  }

  /** Tap-and-hold petting. */
  pet(animalId: string): CommandResult {
    return this.command(() => pet(this.ctx, animalId, this.now()));
  }

  /** Names an animal (an empty name clears it). */
  rename(animalId: string, name: string): CommandResult {
    return this.command(() => renameAnimal(this.ctx, animalId, name));
  }

  /** "Go to Vet": checks in (pays the fee, or starts the Free Clinic wait). Free if already in. */
  goToVet(animalId: string): CommandResult {
    return this.command(() => goToVet(this.ctx, animalId, this.now()));
  }

  /** Uses an exam tool at the vet: returns the clues it reveals. */
  vetExamine(animalId: string, toolId: string): ExamResult {
    this.update();
    return examine(this.ctx.state.world, animalId, toolId);
  }

  /** Gives a treatment at the vet. `cured` is false for the wrong one (coins are still spent). */
  vetTreat(animalId: string, treatmentId: string): VetTreatResult {
    this.update();
    const result = vetTreat(this.ctx, animalId, treatmentId, this.now());
    this.afterChange(true);
    return result;
  }

  /** Collects a finished starter goal's reward. */
  claimGoal(goalId: string): CommandResult {
    return this.command(() => claimGoal(this.ctx, goalId));
  }

  /** Taps a coin, clover, or butterfly in the yard. */
  collectFind(findId: string): CommandResult {
    return this.command(() => collectFind(this.ctx, findId));
  }

  /** Opens today's present. */
  openDailyGift(): { ok: true; reward: DailyGiftReward } | { ok: false; reason: string } {
    this.update();
    const result = openDailyGift(this.ctx, this.now());
    this.afterChange(true);
    return result;
  }

  /** The birthday card was seen and closed. */
  seeBirthdayGreeting(): boolean {
    this.update();
    const seen = seeBirthdayGreeting(this.ctx, this.now());
    this.afterChange(seen);
    return seen;
  }

  /** Keep in a free Pet Slot. Refused when slots are full (the UI opens the Swap screen). */
  keep(animalId: string): CommandResult {
    return this.command(() => keep(this.ctx, animalId));
  }

  unkeep(animalId: string): CommandResult {
    return this.command(() => unkeep(this.ctx, animalId));
  }

  /** Into Pet Storage (keeping it too, if it wasn't kept yet). */
  storePet(animalId: string): CommandResult {
    return this.command(() => storePet(this.ctx, animalId, this.now()));
  }

  /** Out of Pet Storage into a free slot. */
  retrievePet(animalId: string): CommandResult {
    return this.command(() => retrievePet(this.ctx, animalId, this.now()));
  }

  /** A kept pet that's out and a stored pet trade places. */
  swapPets(outId: string, storedId: string): CommandResult {
    return this.command(() => swapPets(this.ctx, outId, storedId, this.now()));
  }

  /** Keep a new animal in `bumpId`'s slot; `bumpId` goes into Storage. */
  keepBumping(animalId: string, bumpId: string): CommandResult {
    return this.command(() => keepBumping(this.ctx, animalId, bumpId, this.now()));
  }

  /** Home Store: buy one into the inventory. */
  buyItem(itemId: string): CommandResult {
    return this.command(() => buyItem(this.ctx, itemId));
  }

  /** Decorate: place one from the inventory. On success, `placedId` is the new item. */
  placeItem(
    itemId: string,
    zone: Zone,
    tile: Tile,
    rotation: Rotation = 0,
  ): CommandResult & { placedId?: string } {
    this.update();
    const result = placeItem(this.ctx, itemId, zone, tile, rotation);
    this.afterChange(true);
    return result;
  }

  moveItem(placedId: string, tile: Tile): CommandResult {
    return this.command(() => moveItem(this.ctx, placedId, tile));
  }

  rotateItem(placedId: string): CommandResult {
    return this.command(() => rotateItem(this.ctx, placedId));
  }

  /** Decorate: back into the inventory. */
  storeItem(placedId: string): CommandResult {
    return this.command(() => storeItem(this.ctx, placedId));
  }

  /** Wallpaper or flooring. */
  applySurface(itemId: string): CommandResult {
    return this.command(() => applySurface(this.ctx, itemId));
  }

  /** Drag-to-door: in (needs a free pet bed) or out. */
  moveAnimalToZone(animalId: string, zone: Zone): CommandResult {
    return this.command(() => moveAnimalToZone(this.ctx, animalId, zone));
  }

  /** Real Estate: move up to the next house tier; optionally re-pick the color for free. */
  upgradeHouse(colorId?: string): CommandResult {
    return this.command(() => upgradeHouse(this.ctx, this.now(), colorId));
  }

  buyRoomExpansion(): CommandResult {
    return this.command(() => buyRoomExpansion(this.ctx, this.now()));
  }

  buyPetSlot(): CommandResult {
    return this.command(() => buyPetSlot(this.ctx));
  }

  buyStorageExpansion(): CommandResult {
    return this.command(() => buyStorageExpansion(this.ctx));
  }

  /** Repaint the house (costs coins; free as part of an upgrade). */
  changeHouseColor(colorId: string): CommandResult {
    return this.command(() => changeHouseColor(this.ctx, colorId));
  }

  /** Boutique purchases (DESIGN 4: gems buy avatar items). */
  spendGems(amount: number): CommandResult {
    return this.command(() => spendGems(this.ctx, amount));
  }

  /** Parent Mode (DESIGN 20). Check the Parent PIN before calling. */
  grantGems(amount: number): CommandResult {
    return this.command(() => grantGems(this.ctx, amount));
  }

  /** Parent Mode settings (offline progress, sickness, daily trick gem cap, reduced motion...). */
  updateSettings(changes: Partial<GameSettings>): CommandResult {
    return this.command(() => {
      Object.assign(this.ctx.state.world.settings, changes);
      this.ctx.emit('settingsChanged', { settings: this.ctx.state.world.settings });
      return { ok: true };
    });
  }

  /**
   * Tutorial (DESIGN 5 step 4): the first visitor is a little hungry (so filling the empty bowl
   * feeds it) and will poop soon (so there's one to clean). Only ever makes things sooner.
   */
  tutorialNudge(animalId: string): CommandResult {
    return this.command(() => {
      const animal = findAnimal(this.ctx.state.world, animalId);
      if (!animal) return { ok: false, reason: "Can't find that animal." };
      const { visitorHunger, firstPoopSeconds } = BALANCE.tutorial;
      animal.needs.hunger = Math.min(animal.needs.hunger, visitorHunger);
      animal.nextPoopAt = Math.min(animal.nextPoopAt, this.now() + seconds(firstPoopSeconds));
      return { ok: true };
    });
  }

  /** DESIGN 11: one Simon-says session (the UI plays the mini-game and reports the result). */
  trainSession(animalId: string, trickId: string, success: boolean): TrainResult {
    this.update();
    const result = trainSession(this.ctx, animalId, trickId, success, this.now());
    this.afterChange(true);
    return result;
  }

  /** A kept pet performs a known trick. */
  performTrick(animalId: string, trickId: string): CommandResult {
    return this.command(() => performTrick(this.ctx, animalId, trickId));
  }

  /** Puts an owned outfit on an animal (it replaces what's in that slot). */
  dressPet(animalId: string, itemId: string): CommandResult {
    return this.command(() => dressPet(this.ctx, animalId, itemId));
  }

  undressPet(animalId: string, slot: OutfitSlot): CommandResult {
    return this.command(() => undressPet(this.ctx, animalId, slot));
  }

  // ---- Queries ----------------------------------------------------------------------------

  getAnimal(id: string): Readonly<Animal> | undefined {
    return findAnimal(this.ctx.state.world, id);
  }

  capacity(): number {
    return totalCapacity(this.ctx.state.world);
  }

  /** Starter goals done but not collected. */
  readyGoalCount(): number {
    return readyGoalCount(this.ctx.state.world);
  }

  /** A daily present is waiting to be opened. */
  dailyGiftReady(): boolean {
    return dailyGiftReady(this.ctx.state.world, this.now());
  }

  /** Today is the birthday (the avatar wears the birthday hat). */
  birthdayToday(): boolean {
    return isBirthday(this.now());
  }

  /** The birthday card is waiting to be seen. */
  birthdayGreetingReady(): boolean {
    return birthdayGreetingReady(this.ctx.state.world, this.now());
  }

  animalCount(): number {
    return animalCount(this.ctx.state.world);
  }

  freeCapacity(): number {
    return freeCapacity(this.ctx.state.world);
  }

  isCrowded(): boolean {
    return isCrowded(this.ctx.state.world);
  }

  lureScore(): number {
    return lureScore(this.ctx.state.world);
  }

  houseTier() {
    return getHouseTier(this.ctx.state.world);
  }

  msUntilNextVisitor(): Ms {
    return Math.max(0, this.ctx.state.world.nextVisitorAt - this.now());
  }

  salePrice(animalId: string): number | undefined {
    const animal = findAnimal(this.ctx.state.world, animalId);
    return animal && salePrice(this.ctx.state.world, animal);
  }

  /** 0.8..1.3 from recent care (DESIGN 7.5). */
  careMultiplier(animalId: string): number | undefined {
    const animal = findAnimal(this.ctx.state.world, animalId);
    return animal && careMultiplier(this.ctx.state.world, animal);
  }

  /** Zone cleanliness 0..100. */
  cleanliness(zone: Zone): number {
    return cleanliness(this.ctx.state.world, zone);
  }

  /** What "Go to Vet" costs right now (or whether it's the Free Clinic). */
  vetQuote(): VetQuote {
    return vetQuote(this.ctx.state.world);
  }

  /** What the next treatment costs this animal (0 at the Free Clinic or when you're short). */
  treatmentCost(animalId: string): number | undefined {
    const animal = findAnimal(this.ctx.state.world, animalId);
    return animal && treatmentCost(this.ctx.state.world, animal);
  }

  /** Waiting for the Free Clinic vet. */
  isWaitingAtClinic(animalId: string): boolean {
    const animal = findAnimal(this.ctx.state.world, animalId);
    return animal !== undefined && isWaitingAtClinic(animal);
  }

  /** DESIGN 9.1 chance of getting sick this minute (for dev tools and tests). */
  sickChance(animalId: string): number | undefined {
    const animal = findAnimal(this.ctx.state.world, animalId);
    return animal && sickChance(this.ctx.state.world, animal);
  }

  /** Everything the Real Estate screen shows: tiers, next prices, what's maxed out. */
  realEstate(): RealEstate {
    return realEstate(this.ctx.state.world);
  }

  hasHelper(helper: 'scoopBot' | 'autoFeeder'): boolean {
    return hasHelper(this.ctx.state.world, helper);
  }

  /** Would this placement work? (Decorate mode's green/red preview.) */
  canPlace(itemId: string, zone: Zone, tile: Tile, rotation: Rotation = 0, movingId?: string) {
    return canPlace(this.ctx.state.world, itemId, zone, tile, rotation, movingId);
  }

  /** Tile grid of a zone (the house wall strip is one row). */
  gridSize(zone: Zone, wall = false) {
    return gridSize(this.ctx.state.world, zone, wall ? 'wall' : 'floor');
  }

  lureSlots(): { total: number; used: number } {
    const world = this.ctx.state.world;
    return { total: lureSlots(world), used: luresPlaced(world) };
  }

  /** Indoor slots (pet beds in the house) and animals inside. */
  indoorSlots(): { total: number; used: number } {
    const world = this.ctx.state.world;
    return { total: indoorSlots(world), used: indoorAnimals(world).length };
  }

  /** Room Coziness 0..100 (DESIGN 12.3). */
  coziness(): number {
    return coziness(this.ctx.state.world);
  }

  /** Happiness per minute an animal regains indoors (0 outside). */
  indoorHappinessPerMinute(animalId: string): number {
    const animal = findAnimal(this.ctx.state.world, animalId);
    return animal ? indoorHappinessPerMinute(this.ctx.state.world, animal) : 0;
  }

  /** Owned: unplaced plus placed (plus free starter wallpaper/flooring). */
  ownedCount(itemId: string): number {
    return ownedCount(this.ctx.state.world, itemId);
  }

  /** Pet Slots: total, in use (kept pets out), and free. */
  petSlots(): { total: number; used: number; free: number } {
    const world = this.ctx.state.world;
    return { total: petSlots(world), used: petsOut(world).length, free: freeSlots(world) };
  }

  petStorage(): { total: number; used: number; free: number } {
    const world = this.ctx.state.world;
    return { total: storageSpaces(world), used: world.petStorage.length, free: freeStorage(world) };
  }

  dex(): DexProgress {
    return dexProgress(this.ctx.state.world);
  }

  /** A pet in Storage (paused), by id. */
  getStoredPet(id: string): Readonly<Animal> | undefined {
    return this.ctx.state.world.petStorage.find((p) => p.animal.id === id)?.animal;
  }

  canTrain(animalId: string): CommandResult {
    const animal = this.getAnimal(animalId);
    if (!animal) return { ok: false, reason: "Can't find that animal." };
    return canTrain(animal);
  }

  /** Why this animal can't train this trick now, or null if it can. */
  trainBlocker(animalId: string, trickId: string): string | null {
    const animal = findAnimal(this.ctx.state.world, animalId);
    if (!animal) return "Can't find that animal.";
    return trainBlocker(animal, getTrick(trickId), this.now());
  }

  maxTricks(animalId: string): number {
    const animal = findAnimal(this.ctx.state.world, animalId);
    return animal ? maxTricks(animal) : 0;
  }

  /** Trick gems still available today (DESIGN 11 daily cap). */
  trickGemsLeftToday(): number {
    return trickGemsLeftToday(this.ctx.state, this.now());
  }

  bowls(): readonly PlacedItem[] {
    return this.ctx.state.world.placedItems.filter(isBowl);
  }

  canSell(animalId: string): CommandResult {
    const animal = this.getAnimal(animalId);
    if (!animal) return { ok: false, reason: "Can't find that animal." };
    return canSell(animal, this.now());
  }

  /** DESIGN 7.2 status badges. */
  badges(animalId: string): Badge[] {
    const animal = this.getAnimal(animalId);
    if (!animal) return [];
    const now = this.now();
    const out: Badge[] = [];
    if (now < animal.arrivedAt + seconds(BALANCE.newBadgeSeconds)) out.push('new');
    if (animal.pregnancy) out.push('pregnant');
    if (isBaby(animal, now)) out.push('baby');
    if (animal.sickness) out.push('sick');
    if (animal.isKept) out.push('kept');
    // A sick animal can't be sold, so it doesn't claim to be ready (DESIGN 9.3).
    else if (isReadyToSell(animal, now) && !animal.sickness) out.push('readyToSell');
    return out;
  }

  // ---- Internals --------------------------------------------------------------------------

  /**
   * @internal Dev tools only (src/sim/debugCommands.ts). Runs `fn` with direct access to the
   * sim internals and the clock's current time, without catching up first.
   */
  debugRun<T>(fn: (ctx: SimContext, clockNow: Ms) => T): T {
    const result = fn(this.ctx, this.clock.now());
    this.afterChange(true);
    return result;
  }

  private command(run: () => CommandResult): CommandResult {
    this.update();
    const result = run();
    this.afterChange(true);
    return result;
  }

  private afterChange(changed: boolean): void {
    this.syncRng();
    const crowded = isCrowded(this.ctx.state.world);
    if (crowded !== this.crowded) {
      this.crowded = crowded;
      this.events.emit('crowdedChanged', { crowded });
    }
    if (changed) this.events.emit('changed', undefined);
  }

  private syncRng(): void {
    this.ctx.state.meta.rngState = this.ctx.rng.getState();
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
