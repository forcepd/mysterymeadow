import type { RngState } from './rng';

/** Epoch milliseconds. All sim timers are stored as absolute timestamps. */
export type Ms = number;

export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;
export type Rarity = (typeof RARITIES)[number];

export type Zone = 'yard' | 'house';

/** Result of every sim command. UI shows `reason` to the player when a command is refused. */
export type CommandResult = { ok: true } | { ok: false; reason: string };

/** Position inside a zone, normalized to 0..1 on each axis. Scenes map it to pixels. */
export interface Vec2 {
  x: number;
  y: number;
}

/** DESIGN.md Section 19. Fields for later phases exist now so saves don't need migrating. */
export interface Animal {
  id: string;
  speciesId: string;
  variantId: string;
  isSparkle: boolean;
  rarity: Rarity;
  name?: string;
  arrivedAt: Ms;
  /** Set for animals born in the yard. */
  bornAt?: Ms;
  holdUntil: Ms;
  /** Set for babies: when they grow to adult size. */
  grownAt?: Ms;
  pregnancy?: { birthAt: Ms; litterSize: number };
  zone: Zone;
  position: Vec2;
  needs: { hunger: number; happiness: number };
  careHistory: number[];
  sickness?: Sickness;
  /** illnessId -> immune until. */
  immunities: Record<string, Ms>;
  isKept: boolean;
  outfit: { head?: string; body?: string; face?: string };
  tricks: { known: string[]; progress: Record<string, number>; nextTrainAt: Ms };
  nextPoopAt: Ms;
  nextWanderAt: Ms;
  /** Petting cooldown ends (DESIGN 8.4). Added in save v2. */
  nextPetAt: Ms;
}

/** DESIGN 9. */
export interface Sickness {
  illnessId: string;
  /**
   * A tricky case (DESIGN 9.5 step 6, save v6): a second illness that needs its own treatment.
   * Only `illnessId` shows in the world and spreads to others.
   */
  secondIllnessId?: string;
  since: Ms;
  /** Free Clinic: waiting to see the vet until this time. Cleared when the wait is over. */
  atClinicUntil?: Ms;
  /**
   * Set once checked in at the vet (save v3), so leaving the clinic never charges twice.
   * `free` = Free Clinic: the visit and its treatments cost nothing.
   */
  visit?: 'paid' | 'free';
}

/** Kept pet in Pet Storage (paused). On retrieval, timestamps shift by (now - storedAt). */
export interface StoredPet {
  animal: Animal;
  storedAt: Ms;
}

/** What a mystery visitor turns out to be. Rolled when it reaches the gate. */
export interface VisitorRoll {
  speciesId: string;
  variantId: string;
  isSparkle: boolean;
  rarity: Rarity;
  /** 0 = not pregnant. */
  litterSize: number;
}

export interface Visitor {
  id: string;
  arrivedAtGate: Ms;
  autoRevealAt: Ms;
  /** Only matters if there's no room: the visitor waves goodbye at this time. */
  leavesAt: Ms;
  revealed: boolean;
  roll: VisitorRoll;
}

export interface Poop {
  id: string;
  zone: Zone;
  position: Vec2;
  createdAt: Ms;
}

export interface PlacedItem {
  id: string;
  itemId: string;
  zone: Zone;
  tile: { x: number; y: number };
  rotation: 0 | 90 | 180 | 270;
  servings?: number;
}

export interface GameSettings {
  offlineProgress: boolean;
  sicknessEnabled: boolean;
  dailyTrickGemCap: number;
  /** 0..1 (DESIGN 16.3 volume sliders). */
  musicVolume: number;
  sfxVolume: number;
  /** All sound off (save v6). */
  muted: boolean;
  reducedMotion: boolean;
}

export interface HouseState {
  tierId: string;
  exteriorColor: string;
  roomExpansions: number;
  petSlotsPurchased: number;
  storageExpansions: number;
  /** Applied wallpaper and flooring item ids (save v4). */
  wallpaperId: string;
  flooringId: string;
}

export interface WorldState {
  coins: number;
  gems: number;
  house: HouseState;
  placedItems: PlacedItem[];
  /** itemId -> count (unplaced furniture, pet outfits). */
  inventory: Record<string, number>;
  /** Animals out in the world (yard/house), including kept pets in slots. */
  animals: Animal[];
  petStorage: StoredPet[];
  gateQueue: Visitor[];
  poops: Poop[];
  nextVisitorAt: Ms;
  /** `${speciesId}:${variantId}`, plus `${speciesId}:sparkle`. */
  discoveredDex: string[];
  settings: GameSettings;
  /** A new player's quick start (save v7). */
  welcome: WelcomeState;
  /** Starter goals (save v7). */
  goals: GoalsState;
  /** Little things to tap in the yard (save v7). */
  finds: YardFind[];
  nextFindAt: Ms;
  /** Daily present: the local day (YYYY-MM-DD) it was last opened (save v7). */
  dailyGift: { lastDay: string };
  /** Birthday card: the local day (YYYY-MM-DD) it was last seen (save v8). */
  birthday: { lastGreetedDay: string };
}

/** A special pick for one of a new player's first visitors. */
export type WelcomeSurprise = 'none' | 'pregnant' | 'uncommon';

/** A new player's quick start: early visitors come faster, and the first sales come sooner. */
export interface WelcomeState {
  /** Gaps between visitors that are still short. */
  fastVisitorsLeft: number;
  /** Animals that can still be sold after the short wait. */
  quickHoldsLeft: number;
  /** Used up in order, one per visitor. */
  surprises: WelcomeSurprise[];
}

export interface GoalsState {
  /** goalId -> count so far (capped at the goal's target). */
  progress: Record<string, number>;
  /** Goals whose reward was collected. */
  claimed: string[];
}

export type FindKind = 'coin' | 'clover' | 'butterfly';

export interface YardFind {
  id: string;
  kind: FindKind;
  position: Vec2;
  expiresAt: Ms;
}

export interface SimMeta {
  createdAt: Ms;
  /** Time of the last processed tick. Everything up to here has been simulated. */
  lastSeenAt: Ms;
  rngSeed: number;
  rngState: RngState;
  /** Counter for deterministic ids. */
  nextId: number;
  dailyTrickGems: { date: string; earned: number };
}

/** Everything the sim needs to resume exactly. Plain JSON. */
export interface SimState {
  world: WorldState;
  meta: SimMeta;
}

/** What happened while the player was away (for the "While you were away" card). */
export interface OfflineSummary {
  /** Real time between the last tick and now. */
  awayMs: Ms;
  /** How much of that was simulated (capped; zero if offline progress is off). */
  simulatedMs: Ms;
  visitorsWaiting: number;
  babiesBorn: number;
  grewUp: number;
  readyToSell: number;
}
