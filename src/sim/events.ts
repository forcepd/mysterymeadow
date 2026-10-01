import type { GoalReward } from '../config/goals';
import type { DailyGiftReward } from './systems/dailyGift';
import type {
  Animal,
  GameSettings,
  OfflineSummary,
  PlacedItem,
  Poop,
  Visitor,
  YardFind,
  Zone,
} from './types';

/**
 * Events the sim emits for animations, toasts, and sounds. Payloads reference live sim
 * objects: listeners must treat them as read-only.
 *
 * During offline catch-up, per-item events are not emitted; `caughtUp` summarizes instead.
 */
export type SimEvents = {
  visitorArrived: { visitor: Visitor };
  /** The visitor timer fired while the yard was Crowded, so nobody came. */
  visitorSkipped: { reason: 'crowded' };
  visitorRevealed: { visitor: Visitor; auto: boolean };
  visitorEntered: { visitorId: string; animal: Animal };
  visitorLeft: { visitor: Visitor };
  animalBorn: { mother: Animal; babies: Animal[] };
  animalGrew: { animal: Animal };
  readyToSell: { animal: Animal };
  animalSold: { animal: Animal; price: number };
  coinsChanged: { coins: number; delta: number };
  gemsChanged: { gems: number; delta: number };
  crowdedChanged: { crowded: boolean };
  dexDiscovered: { key: string };
  animalAte: { animal: Animal; bowlId: string };
  bowlEmptied: { bowlId: string };
  /** `by` a helper, or the player tapping the bowl. */
  bowlRefilled: { bowlId: string; by?: 'autoFeeder' };
  treatGiven: { animal: Animal };
  animalPetted: { animal: Animal };
  poopAppeared: { poop: Poop; animalId: string };
  poopCleaned: { poop: Poop; by?: 'scoopBot' };
  animalRenamed: { animal: Animal };
  animalSick: { animal: Animal; illnessId: string; secondIllnessId?: string };
  /** Checked in at the vet (`free` = Free Clinic, which starts with a wait). */
  vetVisitStarted: { animal: Animal; free: boolean; fee: number };
  /** The Free Clinic wait is over: the vet can see the animal now. */
  clinicReady: { animal: Animal };
  /** A treatment was given (`cost` may be 0). `cured` is false for the wrong treatment. */
  /** `helped`: the right treatment for one of its illnesses; `cured`: nothing left to treat. */
  vetTreated: {
    animal: Animal;
    treatmentId: string;
    cost: number;
    cured: boolean;
    helped: boolean;
  };
  animalCured: { animal: Animal; illnessId: string };
  /** Marked Keep (DESIGN 10.1). */
  petKept: { animal: Animal };
  petUnkept: { animal: Animal };
  /** Left the world for Pet Storage (paused). */
  petStored: { animal: Animal };
  /** Came out of Pet Storage into a slot. */
  petRetrieved: { animal: Animal };
  /** Went between yard and house (DESIGN 12.4). */
  animalMovedZone: {
    animal: Animal;
    from: Zone;
    to: Zone;
    reason: 'player' | 'wander' | 'food' | 'noBed';
  };
  itemBought: { itemId: string };
  itemPlaced: { item: PlacedItem };
  /** Moved or rotated. */
  itemMoved: { item: PlacedItem };
  itemStored: { item: PlacedItem };
  surfaceApplied: { itemId: string };
  /** Moved up to the next house tier (DESIGN 12.1). */
  houseUpgraded: { tierId: string };
  /** A successful Simon-says session that didn't finish the trick yet. */
  trickPracticed: { animal: Animal; trickId: string; progress: number };
  /** Learned a new trick; `gems` may be 0 when today's cap is used up. */
  trickLearned: { animal: Animal; trickId: string; gems: number };
  trickPerformed: { animal: Animal; trickId: string };
  /** An outfit piece was put on or taken off. */
  petDressed: { animal: Animal };
  /** A grown-up gave gems in Parent Mode. */
  gemsGranted: { amount: number };
  /** Parent Mode changed a setting. */
  settingsChanged: { settings: GameSettings };
  /** A Real Estate purchase other than a house upgrade. */
  realEstateBought: { kind: 'room' | 'petSlot' | 'storage' | 'color' };
  caughtUp: OfflineSummary;
  /** Starter goals (early-game pass). */
  goalReady: { goalId: string };
  goalClaimed: { goalId: string; reward: GoalReward };
  goalsCompleted: { reward: GoalReward };
  /** Yard finds. */
  findAppeared: { find: YardFind };
  findCollected: { find: YardFind; coins: number };
  findGone: { find: YardFind };
  dailyGiftOpened: { reward: DailyGiftReward };
  /** The birthday card was seen (once on the birthday). */
  birthdayGreeted: undefined;
  /** Something in the state may have changed (a tick ran or a command was called). */
  changed: undefined;
};
