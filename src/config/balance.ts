import { deepFreeze } from './deepFreeze';

/**
 * Every gameplay number lives here (DESIGN.md Section 15). Never hardcode tunables elsewhere.
 * Durations are in the unit named by the key (Minutes / Seconds / Hours).
 */
// prettier-ignore
export const BALANCE = deepFreeze({
  startingCoins: 100,
  startingGems: 50,

  houseTiers: [
    { id: 'cottage',   name: 'Cozy Cottage',   cost: 0,     visitorMinutes: 10, baseCapacity: 6,  interiorGrid: [8, 6],   lureSlots: 3,  maxRoomExpansions: 2, baseLure: 0 },
    { id: 'bungalow',  name: 'Sunny Bungalow', cost: 1500,  visitorMinutes: 8,  baseCapacity: 9,  interiorGrid: [10, 7],  lureSlots: 5,  maxRoomExpansions: 3, baseLure: 10 },
    { id: 'farmhouse', name: 'Big Farmhouse',  cost: 5000,  visitorMinutes: 7,  baseCapacity: 12, interiorGrid: [12, 8],  lureSlots: 7,  maxRoomExpansions: 4, baseLure: 20 },
    { id: 'manor',     name: 'Grand Manor',    cost: 15000, visitorMinutes: 6,  baseCapacity: 16, interiorGrid: [14, 10], lureSlots: 10, maxRoomExpansions: 5, baseLure: 30 },
  ],
  roomExpansionCosts: [250, 400, 600, 900, 1300],
  petSlots: { starting: 2, costs: [300, 600, 1000, 1500, 2000, 2500] },
  petStorage: { starting: 20, perExpansion: 10, expansionCosts: [200, 400, 800] },

  visitor: { gateWaitMinutes: 5, autoRevealSeconds: 60 },

  // [DEFAULT, Phase 1] Each placed yard lure with affinity for a species adds this much to that
  // species' weight within its rolled rarity tier (every species starts at weight 1).
  affinity: { bonusPerLure: 1 },

  rarity: {
    baseWeights: { common: 60, uncommon: 25, rare: 10, epic: 4, legendary: 1 },
    lureBoost:   { common: -0.01, uncommon: 0.01, rare: 0.02, epic: 0.03, legendary: 0.04 },
    floorFactor: { common: 0.3, uncommon: 1, rare: 1, epic: 1, legendary: 1 },
    maxLure: 100,
    basePrice:   { common: 20, uncommon: 45, rare: 100, epic: 250, legendary: 600 },
    sparkleChance: 0.02,
    sparkleMultiplier: 3,
  },

  pregnancy: {
    chance: 0.30,
    gestationMinutes: 3,
    litterWeights: { 1: 30, 2: 30, 3: 20, 4: 12, 5: 8 },
    babyKeepsMotherColor: 0.7,
    sparkleInheritChance: 0.25,
    // [DEFAULT, Phase 1] Babies appear within this distance of the mother (zone coords are 0..1).
    birthScatter: 0.12,
  },

  holdMinutes: 20,

  // [DEFAULT, early-game pass] A new player's quick start. The first `fastVisitors` gaps between
  // visitors are `fastVisitorMinutes`; the first `quickHolds` animals that come in can be sold
  // after `quickHoldMinutes`; and each of the first visitors gets its surprise, in order (the
  // tutorial visitor first): the 2nd is always expecting babies, the 3rd at least Uncommon.
  welcome: {
    fastVisitors: 5,
    fastVisitorMinutes: 2,
    quickHolds: 3,
    quickHoldMinutes: 5,
    surprises: ['none', 'pregnant', 'uncommon'],
    surpriseMinLitter: 2,
  },

  // [DEFAULT, early-game pass] Little things to tap in the yard, now and then (online only).
  finds: {
    firstAfterMinutes: 5,
    minMinutes: 2,
    maxMinutes: 4,
    lifetimeMinutes: 3,
    maxAtOnce: 2,
    kinds: {
      coin: { weight: 5, coins: 3 },
      butterfly: { weight: 3, coins: 2 },
      clover: { weight: 2, coins: 6 },
    },
  },

  // [DEFAULT, early-game pass] A present on the first play of each (local) day. Not on day one.
  dailyGift: {
    coins: [30, 40, 50, 60],
    itemChance: 0.25,
    items: ['carrot_patch', 'bird_bath', 'toy_basket', 'flower_garden'],
    gemChance: 0.2,
    gems: 5,
    gemBonusCoins: 20,
  },
  babyGrowMinutes: 20,
  newBadgeSeconds: 60,

  needs: {
    hungerDrainMinutes: 30,
    happinessDrainMinutes: 40,
    bowlServings: 5,
    hungryThreshold: 50,
    petHappinessGain: 15,
    petCooldownSeconds: 20,
    crowdedHappinessDrainMultiplier: 1.5,
    // [DEFAULT, Phase 3] One serving fills this much hunger (capped at 100).
    hungerPerServing: 100,
    // [DEFAULT, Phase 3] Zone cleanliness = 100 - this x uncleaned poops in the zone (min 0).
    cleanlinessPerPoop: 20,
  },

  // [DEFAULT, Phase 3] Treat from the Animal Card (DESIGN 8.2): costs coins, +hunger, +happiness.
  treat: { cost: 5, hungerGain: 30, happinessGain: 25 },

  poop: { minMinutes: 8, maxMinutes: 14 },

  sickness: {
    baseChancePerMinute: 0.002,
    lowHungerMultiplier: 2,
    poopThreshold: 3,
    poopMultiplier: 2,
    lowHappinessMultiplier: 1.5,
    contagionPerSickPerMinute: 0.01,
    immunityMinutes: 30,
    sickHappinessDrainMultiplier: 2,
    // DESIGN 9.1 "hunger < 25" and "happiness < 25".
    lowHungerBelow: 25,
    lowHappinessBelow: 25,
    // DESIGN 9.1: every simulated minute each healthy animal rolls once.
    rollSeconds: 60,
    // DESIGN 9.5 step 6 (Phase 10): "tricky cases" with two illnesses that need two treatments,
    // from the Farmhouse tier. [DEFAULT, your choice] 20% of new (not caught) sicknesses.
    trickyCaseChance: 0.2,
    trickyCaseMinTier: 'farmhouse',
  },

  // DESIGN 9.5. [DEFAULT, Phase 4] Free Clinic: if coins < visitFee + treatmentCost at check-in,
  // the visit and its treatments are free after freeClinicWaitMinutes. On a paid visit, a
  // treatment you can't afford is free too, so the game can never get stuck.
  vet: { visitFee: 20, treatmentCost: 10, freeClinicWaitMinutes: 3 },

  // careMultiplier maps the average of hunger, happiness and zone cleanliness over the last
  // windowMinutes linearly onto min..max ([DEFAULT, Phase 3] mapping; one sample per sampleSeconds).
  care: { minMultiplier: 0.8, maxMultiplier: 1.3, windowMinutes: 10, sampleSeconds: 60 },

  // DESIGN 10.2: pet names.
  names: { minLength: 1, maxLength: 14 },

  tricks: {
    sessionsToLearn: 3,
    cooldownMinutes: 5,
    gemsPerNewTrick: 5,
    salePriceBonusPerTrick: 0.10,
    maxByRarity: { common: 2, uncommon: 3, rare: 4, epic: 5, legendary: 6 },
    dailyGemCap: 40,
    // [DEFAULT, Phase 9] Simon-says length per session: 3 cues, then 4, then 5 (DESIGN 11: 3-5).
    cuesPerSession: [3, 4, 5],
    // [DEFAULT, Phase 9] A kept pet performing a known trick: +happiness, no cooldown (your choice).
    performHappiness: 10,
  },

  wander: { minSeconds: 60, maxSeconds: 120 },

  // DESIGN 12.4 zones. [DEFAULT, Phase 6] When an animal's wander timer fires it may switch
  // between yard and house (going in needs a free pet bed). Kept pets and unhappy animals
  // (happiness < unhappyBelow) prefer indoors: they go in more and come out less.
  zones: { switchChance: 0.25, preferIndoorsIn: 0.6, preferIndoorsOut: 0.1, unhappyBelow: 50 },

  // DESIGN 12.3. [DEFAULT, Phase 6] Room Coziness = sum of house decor, capped at max. Indoor
  // animals regain regenPerMinuteAtMax x (coziness / max) happiness per minute, plus their
  // bed's own bonus (items.ts).
  coziness: { max: 100, regenPerMinuteAtMax: 1.5 },

  // [DEFAULT, Phase 10] The "While you were away" card shows after at least this long away.
  offline: { maxCatchUpHours: 8, maxGateQueue: 3, summaryMinMinutes: 5 },

  // [DEFAULT, Phase 1] Fixed sim tick. A gap between updates longer than offlineGapSeconds is
  // treated as offline time (safety net in case the app misses a visibilitychange).
  time: { tickSeconds: 1, offlineGapSeconds: 300 },

  // DESIGN 18.4: autosave interval (real seconds). Also saves on hide and after sales.
  save: { autosaveSeconds: 15 },

  houseColorChangeCost: 50,

  // DESIGN 5, 13.3, 20. [DEFAULT, Phase 8] Profiles, the Parent PIN, gem grants, activity log.
  profiles: { usernameMin: 3, usernameMax: 16, savedOutfits: 3, activityLogSize: 50 },
  pin: { digits: 4 },
  gems: { grantPresets: [10, 50, 100], maxGrant: 500 },

  // DESIGN 5 step 4. [DEFAULT, Phase 8] The tutorial's first visitor arrives hungry (next to an
  // empty bowl, so the kid fills it) and poops soon, so every step happens in a minute or two.
  tutorial: { visitorHunger: 40, firstPoopSeconds: 20 },

  // Helpers (items.ts has their prices). [DEFAULT, Phase 7] Once a minute, online only: Scoop
  // Bot cleans the oldest yard poop (DESIGN 8.3), and Auto-Feeder refills every empty bowl.
  helpers: { scoopEverySeconds: 60, feedEverySeconds: 60 },
} as const);

export type Balance = typeof BALANCE;
export type HouseTier = Balance['houseTiers'][number];
export type HouseTierId = HouseTier['id'];
