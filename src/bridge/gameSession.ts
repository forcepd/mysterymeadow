import { BALANCE } from '../config/balance';
import { getAvatarItem } from '../config/avatarItems';
import { getIllness } from '../config/illnesses';
import { getItem } from '../config/items';
import { getTrick } from '../config/tricks';
import { addActivity, type ActivityEntry } from '../profile/activity';
import { DEFAULT_LOADOUT, isValidLoadout, owns, type AvatarLoadout } from '../profile/avatar';
import { SaveManager, type KeyValueStore } from '../save/SaveManager';
import {
  newProfile,
  toSaveFile,
  toSimState,
  type Profile,
  type SaveFile,
  type TutorialStep,
} from '../save/schema';
import { ScaledClock, systemClock, type Clock } from '../sim/clock';
import { Emitter } from '../sim/emitter';
import { GameSim } from '../sim/GameSim';
import type { CommandResult } from '../sim/types';
import { awayCard, type AwayCard } from './away';
import { displayName } from './describe';

/** Used by tests and old single-profile installs. */
export const DEFAULT_PROFILE: Profile = {
  ...newProfile('default', 'Player', DEFAULT_LOADOUT),
  tutorial: 'done',
};

export type SessionEvents = {
  /** A save attempt failed (e.g. storage blocked in a private window). */
  saveFailed: { error: unknown };
  /** The profile changed (avatar, owned items, outfits, tutorial step). */
  profileChanged: { profile: Profile };
  /** A "While you were away" card to show (or null once it's closed). */
  awayChanged: { card: AwayCard | null };
};

export interface SessionOptions {
  store: KeyValueStore;
  /** Real time source. Defaults to the system clock. */
  source?: Clock;
  /** Seed for a brand new game. */
  newSeed?: () => number;
  /** Load this profile's save (or start a new game for it if it has none). */
  profileId?: string;
  /**
   * A brand new player from onboarding: their profile, house color, and whether the tutorial
   * runs (the first visitor comes right away either way).
   */
  create?: { profile: Profile; houseColor: string; tutorial?: boolean };
}

/**
 * Owns one running game: the clock, the sim, the player's profile, and its save. The app
 * drives it with `frame()` (every animation frame), `hidden()` / `visible()` (page
 * visibility), and `autosave()`.
 */
export class GameSession {
  readonly events = new Emitter<SessionEvents>();
  private saving: Promise<void> = Promise.resolve();
  private stopped = false;
  private stateVersion = 0;
  private awayNow: AwayCard | null = null;

  private constructor(
    readonly sim: GameSim,
    readonly clock: ScaledClock,
    private currentProfile: Profile,
    private activityLog: ActivityEntry[],
    private readonly saves: SaveManager,
    /** True if this session started a brand new game. */
    readonly isNewGame: boolean,
  ) {
    const bump = () => this.stateVersion++;
    sim.events.on('changed', bump);
    this.events.on('profileChanged', bump);
    // Before the save listeners, so each save includes its own activity line.
    this.logActivity();
    // DESIGN 18.4: save after any sale or purchase (treats, vet visits and treatments, store,
    // Real Estate). Renames, pet moves, decorating, gems, settings, goals, finds, and the daily
    // present too, so a quick reload keeps them.
    for (const event of [
      'animalSold',
      'treatGiven',
      'animalRenamed',
      'vetVisitStarted',
      'vetTreated',
      'petKept',
      'petUnkept',
      'petStored',
      'petRetrieved',
      'itemBought',
      'itemPlaced',
      'itemMoved',
      'itemStored',
      'surfaceApplied',
      'houseUpgraded',
      'realEstateBought',
      'gemsGranted',
      'settingsChanged',
      'trickPracticed',
      'trickLearned',
      'petDressed',
      'goalClaimed',
      'findCollected',
      'dailyGiftOpened',
    ] as const) {
      sim.events.on(event, () => void this.save());
    }
  }

  /** Bumps whenever sim state or the profile may have changed. For useSyncExternalStore. */
  get version(): number {
    return this.stateVersion;
  }

  subscribe = (listener: () => void): (() => void) => {
    const offs = [
      this.sim.events.on('changed', listener),
      this.events.on('profileChanged', listener),
    ];
    return () => offs.forEach((off) => off());
  };

  get profile(): Readonly<Profile> {
    return this.currentProfile;
  }

  /** Parent Mode's recent activity, newest first. */
  get activity(): readonly ActivityEntry[] {
    return this.activityLog;
  }

  /** Loads a profile's save (catching up the time away) or starts a new game. */
  static async start(options: SessionOptions): Promise<GameSession> {
    const source = options.source ?? systemClock;
    const saves = new SaveManager(options.store);
    const profileId = options.create?.profile.id ?? options.profileId ?? DEFAULT_PROFILE.id;
    const file = options.create ? undefined : await saves.load(profileId);

    if (file) {
      // Never let game time run backwards, even if the device clock was set back.
      const clock = new ScaledClock(source, 1, Math.max(source.now(), file.meta.lastSeenAt));
      const sim = GameSim.fromState(toSimState(file), clock);
      const session = new GameSession(sim, clock, file.profile, file.activity, saves, false);
      session.catchUp();
      return session;
    }

    const clock = new ScaledClock(source, 1);
    const seed = (options.newSeed ?? randomSeed)();
    const create = options.create;
    const sim = GameSim.newGame({
      clock,
      seed,
      ...(create ? { houseColor: create.houseColor, tutorial: create.tutorial ?? true } : {}),
    });
    const profile = create?.profile ?? { ...DEFAULT_PROFILE, id: profileId };
    const session = new GameSession(sim, clock, structuredClone(profile), [], saves, true);
    await session.save();
    return session;
  }

  /** Call every animation frame. */
  frame(): void {
    if (!this.stopped) this.sim.update();
  }

  /** The page was hidden: save now, since it may never come back. */
  hidden(): Promise<void> {
    return this.save();
  }

  /** The page is visible again: the time away is offline time. */
  visible(): void {
    if (!this.stopped) this.catchUp();
  }

  /** The "While you were away" card waiting to be seen, if any. */
  get away(): AwayCard | null {
    return this.awayNow;
  }

  dismissAway(): void {
    this.awayNow = null;
    this.events.emit('awayChanged', { card: null });
  }

  private catchUp(): void {
    const summary = this.sim.catchUp();
    // Never interrupt the first-time tutorial.
    if (this.currentProfile.tutorial !== 'done') return;
    const card = awayCard(summary, this.sim.state.world.settings.offlineProgress);
    if (!card) return;
    this.awayNow = card;
    this.events.emit('awayChanged', { card });
  }

  autosave(): Promise<void> {
    if (!this.stopped) this.sim.update();
    return this.save();
  }

  /** Saves the current state. Saves never overlap; failures are reported, not thrown. */
  save(): Promise<void> {
    if (this.stopped) return this.saving;
    const file = this.toSaveFile();
    this.saving = this.saving
      .then(() => this.saves.save(file))
      .catch((error: unknown) => this.events.emit('saveFailed', { error }));
    return this.saving;
  }

  toSaveFile(): SaveFile {
    return toSaveFile(this.currentProfile, this.sim.toState(), this.activityLog);
  }

  /** Switching players: one last save, then nothing more. */
  async stop(): Promise<void> {
    await this.save();
    this.stopped = true;
  }

  /** Stops without saving (e.g. an imported backup is about to replace this save). */
  abandon(): void {
    this.stopped = true;
  }

  /** Dev only: throws away this profile's save. The app reloads afterwards. */
  async deleteSave(): Promise<void> {
    this.stopped = true;
    await this.saving;
    await this.saves.delete(this.currentProfile.id);
  }

  // ---- Profile: avatar, Boutique, outfits, tutorial ------------------------------------------

  /** Boutique (DESIGN 13.3): buy an avatar item with gems. */
  buyAvatarItem(itemId: string): CommandResult {
    const def = getAvatarItem(itemId);
    if (!def) return { ok: false, reason: 'That’s not in the Boutique.' };
    if (owns(this.currentProfile.ownedAvatarItems, itemId)) {
      return { ok: false, reason: 'You already have it!' };
    }
    const paid = this.sim.spendGems(def.cost);
    if (!paid.ok) return paid;
    this.updateProfile((p) => p.ownedAvatarItems.push(itemId));
    this.log('💎', `Bought ${def.name} for ${def.cost} gems`);
    return { ok: true };
  }

  /** Wardrobe: wear an outfit (free, owned items only). */
  wear(loadout: AvatarLoadout): CommandResult {
    if (!isValidLoadout(loadout, this.currentProfile.ownedAvatarItems)) {
      return { ok: false, reason: 'You don’t have all of those yet!' };
    }
    this.updateProfile((p) => (p.avatar = structuredClone(loadout)));
    return { ok: true };
  }

  /** Saves what the avatar is wearing now into favorite slot `index` (0..2). */
  saveOutfit(index: number): CommandResult {
    if (!Number.isInteger(index) || index < 0 || index >= BALANCE.profiles.savedOutfits) {
      return { ok: false, reason: 'No such outfit slot.' };
    }
    this.updateProfile((p) => (p.savedOutfits[index] = structuredClone(p.avatar)));
    return { ok: true };
  }

  wearOutfit(index: number): CommandResult {
    const outfit = this.currentProfile.savedOutfits[index];
    if (!outfit) return { ok: false, reason: 'That outfit slot is empty.' };
    return this.wear(outfit);
  }

  setTutorial(step: TutorialStep): void {
    if (this.currentProfile.tutorial === step) return;
    this.updateProfile((p) => (p.tutorial = step));
  }

  /** Parent Mode: rename this profile (the device record is updated by the caller). */
  rename(username: string): void {
    this.updateProfile((p) => (p.username = username));
  }

  private updateProfile(change: (p: Profile) => void): void {
    change(this.currentProfile);
    this.events.emit('profileChanged', { profile: this.currentProfile });
    void this.save();
  }

  // ---- Activity log (Parent Mode) ------------------------------------------------------------

  private log(icon: string, text: string): void {
    this.activityLog = addActivity(this.activityLog, { at: this.sim.now(), icon, text });
  }

  private logActivity(): void {
    const e = this.sim.events;
    e.on('animalSold', ({ animal, price }) =>
      this.log('🪙', `Sold ${displayName(animal)} for ${price}`),
    );
    e.on('animalBorn', ({ mother, babies }) =>
      this.log(
        '🍼',
        `${displayName(mother)} had ${babies.length} ${babies.length === 1 ? 'baby' : 'babies'}`,
      ),
    );
    e.on('animalSick', ({ animal, illnessId }) =>
      this.log('🤒', `${displayName(animal)} got ${getIllness(illnessId)?.name ?? 'sick'}`),
    );
    e.on('animalCured', ({ animal }) => this.log('💖', `The vet cured ${displayName(animal)}`));
    e.on('itemBought', ({ itemId }) => this.log('🛒', `Bought ${getItem(itemId)?.name ?? itemId}`));
    e.on('houseUpgraded', ({ tierId }) =>
      this.log(
        '🏡',
        `Moved to the ${BALANCE.houseTiers.find((t) => t.id === tierId)?.name ?? tierId}`,
      ),
    );
    e.on('realEstateBought', ({ kind }) =>
      this.log(
        '🏡',
        {
          room: 'Added a room',
          petSlot: 'Bought a Pet Slot',
          storage: 'Made Pet Storage bigger',
          color: 'Painted the house',
        }[kind],
      ),
    );
    e.on('gemsGranted', ({ amount }) => this.log('🎁', `A grown-up gave ${amount} gems`));
    e.on('trickLearned', ({ animal, trickId, gems }) =>
      this.log(
        '🎓',
        `${displayName(animal)} learned ${getTrick(trickId)?.name ?? trickId}${gems ? ` (+${gems} gems)` : ''}`,
      ),
    );
  }
}

function randomSeed(): number {
  return Math.floor(Math.random() * 0x100000000);
}
