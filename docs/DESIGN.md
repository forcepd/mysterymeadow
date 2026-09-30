# Mystery Meadow — Game Design & Technical Design Document

> **Working title.** Let the designer (your daughter) rename it. Everything marked **[TUNABLE]** lives in `src/config/balance.ts` and can be changed without touching game logic. Everything marked **[ASSUMPTION]** is a default chosen for her description where she didn't specify; see Section 23.

---

## 0. How to use this document with Claude Code

1. Put this file at `docs/DESIGN.md` and the companion `CLAUDE.md` at the repo root.
2. Build **one phase at a time** (Section 21). Each phase ends with a playable build, passing tests, and an updated `docs/PROGRESS.md`.
3. Start each phase with a prompt like: *"Read CLAUDE.md, docs/DESIGN.md sections X–Y, and docs/PROGRESS.md. Propose a plan for Phase N, then implement only Phase N."*
4. When your daughter playtests and wants changes, edit this document first, then tell Claude Code what changed. The doc stays the source of truth.

---

## 1. Vision

A cozy, cartoon pet-collecting game. Mystery animals wander into your yard. You care for them, keep your favorites, sell the rest, heal them when they're sick, teach them tricks, and use your earnings to decorate and upgrade your home so rarer animals visit. You express yourself through a fully customizable avatar.

**Design pillars**
- **Surprise:** every visitor is a mystery until revealed; rare ones feel special.
- **Nurture:** animals have needs, get sick, have babies, and respond to care.
- **Ownership:** your avatar, your house, your pets, your names, your outfits.
- **Cozy, never cruel:** animals never die, nothing is scary, mistakes are recoverable.

**Audience:** kids roughly 8–12. UI is icon-first with short, simple text.

---

## 2. Scope & Platform

| Item | Decision |
|---|---|
| Platform | Browser game. Desktop (Chrome, Safari, Edge, Firefox) and iPad (Safari, installable as a PWA to the Home Screen). |
| Orientation | Landscape-first. Portrait shows a friendly "turn your iPad sideways" screen. |
| Players | Single-player. Multiple local profiles per device (e.g., siblings). |
| Distribution | Public static website that friends can open in a browser. No accounts, no login, no server-side game logic. |
| Saves | **Local only**, one save per profile per device (IndexedDB). No cross-device sync. |
| Real money | **Not in the game.** Possible future phase after the game is complete (Section 21, Phase 11). |
| Style | 2D cartoon, top-down 3/4 view, Animal Crossing-inspired feel with fully original art. 3D is out of scope. |

---

## 3. Core Loop

```
Mystery visitor arrives (every 10 min at start)
  -> Tap to reveal (species + rarity)
  -> 30% chance it's pregnant -> gives birth to 1-5 babies
  -> Care: feed, pet, clean poop, keep healthy
  -> After 20 min in your care: SELL for coins, or KEEP as a pet
  -> Coins buy: vet care, decorations, lures, pet beds, room, bigger house
  -> Better house + more lures -> faster visitors, rarer visitors, more room
  -> Train tricks -> earn gems -> gems buy avatar clothes/hair/makeup
```

---

## 4. Currencies

There are exactly two currencies and they never convert into each other.

| Currency | Icon | Earned by | Spent on |
|---|---|---|---|
| **Coins** | gold coin | Selling animals | Vet visits and treatments, food treats, furniture, pet beds, yard lures, pet outfits, extra room, Pet Slots, Pet Storage, house upgrades |
| **Gems** | pink gem | Teaching a pet a new trick; parent grants (Section 20) | Avatar items only: clothes, hair, makeup, accessories |

- Starting balance: **100 coins, 50 gems** [TUNABLE].
- Coins and gems are integers. Display both in the top HUD at all times.
- **[ASSUMPTION]** Pet outfits cost coins, not gems, so the whole pet side of the game is playable without real money.

---

## 5. Onboarding (first launch of a new profile)

1. **Choose username.** 3–16 characters, letters/numbers/underscore. Local profanity filter. Hint text: "Pick a fun nickname (not your real name)."
2. **Make your avatar.** Avatar creator (Section 13.3) with the free starter set only. A small "More styles in the Boutique" teaser shows locked items.
3. **Pick your house color.** 8 exterior color swatches [TUNABLE] shown on a live preview of the starter cottage.
4. **Welcome sequence.** Avatar walks to the house. A short guided tutorial: first mystery visitor arrives immediately (not after 10 min), player reveals it, feeds it, cleans a poop, and sees the 20-minute "Ready to sell" countdown.

Returning players go straight to the profile picker, then to their yard.

---

## 6. The Yard, Visitors, Rarity, and Lures

### 6.1 Mystery visitor spawning
- A visitor timer runs continuously. When it fires, one **Mystery Visitor** appears at the yard gate as a wobbling silhouette with a "?" bubble.
- Interval depends on house tier: **10 min (Cottage) → 8 min (Bungalow) → 7 min (Farmhouse) → 6 min (Manor)** [TUNABLE].
- Player taps the visitor to **reveal**: a pop/sparkle animation, species name, rarity stars. Unrevealed visitors auto-reveal after 60 seconds.
- On reveal, the animal walks into the yard and joins your animals.
- **If you're at capacity** when the timer fires, the visitor waits at the gate for up to 5 minutes [TUNABLE] with a "No room!" bubble. If a spot frees up, it comes in; otherwise it waves and leaves. The next timer still starts on schedule.
- HUD shows a countdown: "Next visitor in 4:32".

### 6.2 Rarity tiers

| Tier | Stars | Base weight | Base sale price |
|---|---|---|---|
| Common | 1 | 60 | 20 coins |
| Uncommon | 2 | 25 | 45 coins |
| Rare | 3 | 10 | 100 coins |
| Epic | 4 | 4 | 250 coins |
| Legendary | 5 | 1 | 600 coins |

All [TUNABLE]. Rarity is shown by both star count and color so it's readable for colorblind players.

**Sparkle variant:** any animal has a 2% [TUNABLE] chance to be a Sparkle variant (shimmering outline, special palette). Sparkles sell for 3x.

### 6.3 Lure Score (how upgrades attract rarer animals)
Each yard item and each house tier contributes **Lure Score** (0–100, capped). Rarity weights shift with Lure Score:

```
weight[tier] = max(base[tier] * floorFactor[tier], base[tier] * (1 + lureScore * boost[tier]))
boost      = { common: -0.01, uncommon: 0.01, rare: 0.02, epic: 0.03, legendary: 0.04 }
floorFactor = { common: 0.3, others: 1.0 }
```

Worked examples (percent of total):
- Lure 0 → Legendary 1%, Epic 4%, Rare 10%
- Lure 50 → Legendary ~3%, Epic ~10%, Rare ~20%
- Lure 100 → Legendary ~4%, Epic ~13%, Rare ~25%

House tier base Lure Score: Cottage 0, Bungalow 10, Farmhouse 20, Manor 30 [TUNABLE].

### 6.4 Species affinity
Some lures also raise the chance of specific species *within* the rolled rarity tier (e.g., Little Pond → Otter, Duckling, Penguin, Axolotl). Rarity is rolled first, then species is rolled within the tier using affinity-adjusted weights.

### 6.5 Yard items (lures) — starter catalog

| Item | Cost | Lure | Affinity |
|---|---|---|---|
| Carrot Patch | 80 | +4 | Bunny, Piglet |
| Bird Bath | 100 | +4 | Chick, Duckling, Owl |
| Toy Basket | 120 | +5 | Puppy, Kitten |
| Flower Garden | 150 | +6 | general |
| Little Pond | 300 | +8 | Otter, Duckling, Penguin, Axolotl |
| Bamboo Grove | 400 | +8 | Red Panda |
| Eucalyptus Tree | 600 | +10 | Koala |
| Warm Rock | 900 | +12 | Baby Dragon |
| Rainbow Fountain | 1500 | +15 | Unicorn |
| Moon Lantern | 1500 | +15 | Moon Bunny |

Yard has limited **lure slots** per house tier (3 / 5 / 7 / 10) [TUNABLE]. Lures are placed on a yard grid.

---

## 7. Animals

### 7.1 Starter species roster (20)

| Rarity | Species |
|---|---|
| Common | Bunny, Kitten, Puppy, Hamster, Duckling, Chick |
| Uncommon | Hedgehog, Fox, Raccoon, Piglet, Lamb |
| Rare | Red Panda, Otter, Penguin, Owl |
| Epic | Koala, Fennec Fox, Axolotl |
| Legendary | Unicorn, Baby Dragon, Moon Bunny |

Each species has 3–5 color variants (random on spawn) plus the Sparkle variant. Adding a species should require only a data entry plus art, no code changes.

### 7.2 Lifecycle and badges
Every animal has a status shown as badges on its card and a small icon over its head:

- **New** — just arrived (first 60s)
- **Pregnant** — belly icon + countdown to birth
- **Baby** — smaller sprite; grows to adult size at 20 min
- **Sick** — green swirl / symptom icon
- **Ready to Sell** — coin icon once hold timer completes
- **Kept** — heart icon (is a pet, not for sale)

Animals **never die** and **never run away**.

### 7.3 Pregnancy and birth
- On arrival, 30% [TUNABLE] chance the animal is pregnant (babies are never pregnant).
- Gives birth 3 minutes [TUNABLE] after arrival. Birth is a celebration moment ("Biscuit had 3 babies!").
- Litter size 1–5 with weights `{1:30, 2:30, 3:20, 4:12, 5:8}` [TUNABLE]. **Maximum 5.**
- Babies are the same species as the mother. Color variant: 70% mother's, 30% random. Sparkle mother → 25% chance per baby of Sparkle.
- **Births ignore capacity.** If babies push you over capacity, the yard is "Crowded": new visitors are paused and all animals lose happiness slightly faster until you're back at or under capacity. This avoids ever having to delete a newborn.

### 7.4 Hold timer ("keep at least 20 minutes")
- Each animal has a hold timer starting at arrival (or birth for babies). **Minimum 20 minutes** [TUNABLE] before it can be sold.
- The animal card shows the countdown and the Sell button is disabled until it completes.

### 7.5 Selling
Sell requires: hold timer complete, not sick, not Kept.

```
salePrice = round( basePrice[rarity]
                   * (isSparkle ? 3 : 1)
                   * careMultiplier            // 0.8 .. 1.3 from average of needs over last 10 min
                   * (1 + 0.10 * tricksKnown) )
```

Any outfit the animal is wearing returns to the player's inventory on sale. Selling plays a happy wave-goodbye animation ("Pip went to a loving new home!"), coins fly to the HUD.

---

## 8. Care

### 8.1 Needs
Each animal has three needs, 0–100, shown as bars on the animal card:

| Need | Decays | Restored by |
|---|---|---|
| **Hunger** | 100 → 0 over 30 min | Eating from a food bowl; treats |
| **Happiness** | 100 → 0 over 40 min | Petting (tap-and-hold), toys, cozy decor nearby, treats, being in a bed |
| **Cleanliness** (zone-level) | Drops with each uncleaned poop in the zone | Cleaning poop |

All rates [TUNABLE]. Needs affect sale price (careMultiplier) and sickness chance.

### 8.2 Feeding
- Food bowls are placed in yard and house. Each holds 5 servings. Hungry animals (hunger < 50) walk to a bowl and eat automatically.
- Player refills a bowl by tapping it. **Basic food is free and unlimited** so a kid can never be stuck with starving animals.
- **Treats** (coins) give +hunger and +happiness and a heart animation.

### 8.3 Poop
- Each animal poops every 8–14 min [TUNABLE] at its current spot.
- Player taps poop to clean it (sparkle + satisfying pop sound).
- Each uncleaned poop in a zone raises sickness risk for animals in that zone (Section 9).
- Later upgrade: **Scoop Bot** (coins) auto-cleans one poop per minute in the yard.

### 8.4 Petting and interaction
- Tap an animal: open its card.
- Tap-and-hold an animal: pet it (hearts float up, +happiness, small cooldown).

---

## 9. Health, Contagion, and the Vet

### 9.1 Getting sick
Every simulated minute, each healthy animal rolls:

```
chance = 0.002                                         // base, ~11% per hour
       * (hunger < 25 ? 2 : 1)
       * (zonePoopCount >= 3 ? 2 : 1)
       * (happiness < 25 ? 1.5 : 1)
       + 0.01 * sickAnimalsInSameZone                  // contagion
```

All values [TUNABLE]. Kept pets out in slots can get sick too; stored pets cannot. Recently cured animals are immune to the same illness for 30 min.

### 9.2 Contagion
- Contagion only happens within a zone (yard or house). Moving healthy animals indoors (Section 12) is a real strategy.
- A sick animal shows symptoms immediately so the player can react.

### 9.3 Effects of sickness
- Cannot be sold or trained.
- Happiness decays 2x.
- Never fatal. A sick animal can stay sick indefinitely without dying.

### 9.4 Illnesses (starter set)

| Illness | Visible symptoms | Correct treatment |
|---|---|---|
| Sniffles | sneezing, drippy nose | Medicine Drops |
| Tummy Trouble | green cheeks, rumbling belly | Soothing Food |
| Itchy Fleas | scratching, tiny bouncing dots | Flea Bath |
| Sore Paw | limping | Bandage |
| Spotty Fever | red spots, thermometer icon | Cool Pack |
| Sleepy Sickness | yawning, Zzz | Vitamin Treat |

### 9.5 Vet Clinic flow
1. From a sick animal's card, tap **Go to Vet**. Pay the **visit fee: 20 coins** [TUNABLE].
2. Clinic scene: animal on the exam table. Player uses exam tools (stethoscope, thermometer, magnifying glass). Each tool reveals one or more symptom clues.
3. Player picks a treatment from a cabinet of 6. Each treatment costs **10 coins** [TUNABLE].
4. Correct → cured animation, animal returns healthy and sellable. Wrong → "Hmm, that didn't work. Look at the clues again." Coins for that treatment are spent; the player can try again.
5. **Free Clinic safety net:** if the player can't afford the visit fee, the visit is free (with a longer 3-minute wait while the animal is "at the clinic"). The game can never get stuck with no money and all-sick animals.
6. Later (Phase 10 polish): "tricky cases" with two illnesses needing two treatments, unlocked at Farmhouse tier.

---

## 10. Keeping Pets, Swapping, Naming, and Outfits

### 10.1 Keeping pets: Pet Slots and Pet Storage
Kept pets work like an inventory. Some are **out** living in your house and yard; the rest are **stored**.

- **Pet Slots:** how many kept pets can be *out* at once. **Start with 2** [TUNABLE]. Buy more with coins (Section 12.5).
- **Pet Storage:** where kept pets go when they aren't in a Pet Slot. Starts with 20 spaces [TUNABLE], expandable with coins.
- **Keep:** any animal can be marked Keep from its card (heart badge). If a Pet Slot is free, it stays out in a slot. If all Pet Slots are full, the game shows the **Swap** screen (below).
- **Swap screen:** shows your Pet Slots on top and Pet Storage below as a grid of pet portraits. The player drags (or taps) to trade: move a pet from a slot into Storage, move a stored pet into a free slot, or directly swap two. A new animal being kept can go straight into a slot (bumping one into Storage) or straight into Storage.
- **Taking a pet out of Storage** needs both a free Pet Slot and room under total capacity (Section 12.2). If there's no room, the button explains why ("Your house is full!").
- **Stored pets are paused:** no hunger/happiness decay, no poop, no sickness, no aging. A pet stored while sick stays sick until it comes out and goes to the vet. Stored pets do **not** count toward total capacity.
- **Pets out in slots** behave like any other animal: they need care, can get sick, can wear outfits, perform tricks, and count toward total capacity.
- **Un-keep:** available on a kept pet that is out. It becomes a normal animal again and can be sold once healthy (its hold timer is almost always already done). Stored pets must be brought out before un-keeping, so selling a favorite always takes a deliberate extra step.
- Pet Storage is opened from a **Pets** button on the HUD and from the Swap screen.

### 10.2 Naming
- Any animal can be named from its card (1–14 characters, profanity filter). Unnamed animals show their species name.
- Names persist through keep/un-keep.

### 10.3 Pet outfits
- Wardrobe slots per animal: **Head** (hats, bows, crowns), **Body** (sweaters, capes, tutus), **Face** (glasses, bandana).
- Purchased with coins from the Home Store's Pet Boutique section. Owned outfits are reusable across animals.
- Outfits are cosmetic only and return to inventory when an animal is sold.

---

## 11. Tricks and Training

- Tricks: Sit, Spin, High-Five, Roll Over, Jump, Dance, Wave, Fetch [TUNABLE list].
- From the animal card, tap **Train** → pick a trick → a short mini-game (Simon-says: the animal shows a sequence of 3–5 arrow/tap cues, the player repeats it).
- A trick is learned after **3 successful sessions** [TUNABLE]. Each animal can train once every **5 minutes** [TUNABLE].
- **Learning a new trick awards 5 gems** [TUNABLE]. Each animal+trick pair pays out only once.
- Max tricks per animal by rarity: Common 2, Uncommon 3, Rare 4, Epic 5, Legendary 6 [TUNABLE].
- Each known trick adds +10% to sale price.
- Daily gem cap from tricks: 40 [TUNABLE; parent-adjustable] so gems keep their value.
- Kept pets can perform known tricks on command (tap → Perform) for a happiness boost and a fun animation.

---

## 12. House, Decorating, Pet Beds, and Capacity

### 12.1 House tiers

| Tier | Cost (coins) | Visitor interval | Base capacity | Interior grid | Lure slots | Max room expansions | Base Lure |
|---|---|---|---|---|---|---|---|
| Cozy Cottage | start | 10 min | 6 | 8×6 | 3 | 2 | 0 |
| Sunny Bungalow | 1,500 | 8 min | 9 | 10×7 | 5 | 3 | 10 |
| Big Farmhouse | 5,000 | 7 min | 12 | 12×8 | 7 | 4 | 20 |
| Grand Manor | 15,000 | 6 min | 16 | 14×10 | 10 | 5 | 30 |

All [TUNABLE]. Upgrading keeps all furniture (moved to inventory if it doesn't fit) and animals. Exterior color can be re-picked free on upgrade and for 50 coins any other time.

### 12.2 Total capacity
```
totalCapacity = houseTier.baseCapacity + roomExpansionsPurchased
```
Counts every animal: yard, house, kept, babies. HUD shows "5/6 🐾".

### 12.3 Decorating the interior
- Interior is a tile grid. Tap **Decorate** to enter placement mode: drag items from inventory, rotate, move, store.
- Categories: Couches & Chairs, Tables, TVs, Portraits & Wall Art, Rugs, Lamps, Plants, Shelves, Wallpaper, Flooring, **Pet Beds**.
- Decor gives a room **Coziness** score that slightly boosts happiness regen for animals indoors.
- Stretch: **Pet Portrait** — snapshot one of your animals and hang it as framed art.

### 12.4 Pet beds and indoor/outdoor rules (from the designer's description)
- Animals live in two **zones**: Yard and House.
- **Indoor slots = number of pet beds placed in the house.** Pet beds do **not** increase total capacity; they only control how many animals can be inside at once.
- Example: capacity 7, 1 pet bed → at most 1 animal indoors; every so often one wanders in and another wanders out. Capacity 7, 7 pet beds → all 7 can be indoors.
- Wander AI: every 60–120 sec [TUNABLE], each animal may decide to switch zones if a slot is available. Kept pets and tired/unhappy animals prefer indoors.
- The player can also drag an animal to the door to move it in or out if a slot is free.
- Bed styles (Basic, Fluffy, Royal) are cosmetic plus a small happiness bonus; each still gives exactly 1 indoor slot.

### 12.5 Extra room, Pet Slots, and Storage (Real Estate shop)
- **Room expansion:** +1 total capacity each. Costs 250, 400, 600, 900, 1300 [TUNABLE]. Limited per tier (see table).
- **Pet Slot:** +1 kept pet out at once. Costs 300, 600, 1000, 1500, 2000, 2500 [TUNABLE].
- **Storage expansion:** +10 Pet Storage spaces. Costs 200, 400, 800 [TUNABLE].

---

## 13. Shops and Avatar

### 13.1 Home Store (coins)
Tabs: Furniture, Pet Beds, Yard & Lures, Food & Treats, Pet Boutique (outfits), Helpers (Scoop Bot, Auto-Feeder).

### 13.2 Real Estate (coins)
House upgrades, room expansions, Pet Slots, Pet Storage expansions, house color change.

### 13.3 Avatar and Boutique (gems)
- Layered, whole-body avatar: body shape (3), skin tone (wide range), eyes, eyebrows, mouth, hair style, hair color, makeup (blush, eyeshadow, lip color, face glitter/paint), top, bottom or one-piece dress, shoes, accessories (hat, glasses, bag, earrings).
- **Starter set is intentionally limited:** about 3 free options per category.
- **Boutique** sells additional items for 10–80 gems [TUNABLE], organized by category with a live try-on preview.
- **Wardrobe** lets the player change outfits anytime for free using owned items; save up to 3 favorite outfits.
- The avatar appears in the world, walking to whatever the player taps for flavor. All interactions work by tapping targets directly; the avatar never has to be manually walked anywhere.

---

## 14. Time Model and Offline Progress

- The simulation uses real wall-clock time with a fixed 1-second tick. All timers are stored as absolute timestamps (e.g., `holdUntil`, `birthAt`, `nextVisitorAt`) so they survive reloads.
- When the tab is hidden or the game is closed, the game treats that time as **offline**. On return, run catch-up **[ASSUMPTION, parent-adjustable]**:
  - Visitor timer keeps running; up to 3 visitors wait at the gate (bounded by free capacity).
  - Pregnancies progress and births happen.
  - Hold timers and baby growth progress.
  - **Needs do not decay, poop doesn't happen, and nobody gets sick while offline.** Coming back should feel like a gift, never a punishment.
  - Catch-up is capped at 8 hours [TUNABLE].
- On return, show a "While you were away…" summary card.
- Dev-only time scale multiplier (1x–120x) for testing (Section 22).

---

## 15. Balance Config (single source of truth)

Claude Code should create `src/config/balance.ts` exporting a typed, frozen object with at least these values. **No gameplay number may be hardcoded elsewhere.**

```ts
export const BALANCE = {
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
  },

  holdMinutes: 20,
  babyGrowMinutes: 20,

  needs: {
    hungerDrainMinutes: 30,
    happinessDrainMinutes: 40,
    bowlServings: 5,
    hungryThreshold: 50,
    petHappinessGain: 15,
    petCooldownSeconds: 20,
    crowdedHappinessDrainMultiplier: 1.5,
  },

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
  },

  vet: { visitFee: 20, treatmentCost: 10, freeClinicWaitMinutes: 3 },

  care: { minMultiplier: 0.8, maxMultiplier: 1.3, windowMinutes: 10 },

  tricks: {
    sessionsToLearn: 3,
    cooldownMinutes: 5,
    gemsPerNewTrick: 5,
    salePriceBonusPerTrick: 0.10,
    maxByRarity: { common: 2, uncommon: 3, rare: 4, epic: 5, legendary: 6 },
    dailyGemCap: 40,
  },

  wander: { minSeconds: 60, maxSeconds: 120 },

  offline: { maxCatchUpHours: 8, maxGateQueue: 3 },

  houseColorChangeCost: 50,
} as const;
```

### 15.1 Pacing sanity check (starter Cottage, lure 0)
- Average base value per visitor ≈ 49 coins. Expected babies per visitor ≈ 0.30 × 2.38 ≈ 0.71.
- ≈ 1.7 sellable animals per 10 minutes ≈ 85 coins / 10 min ≈ 500 coins/hour before spending.
- First house upgrade (1,500) ≈ 3–4 hours of play. Manor is a multi-week goal. Tune after playtesting.

---

## 16. Art and Audio Direction

### 16.1 Visual style
- 2D, top-down 3/4 perspective, depth-sorted by Y. Soft pastel palette, rounded chunky shapes, thick soft outlines, big eyes. Cozy, bright, readable at iPad size.
- Inspired by the *feel* of Animal Crossing; **no copyrighted characters, assets, or likenesses**.

### 16.2 Art pipeline (practical for Claude Code)
- **Parametric SVG characters.** Each species is defined as SVG part templates (body, head, ears, tail, pattern, eyes) with named color slots. Color variants and Sparkle are palette swaps. Rendered to textures at load time. This gives lots of visual variety from little art and is something Claude Code can author directly.
- **Avatar** uses the same approach: layered SVG parts per slot, color-tinted.
- **Animation via tweens**, not frame-by-frame: idle breathing (scale Y), hop-walk (bounce + squash/stretch), wobble on reveal, hearts/sparkles as particles. Cheap and very cute.
- All art referenced by asset keys through a manifest (`src/assets/manifest.ts`) so placeholder art can be swapped for commissioned or hand-drawn sprite sheets later with no logic changes.
- Phases 1–9 use clean placeholder art (simple shapes + species label). Phase 10 is the art pass.

### 16.3 Audio
- Gentle looping background music (separate yard and house tracks), mute toggle, volume sliders.
- SFX: mystery reveal pop, coin jingle, poop-clean sparkle, sneeze, baby squeak, trick success, purchase.
- Audio unlocks on first user tap (required on iOS Safari).
- Use royalty-free/CC0 audio only; record license in `docs/CREDITS.md`.

---

## 17. UX and Screens

### 17.1 Screen list
1. Profile Picker
2. Onboarding: Username → Avatar Creator → House Color → Tutorial
3. **World** (Yard ⟷ House toggle) — main screen
4. Animal Card (bottom sheet / side panel)
5. Vet Clinic
6. Training mini-game
7. Home Store (coins)
8. Real Estate (coins)
9. Boutique (gems)
10. Wardrobe (avatar) and Pet Wardrobe
11. Decorate mode (overlay on House)
11b. Pet Storage and Swap screen
12. Animal Dex (collection of discovered species/variants) — **suggested addition** that fits the mystery theme
13. Settings
14. Parent Mode (PIN-gated)
15. "While you were away" summary

### 17.2 HUD (always visible in World)
Coins, gems, capacity (5/6), Pet Slots in use (2/2 ♥), next-visitor countdown, and buttons: Yard/House toggle, Pets (storage), Shop, Real Estate, Wardrobe, Dex, Settings.

### 17.3 Animal Card contents
Portrait with outfit, name (tap to edit), species, rarity stars, badges, three need bars, hold countdown or "Ready to sell!", price estimate, known tricks, and action buttons: Feed Treat, Train, Dress, Vet (if sick), Keep/Un-keep, Sell. Disabled buttons show a short reason when tapped ("Too sick to sell").

### 17.4 Notifications (in-game toasts, no push notifications)
"A mystery visitor is here!", "Biscuit had 3 babies!", "Oh no, Pip looks sick", "Mochi is ready to sell!", "Your yard is crowded!".

### 17.5 Accessibility and kid UX
- Minimum touch target 48×48 CSS px. No hover-only interactions. Everything works with tap, tap-and-hold, and drag.
- Icon + short text on every button. Large default font (≥18px body).
- Rarity by stars and color. Respect `prefers-reduced-motion`.
- No timers that punish a kid for leaving. No ads. No external links outside Parent Mode.

---

## 18. Technical Architecture

### 18.1 Stack
| Concern | Choice |
|---|---|
| Language | TypeScript (strict) |
| Build | Vite |
| World rendering | Phaser (latest stable) — WebGL with Canvas fallback |
| UI overlays (menus, shops, cards) | React + CSS Modules, rendered in DOM above the canvas |
| State bridge | Tiny event-emitter/store adapter (or Zustand) subscribing to the sim |
| Persistence | IndexedDB via `idb-keyval`; versioned schema with migrations |
| Offline/install | PWA via `vite-plugin-pwa` (manifest, service worker, landscape) |
| Unit tests | Vitest |
| E2E / smoke | Playwright incl. WebKit with iPad viewport emulation |
| Lint/format | ESLint + Prettier |
| Hosting | Public static host with HTTPS and a custom domain (GitHub Pages, Netlify, or Cloudflare Pages). HTTPS is required for PWA install. |
| Fonts | Self-hosted in the build (no Google Fonts CDN), so the game makes no third-party requests |

### 18.2 Core principle: headless simulation
```
+-------------------+       commands        +--------------------+
|  React UI (DOM)   | --------------------> |                    |
|  Phaser scenes    |                       |   GameSim (pure TS) |
|  (render only)    | <-------------------- |   - state           |
+-------------------+   events + snapshots  |   - rules / tick    |
                                            |   - seeded RNG      |
                                            +---------+----------+
                                                      |
                                              SaveManager (IndexedDB)
```
- `src/sim/` has **zero imports** from Phaser, React, or the DOM. It is deterministic given a seed and a clock, fully unit-testable, and runs identically in tests and in the browser.
- UI never mutates state directly. It calls commands like `sim.sell(animalId)`, `sim.cleanPoop(poopId)`, `sim.vetTreat(animalId, treatmentId)`. Commands validate and return `{ ok: true } | { ok: false, reason }`.
- Sim emits events (`visitorArrived`, `animalBorn`, `animalSick`, `readyToSell`, `coinsChanged`…) that drive animations, toasts, and sounds.
- Clock is injected (`Clock` interface) so tests and the dev time-scale can control time.

### 18.3 Folder structure
```
/
  CLAUDE.md
  docs/ DESIGN.md PROGRESS.md CREDITS.md
  src/
    config/        balance.ts, species.ts, items.ts, illnesses.ts, tricks.ts, avatarItems.ts
    sim/           GameSim.ts, tick.ts, rng.ts, clock.ts,
                   systems/ visitors.ts rarity.ts pregnancy.ts needs.ts poop.ts sickness.ts
                            vet.ts selling.ts keeping.ts tricks.ts wander.ts housing.ts economy.ts offline.ts
                   types.ts
    save/          SaveManager.ts, migrations.ts, schema.ts
    game/          Phaser config, scenes/ (YardScene, HouseScene, VetScene, TrainingScene), sprites/, fx/
    ui/            React components: Hud, AnimalCard, Shops, AvatarCreator, Wardrobe, Dex, ParentMode, Onboarding
    art/           SVG part templates, palettes, renderer
    assets/        manifest.ts, audio/
    dev/           DebugPanel.tsx (dev builds only)
  tests/           unit (Vitest), e2e (Playwright)
```

### 18.4 Saves
- One save per profile, key `profile:<id>`. Autosave every 15 seconds, on `visibilitychange` (hidden), and after any purchase or sale.
- Every save has `schemaVersion`; `migrations.ts` upgrades old saves forward. Never break an existing save.
- **Export / Import backup** in Parent Mode: download a `.json` file; import restores it on the same device (e.g., after clearing browser data). Cross-device sync is out of scope.
- Because the game is public but saves are local, anyone can open the site and each browser gets its own independent saves. No server ever sees game data.
- iPad note: Safari can clear website storage for sites not used in a while. **Adding the game to the Home Screen (PWA) avoids this.** The first-run screen on iPad should prompt a parent to do this.

### 18.5 iPad / touch requirements
- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`, respect safe-area insets, use `100dvh`.
- `touch-action: none` on the canvas; prevent double-tap zoom and pinch zoom in the game area.
- Support viewports from 1024×744 (iPad mini landscape) up to 1366×1024 and large desktop; scale the world with Phaser's FIT mode.
- Target 60 fps on an A13-class iPad; keep texture atlases ≤ 4096 px; cap particles.
- Long-press replaces right-click anywhere it would be used.

---

## 19. Data Model (TypeScript sketch)

```ts
type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
type Zone = 'yard' | 'house';
type Ms = number; // epoch milliseconds

interface SaveFile {
  schemaVersion: number;
  profile: Profile;
  world: WorldState;
  meta: { createdAt: Ms; lastSeenAt: Ms; rngSeed: number; dailyTrickGems: { date: string; earned: number } };
}

interface Profile {
  id: string;
  username: string;
  avatar: AvatarLoadout;
  ownedAvatarItems: string[];
  savedOutfits: AvatarLoadout[];   // up to 3
}

interface AvatarLoadout {
  bodyShape: string; skinTone: string;
  eyes: string; brows: string; mouth: string;
  hairStyle: string; hairColor: string;
  makeup: { blush?: string; eyeshadow?: string; lips?: string; face?: string };
  top?: string; bottom?: string; onePiece?: string; shoes?: string;
  accessories: string[];
}

interface WorldState {
  coins: number;
  gems: number;
  house: { tierId: string; exteriorColor: string; roomExpansions: number; petSlots: number; storageExpansions: number };
  placedItems: PlacedItem[];        // furniture, beds, bowls, lures
  inventory: Record<string, number>; // itemId -> count (unplaced furniture, pet outfits)
  animals: Animal[];                // animals out in the world (yard/house), incl. kept pets in slots
  petStorage: StoredPet[];          // kept pets in storage (paused)
  gateQueue: Visitor[];
  poops: Poop[];
  nextVisitorAt: Ms;
  discoveredDex: string[];          // `${speciesId}:${variantId}`
  settings: GameSettings;
}

interface Animal {
  id: string;
  speciesId: string;
  variantId: string;
  isSparkle: boolean;
  rarity: Rarity;
  name?: string;
  arrivedAt: Ms;
  bornAt?: Ms;                     // set for babies
  holdUntil: Ms;
  grownAt?: Ms;                    // babies become adults
  pregnancy?: { birthAt: Ms; litterSize: number };
  zone: Zone;
  position: { x: number; y: number };
  needs: { hunger: number; happiness: number };
  careHistory: number[];           // rolling samples for careMultiplier
  sickness?: { illnessId: string; since: Ms; atClinicUntil?: Ms };
  immunities: Record<string, Ms>;  // illnessId -> immune until
  isKept: boolean;
  outfit: { head?: string; body?: string; face?: string };
  tricks: { known: string[]; progress: Record<string, number>; nextTrainAt: Ms };
  nextPoopAt: Ms;
  nextWanderAt: Ms;
}

interface StoredPet { animal: Animal; storedAt: Ms }  // on retrieval, shift all timestamps by (now - storedAt) so timers resume where they paused

interface Visitor { id: string; arrivedAtGate: Ms; leavesAt: Ms; revealed: boolean; rolled: Omit<Animal, 'id'> }
interface Poop { id: string; zone: Zone; position: { x: number; y: number }; createdAt: Ms }
interface PlacedItem { id: string; itemId: string; zone: Zone; tile: { x: number; y: number }; rotation: 0 | 90 | 180 | 270; servings?: number }

interface GameSettings {
  offlineProgress: boolean;
  sicknessEnabled: boolean;
  dailyTrickGemCap: number;
  musicVolume: number; sfxVolume: number;
  reducedMotion: boolean;
}
```

Content definitions (`species.ts`, `items.ts`, `illnesses.ts`, `tricks.ts`, `avatarItems.ts`) are plain data arrays with IDs, display names, rarity/cost, and asset keys.

---

## 20. Parent Mode and Safety

- **Parent PIN** (4 digits) set during first run on the device. Required for Parent Mode, deleting profiles, and any "get gems" action.
- Parent Mode features: grant gems (preset packs or custom amount), view recent activity, adjust settings (offline progress, sickness on/off, daily trick gem cap), manage profiles, export/import saves, reset a profile.
- **"Get Gems" button** in the Boutique opens a friendly "Ask a grown-up!" screen with the PIN pad. In core scope, gems are granted by the parent here; no payment code exists in the app. (This is how "buy gems with real money" works without payment processing: the kid asks, the parent decides.)
- No chat, no social features, no personal data collection, no analytics, no third-party trackers, no ads.
- Usernames and pet names pass a local word filter. They never leave the device, so there is no need for unique usernames or server-side moderation.
- **Public hosting, kid audience:** because the site collects nothing and makes no third-party requests, it stays out of COPPA's data-collection territory. Keep it that way: no analytics snippets, no embedded fonts/CDNs, no share buttons. Include a short plain-language Privacy page ("This game stores everything on your device. We don't collect any information.").
- Each device's Parent PIN is set by whoever first opens the game there, so a friend's parent controls gems on their own device.

---

## 21. Build Phases

Each phase: implement → tests pass → `npm run build` passes → manual check → update `docs/PROGRESS.md` → commit. **Do not start the next phase until told.**

### Phase 0 — Foundation
- Vite + TS strict + Phaser + React + Vitest + Playwright + ESLint/Prettier.
- Empty Phaser scene with a React HUD overlay that proves the two layers stack and receive touch correctly on iPad.
- PWA manifest/service worker, landscape lock, "rotate your device" screen, viewport/touch settings from 18.5.
- `balance.ts`, `species.ts` stubs; `Clock` and seeded `Rng` with tests.
- Static deploy pipeline to the public HTTPS host; self-hosted fonts; Privacy page.
- **Done when:** app loads from the public URL on desktop and iPad Safari, installs to Home Screen, a tap on the canvas and on a React button both register, tests run in CI/local.

### Phase 1 — Simulation core (headless)
- `GameSim` with tick loop, command/event API.
- Visitor timer, gate queue, rarity roll with lure formula, species roll with affinity, Sparkle.
- Pregnancy, births (ignore capacity, Crowded state), hold timer, baby growth.
- Capacity math, selling with price formula (care/tricks multipliers stubbed at 1.0), coins.
- Save/load with schemaVersion, offline catch-up rules from Section 14.
- **Done when:** Vitest covers every rule above including edge cases (litter of 5 at capacity, visitor leaving gate, offline catch-up cap, save round-trip). A CLI/test harness can simulate 3 hours in < 1 second and print an economy summary.

### Phase 2 — First playable yard
- YardScene with placeholder art, house exterior in chosen color (default color for now), gate.
- Mystery visitor silhouette, tap to reveal with animation, animals wander (Y-sorted).
- Animal Card with badges, hold countdown, Sell button; HUD with coins, capacity, next-visitor timer.
- Toasts for sim events.
- **Dev Debug Panel** (dev builds only): time scale 1x–120x, spawn visitor now, force rarity/species/sparkle, force pregnant, add coins/gems, advance time N minutes.
- Default profile auto-created (real onboarding comes in Phase 8).
- **Done when:** the core loop (visitor → reveal → babies → wait → sell → coins) is playable on iPad and desktop.

### Phase 3 — Care
- Hunger/happiness needs and decay, food bowls with servings and tap-to-refill, treats (coins).
- Poop spawning and tap-to-clean; zone cleanliness.
- Tap-and-hold petting; care multiplier wired into sale price.
- Naming animals.
- **Done when:** neglect visibly lowers sale price; caring raises it; tests cover need math and multipliers.

### Phase 4 — Health and Vet
- Sickness roll, multipliers, contagion within zone, immunity window, sick visuals/symptom icons.
- Vet Clinic scene: visit fee, exam tools revealing clues, treatment cabinet, correct/wrong outcomes, Free Clinic safety net.
- Sick animals blocked from sale/training.
- **Done when:** a player can diagnose and cure all 6 illnesses; tests prove the game can't get stuck at 0 coins with sick animals.

### Phase 5 — Keeping, Pet Storage, and Collection
- Keep / Un-keep, Pet Slots (start 2), Pet Storage (start 20), Swap screen with drag-and-tap trading between slots and storage.
- Paused state for stored pets, with timestamp shifting on retrieval.
- Capacity checks when bringing a pet out.
- Animal Dex screen (discovered species/variants, silhouettes for undiscovered).
- **Done when:** all rules in Section 10.1 are unit tested, including: keeping with full slots, storing a sick pet, retrieving with no capacity, and timers resuming correctly after long storage.

### Phase 6 — House interior and Decorating
- HouseScene with interior grid, Yard ⟷ House toggle.
- Decorate mode: place/move/rotate/store items; wallpaper and flooring.
- Home Store (coins): furniture, pet beds, bowls, yard lures, treats.
- Pet bed indoor-slot rules and wander AI (Section 12.4); drag animal to door.
- Yard lure placement with lure slots; Lure Score and affinities feed the rarity roll.
- Coziness score affects indoor happiness.
- **Done when:** the 1-bed and 7-bed examples from 12.4 behave exactly as described; contagion respects zones.

### Phase 7 — Progression
- Real Estate shop: house tier upgrades (interval, capacity, grid, lure slots, base lure), room expansions, Pet Slot purchases, Pet Storage expansions, house color change.
- Upgrade flow preserves animals and moves non-fitting furniture to inventory.
- Scoop Bot and Auto-Feeder helpers.
- **Done when:** all four tiers are reachable and each tier's numbers come from `balance.ts`.

### Phase 8 — Profiles, Onboarding, Avatar, Gems, Parent Mode
- Profile picker and multiple profiles.
- Onboarding flow from Section 5 with tutorial.
- Layered avatar renderer, Avatar Creator, Wardrobe with 3 saved outfits, avatar walking in world.
- Boutique (gems) with try-on; starter-limited items.
- Parent PIN, Parent Mode, gem grants, settings, export/import.
- *Tip:* if you want your daughter playtesting sooner, pull a minimal version of this phase forward right after Phase 3.
- **Done when:** a brand new player goes from first launch to their first sale entirely through the real UI.

### Phase 9 — Tricks and Pet Outfits
- Training mini-game (Simon-says), sessions, cooldowns, per-rarity max, gem award once per animal+trick, daily cap.
- Perform trick on kept pets.
- Pet Boutique (coins) and pet wardrobe slots; outfits shown on sprites; returned on sale.
- **Done when:** gems from tricks respect the daily cap; outfits render on every species.

### Phase 10 — Art, Audio, and Polish
- Parametric SVG art for all 20 species, variants, Sparkle; avatar parts; furniture and lures.
- Tween animations, particles, reveal/birth/sale celebrations.
- Music and SFX, audio unlock, volume controls.
- "While you were away" card, tricky two-illness vet cases.
- Performance pass on a real iPad; accessibility pass.
- **Done when:** runs at 60 fps on the target iPad and passes the manual checklist in Section 22.

### Phase 11 — Future (not planned): Real-money gems
Revisit only after the game is complete. Heads-up on what it would take:
- Purchases can't safely live in local-only saves (clearing browser data would erase paid gems), so this requires accounts and a small backend that records purchases, plus Stripe Checkout with webhooks.
- Collecting accounts/payment details from a kid audience brings COPPA, a real privacy policy, parental consent, and refund handling.
- The current design keeps this possible: gems are already a separate currency, and the Boutique's "Get Gems" screen is the natural hook.

---

## 22. Testing Strategy

- **Unit (Vitest):** every sim system, using seeded RNG and a fake clock. Include statistical tests (e.g., 100k rarity rolls within ±1% of expected weights).
- **Economy harness:** script that simulates N hours with a simple bot player and prints coins/hour, time to each house tier, sickness frequency. Run it after any balance change.
- **E2E (Playwright):** smoke flows on Chromium and WebKit with an iPad landscape viewport: load, reveal visitor, sell, open vet, save/reload.
- **Debug panel** (dev only) for time scale and forcing states; stripped from production builds.
- **Manual iPad checklist per phase:** install to Home Screen, touch targets, no accidental zoom, audio after first tap, rotate prompt, reload keeps save, 30 minutes of play without frame drops.
- **Kid playtest:** after Phases 2, 4, 8, and 10, watch your daughter play without helping. Note where she gets stuck or bored; update this doc.

---

## 23. Decisions

| # | Topic | Decision |
|---|---|---|
| 1 | Real-money gem purchases | **Out of the game.** Parent grants gems via PIN (Section 20). Possible future Phase 11. |
| 2 | Saves | **Local only, per device.** No sync. Export/import is just a backup. |
| 3 | Distribution | **Public website** friends can open; no accounts; no data collected. |
| 4 | Offline time | Visitors, pregnancies, and hold timers progress (capped 8h); needs, poop, and sickness pause. |
| 5 | Keeping pets | **Pet Slots** (start 2, buy more) for pets out in the house + **Pet Storage** inventory for the rest; swap between them. |
| 6 | Sell before 20 min | Not allowed; Sell unlocks at 20 min. **[ASSUMPTION]** |
| 7 | Tricks reward | Gems, once per animal+trick, daily cap. **[ASSUMPTION]** |
| 8 | Pet outfits currency | Coins. **[ASSUMPTION]** |
| 9 | Births over capacity | Allowed; yard becomes Crowded and visitors pause. **[ASSUMPTION]** |
| 10 | Death / running away | Never. |
| 11 | Art | Original parametric SVG, 2D. No 3D. |
| 12 | Suggested additions | Animal Dex, Sparkle variants, Free Clinic, Scoop Bot/Auto-Feeder, pet portraits, "while you were away" card. Cut any she doesn't like. |
