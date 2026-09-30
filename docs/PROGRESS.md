# Progress

## Phase 0: Foundation (built 2026-09-27)

### What was built

**Tooling**

- Vite 8 + React 19 + TypeScript 6 (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).
- Phaser 4.2 (the current latest stable major; DESIGN 18.1 says "latest stable").
- Vitest (unit), Playwright (e2e on desktop Chromium plus iPad mini and iPad Pro 11 landscape WebKit), ESLint flat config + Prettier.
- Scripts: `dev`, `build`, `typecheck`, `test`, `e2e`, `lint`, `format`, `format:check`, `icons`.

**Architecture guardrails**

- `src/sim` and `src/config` are typechecked by their own `tsconfig.sim.json` with **no DOM lib**, so browser globals are compile errors there.
- ESLint `no-restricted-imports` blocks Phaser, React, and app layers (`game/`, `ui/`, `save/`, `dev/`) from `src/sim` and `src/config`.
- Both guardrails were checked against a deliberate violation.

**Sim foundations (`src/sim`)**

- `clock.ts`: `Clock` interface, `systemClock`, `FakeClock` (forward-only; for tests), `ScaledClock` (for the future dev time scale; re-anchors on scale change so time never jumps).
- `rng.ts`: seeded sfc32 RNG (splitmix32 seeding) with `next`, `int`, `range`, `chance`, `pick`, `weightedIndex`, `weighted`, and JSON-safe `getState`/`fromState` for saves. A pinned-sequence test guards against accidental algorithm changes.
- `emitter.ts`: tiny typed event emitter (for the sim's events from Phase 1, and the app bus now).
- `types.ts`: `Ms`, `Rarity`/`RARITIES`, `Zone`, `CommandResult`.

**Config (`src/config`)**

- `balance.ts`: every value from DESIGN Section 15, verbatim, deep-frozen at runtime and `as const` typed.
- `species.ts`: data for the full starter roster (see deviations): id, name, rarity, asset key, 3–5 color variants with placeholder colors.

**App shell**

- `index.html` has the exact 18.5 viewport meta, iOS web-app metas, and an apple-touch-icon.
- Full-screen Phaser canvas (`MeadowScene`, FIT scaling, 1280×800 logical world, WebGL with Canvas fallback). Tapping draws a ripple.
- React overlay (`Hud`) layered above the canvas. The overlay is `pointer-events: none` and its widgets opt back in, so taps on empty space reach the canvas and taps on buttons don't. It shows canvas-tap and button-tap counters and a "Send a heart" button that makes the Phaser scene react (UI → world messaging). Coins/gems show `BALANCE` starting values as display-only placeholders.
- Touch: `touch-action: none` on the canvas, `manipulation` elsewhere, Safari `gesture*` pinch blocking, no overscroll/selection/callouts, safe-area insets, `100dvh`. All tap targets are at least 48×48 px (checked by e2e).
- Rotate screen: pure CSS `@media (orientation: portrait)` overlay.
- `prefers-reduced-motion` is respected in CSS and in the scene's tweens.
- PWA via `vite-plugin-pwa`: manifest (`standalone`, `orientation: landscape`), auto-updating service worker precaching the whole game (including Phaser) for offline play, icons (192, 512, maskable 512, 180 apple-touch). Original SVG icon rendered to PNG by `scripts/generate-icons.mjs`.
- Self-hosted Nunito font (Fontsource, Latin subset only, bundled into the build).
- `privacy.html`: plain-language privacy page with the DESIGN Section 20 wording, linked from the HUD.
- Phaser is split into its own chunk (~357 KB gzipped) so game updates don't re-download the engine.

**CI / deploy**

- `.github/workflows/ci.yml`: lint, format check, unit tests, build, and e2e on push/PR; deploys `dist/` to GitHub Pages on push to `main`. Setup steps are in `README.md`.

**Tests**

- 43 unit tests: RNG, clock, emitter, balance/species data integrity (including a 100k-roll ±1% check of the rarity base weights).
- 11 e2e smoke tests × 3 browser configs: loads with HUD over canvas; a canvas tap registers only in the world; a button tap registers only in the UI; 48 px targets; portrait rotate screen; viewport/touch-action; **no requests to other origins**; self-hosted font loads; manifest is installable and landscape; service worker registers (Chromium only); privacy page.

### Defaults chosen (spec left open)

- **Host: GitHub Pages** via GitHub Actions (18.1 lists GitHub Pages, Netlify, or Cloudflare Pages). The build is host-agnostic, so switching later is trivial.
- **Font: Nunito**: rounded, friendly, very legible for kids.
- **Logical world size 1280×800** (16:10), FIT-scaled. It letterboxes slightly on 4:3 iPads with grass-colored bars. Revisit when the Phase 2 yard layout exists.
- **Rotate screen shows on any portrait viewport**, including a tall, narrow desktop window; the text says "screen", not "iPad".
- **Node 24** in CI (`.nvmrc`).
- TypeScript is pinned to 6.0 because typescript-eslint doesn't yet support TS 7.

### Deviations from the spec

- **Species count:** DESIGN 7.1's heading says "Starter species roster (20)", but its table lists **21** species (6 common, 5 uncommon, 4 rare, 3 epic, 3 legendary). `species.ts` follows the table (21). **Needs a designer decision:** keep 21, or name one to cut. Phase 10's "all 20 species" wording has the same issue.
- The Phase 0 HUD (tap counters, "Send a heart") is a temporary test harness to prove the layering, not the real HUD from 17.2. It will be replaced in Phase 2.

### Not verifiable from the dev machine (manual steps)

The Phase 0 "Done when" asks for things that need a real deploy and device:

1. Create the GitHub repo, push, and set Pages source to GitHub Actions (see README), plus an optional custom domain.
2. On the public URL: load it on desktop and in iPad Safari, confirm canvas and button taps register, then **Share → Add to Home Screen** and launch it from the Home Screen.
3. Manual iPad checklist items (DESIGN 22): no accidental zoom (pinch and double-tap), rotate prompt, touch targets.

Everything short of that is verified locally: build, unit tests, and e2e on emulated iPad WebKit and desktop Chromium.

### Known issues

- Playwright's WebKit can't test service workers, so SW registration is only checked on Chromium. iPad install needs the manual check above.
- The service worker only runs in production builds (`npm run build && npm run preview`), not in `npm run dev`.
- The iPad "add to Home Screen so Safari doesn't clear your saves" prompt (DESIGN 18.4) isn't built yet. It belongs with saves/onboarding (Phase 1/8).

## Phase 1: Simulation core (built 2026-09-27)

### What was built

**`GameSim` (`src/sim/GameSim.ts`)**: the headless game. It has a fixed 1-second tick and injected `Clock`, and every random roll goes through the seeded `Rng`, whose state is saved.

- `update()` runs every whole tick up to the clock's time. A gap longer than `time.offlineGapSeconds` counts as offline time.
- `catchUp()` runs offline catch-up and emits `caughtUp` with a summary. The app will call it after loading and when the tab becomes visible again (Phase 2).
- Commands: `revealVisitor(id)` and `sell(id)`. Both return `CommandResult` and never throw on bad ids.
- Queries: `capacity`, `animalCount`, `freeCapacity`, `isCrowded`, `lureScore`, `houseTier`, `msUntilNextVisitor`, `salePrice`, `canSell`, `badges` (New, Pregnant, Baby, Sick, Ready to Sell, Kept), `getAnimal`, and a read-only `state`.
- Events (`src/sim/events.ts`): `visitorArrived`, `visitorSkipped`, `visitorRevealed`, `visitorEntered`, `visitorLeft`, `animalBorn`, `animalGrew`, `readyToSell`, `animalSold`, `coinsChanged`, `crowdedChanged`, `dexDiscovered`, `caughtUp`.

**Systems (`src/sim/systems/`)**

- `rarity.ts`: the Lure Score (house base lure plus placed **yard** lures, capped at 100), the 6.3 weight formula, the species roll with affinity, Sparkle, pregnancy, and litter size.
- `visitors.ts`: the visitor timer, gate queue, tap reveal and 60 s auto-reveal, first-in-first-out admission while there's room, and the 5-minute wave-goodbye.
- `pregnancy.ts`: births at `birthAt` that ignore capacity. Babies keep the mother's color 70% of the time. A Sparkle mother gives each baby a 25% Sparkle chance. Babies are placed near the mother.
- `lifecycle.ts`: `animalGrew` / `readyToSell` fire once when their timestamps pass.
- `housing.ts` (capacity and Crowded), `selling.ts` (price formula, rules, outfits back to inventory), `economy.ts` (integer coins that can't go negative), `animals.ts` (factory and Dex), `timeShift.ts` (shifts every timer; reused by Pet Storage in Phase 5).
- `tick.ts`: the tick order (births, then lifecycle, then the visitor timer, then the gate) and the online/offline runners.

**Content data**: `src/config/items.ts` (the 10 yard lures from 6.5 with lure values and affinities) and `src/config/houseColors.ts` (8 swatches). New tunables in `balance.ts`: `affinity.bonusPerLure`, `pregnancy.birthScatter`, `newBadgeSeconds`, `time.tickSeconds`, `time.offlineGapSeconds`.

**Saves (`src/save/`)**: `schema.ts` (`SaveFile` v1 = `{ schemaVersion, profile, world, meta }`, key `profile:<id>`), `migrations.ts` (a chain of N→N+1 steps; refuses saves that are newer, missing a step, or malformed), `SaveManager.ts` (save/load/delete/list over a `KeyValueStore`, and loading always migrates), `MemoryStore` for tests, and `idbStore.ts` (idb-keyval). None of this is wired into the app yet; that's Phase 2.

**Economy harness**: `src/sim/harness/economy.ts` plus `npm run economy -- [--hours 3] [--seed 1] [--runs 1]`. A bot taps every visitor and sells everything as soon as it can. 3 hours simulate in about 10 ms. Averaged over 50 seeds × 24 h the bot earns **507 coins/hour**, which matches the DESIGN 15.1 estimate of about 500.

**Tests**: 146 unit tests in total (103 new). They cover:

- **Rarity:** the lure worked examples, floors, and clamping; a 100k-roll ±1% check; Lure Score and affinity (yard only).
- **Visitor roll:** Sparkle, pregnancy, and litter statistics.
- **Visitors:** the timer at every tier, reveal and auto-reveal, waiting at capacity, leaving after 5 minutes, admission when a sale frees a spot, first-in-first-out order, and skipping while Crowded.
- **Births:** a litter of 5 at capacity, baby timers, color and Sparkle inheritance, growth, the ready-to-sell event, and the New badge.
- **Selling:** every sale rule and the price formula, capacity math, and coin guards.
- **Offline catch-up:** the queue of 3, the free-capacity bound, births, the 8 h cap, offline progress turned off, and gap detection. A timestamp-shift test catches any timer field that gets forgotten.
- **Saves:** a round trip where save → load → continue equals an uninterrupted game, plus the migration chain and refusal of garbage saves.
- **Harness:** determinism, update-rate independence, 3 hours in under 1 s, and average earnings in the 400–600 coins/hour band.

### Defaults chosen (spec left open) — please confirm or change

1. **Crowded pauses visitors by skipping them.** When the timer fires while over capacity, nobody comes (`visitorSkipped`) and the next timer stays on schedule. When _exactly at_ capacity a visitor still comes and waits at the gate (6.1).
2. **Gate visitors always reveal**, by tap or after 60 s, even with no room. A visitor with no room waits revealed for 5 minutes, so a kid always sees who it was. It's added to the Dex on reveal, even if it later leaves.
3. **Offline visitors** wait unrevealed at the gate. On return, everyone at the gate (including visitors who were already waiting) gets a fresh 60 s auto-reveal and a fresh 5-minute wait, so nobody leaves unseen. Gate visitors don't leave or come in while you're away.
4. **The 8-hour catch-up cap** works by pausing the time beyond 8 hours: every world timer shifts forward by the excess. For example, a hold with 9 h left and 3 days away ends up with 1 h left. With the parent setting `offlineProgress: false`, the whole gap is paused.
5. **Species affinity strength:** every species starts at weight 1 within its tier. Each placed yard lure with affinity for it adds `affinity.bonusPerLure` (1). Example: one Bamboo Grove makes Red Panda 2/5 of Rare rolls instead of 1/4.
6. **Non-Sparkle mothers' babies** roll the normal 2% Sparkle chance (the spec only defines Sparkle mothers).
7. **Pregnant animals can't be sold** ("Babies are on the way!"). This never triggers with the current numbers (3-minute gestation, 20-minute hold); it only guards against future tuning.
8. **Selling admits waiting gate visitors immediately** instead of on the next tick.
9. **Positions** are normalized 0..1 within a zone; scenes map them to pixels.
10. **`offlineGapSeconds` = 300.** This is only a safety net for a missed `visibilitychange`. It is large enough that a frame hitch at the 120x dev time scale isn't mistaken for going offline.
11. **Sim time is tick-aligned.** Commands act at the last processed tick (at most 1 s behind the clock).

### Deviations from the DESIGN 19 sketch

- `Visitor.rolled: Omit<Animal, 'id'>` became `Visitor.roll: VisitorRoll` (species, variant, Sparkle, rarity, litter size). Timers are created when the animal comes in. `Visitor` also has an explicit `autoRevealAt`.
- `house.petSlots` became `house.petSlotsPurchased` (a count of purchases, like `roomExpansions`).
- `meta` also stores `rngState` (for exact resume) and `nextId` (deterministic ids).
- `Profile` is `{ id, username }` for now. The avatar fields arrive in Phase 8 with a v1→v2 migration.
- Every other field for later phases (needs, poop, sickness, outfits, tricks, storage, settings) already exists with defaults, so those phases won't need migrations for them.
- The spec's `offline.ts` lives in `src/sim/tick.ts` (`runOffline`) next to the online runner.

### Known issues

- The save layer isn't connected to the app, and autosave (every 15 s, on hide, and after purchases or sales) isn't built. Both are Phase 2 work.
- Care and trick multipliers are stubbed at 1.0 (as the phase asks). The trick bonus formula is implemented and tested with injected tricks.
- The species-count question from Phase 0 (21 vs 20) is still open.

## Phase 2: First playable yard (built 2026-09-27)

### What was built

**The core loop is playable:** visitor → tap to reveal → walks in → babies → hold timer → sell → coins, on desktop and emulated iPad.

**World (Phaser, `src/game/`)**

- `YardScene` replaces the Phase 0 `MeadowScene`. It's render-only: every frame it reconciles sprites with sim state, and uses sim events only for flourishes (reveal star burst, birth hearts, sale "+45 🪙" and wave goodbye).
- Placeholder art drawn in code: grass, flowers, the path, a fence with an open gate, and the house in the saved exterior color (default Butter).
- `AnimalSprite`: a round critter in its variant color, with a name label and badge icons over its head (🤒 🍼 🪙 ❤️ ✨). Babies are 65% size. Sparkle animals get a twinkling ✦ ring.
- Animals move in three ways: idle breathing, hop-walks, and render-only ambling around their sim position every few seconds. Sprites are depth-sorted by y. Tap targets are 96×120 world px, which is at least 77×96 CSS px on an iPad mini.
- `VisitorSprite`: a wobbling silhouette with a "?" bubble. It pops into the animal with its name and colored rarity stars when revealed, shows "No room!" while waiting, and waves 👋 when it leaves.
- `src/game/layout.ts` holds all world coordinates. It has no Phaser import, so e2e tests use it to find things.
- Reduced motion (the system setting or `settings.reducedMotion`) turns off breathing, ambling, hops, and bursts.

**React overlay (`src/ui/`)**

- **HUD:** coins, gems, and a capacity pill ("5/6", red when Crowded). A visitor pill reads "Next visitor in 4:32", "A visitor is at the gate!" or "Too crowded for visitors". There's also a small Privacy link.
- **Animal Card:** opens when you tap an animal and closes with ✕ or by tapping empty ground. It shows a portrait, name, colored stars and rarity word, Sparkle tag, badge chips, and "Babies coming in", "Grows up in" and "Ready to sell in 12:34" / "Ready to sell!". The Sell button shows the price. When it can't sell yet it looks disabled but still takes taps and explains why ("Not ready to sell yet.").
- **Toasts** (bottom center, max 3, 3.5 s) with the DESIGN 17.4 wording plus: visitor waved goodbye, sold "+price", room again, a "Welcome back!" summary after catch-up, and a save-failed message.
- **Startup screen** while the save loads, and a friendly "Try again" if it can't load. A broken save is never overwritten.

**Session wiring (`src/bridge/`)**

- `GameSession` loads the `default` profile's save (then runs catch-up) or starts and saves a new game.
- It autosaves every `save.autosaveSeconds` (15 s) while visible, when the page is hidden (`visibilitychange`, `pagehide`), and after every sale.
- It runs catch-up when the page becomes visible again. Save failures become a toast instead of a crash.
- `runSession` connects it to requestAnimationFrame and page events. The session lives outside React, so StrictMode can't start two games.
- **The game clock never runs backwards:** it resumes from the later of the device time and the save's last tick. This also carries the dev time scale.

**Sim additions**

- The wander timer (`systems/wander.ts`): every 60–120 s (`wander.*`) each animal picks a new spot in its zone. It's paused offline. Phase 6 adds switching zones at the same moment.
- New events: `changed` (drives React re-renders) and `gemsChanged`. There's also `addGems`.
- `debugCommands.ts` (dev only): spawn a visitor now with forced rarity, species, variant, Sparkle, or litter; add coins or gems; and run online across a clock jump.
- `ScaledClock` gained `startAt` and `jump()`.

**Debug Panel (`src/dev/`, dev builds only)**

- The panel has: time scale 1x/10x/30x/60x/120x, advance +1/+5/+20/+60 min (played with online rules), and spawn visitor with rarity/species/Sparkle/pregnancy choices. It also adds coins or gems, saves now, and starts a new game (deletes the save).
- It loads through `import.meta.env.DEV ? lazy(...) : null`. Production builds contain none of it; an e2e test and a check of `dist/` confirm this.

**Tests**

- **Unit:** 178 in total (31 new). They cover:
  - Wander, the `changed` event, and debug commands.
  - `GameSession`: new game, load plus catch-up, save after sale, hide/visible, autosave, save failures, the clock never going backwards, deleting a save, and the version counter.
  - Countdown formatting, names, and toast wording.
  - A regression test for sale-event ordering (see bugs below).
- **E2E:** 17 tests × 3 browser setups. The Phase 0 tap-counter tests were replaced with real flows:
  - A new game's HUD.
  - Tap a mystery visitor so it walks in.
  - Sell for coins, and the sale survives a reload.
  - A disabled Sell button explains itself.
  - Tapping empty ground closes the card.
  - A litter is born with its toast.
  - Canvas taps reach the world, and card taps don't fall through.
  - Card buttons are at least 48 px.
  - No Debug Panel in production.
  - Tests seed saves straight into IndexedDB and use reduced motion, so animals sit at known spots.

### Bugs found and fixed

- `animalSold` fired before the coins were added, so the save-after-sale saved the old balance. The e2e reload test caught this. The event now fires after the state is final.
- Newborns popped in at adult size: the pop-in animation grew each sprite before its baby size was set.

### Defaults chosen (spec left open)

1. **In-yard movement.** The sim moves each animal to a new spot on its wander timer. Between moves the scene ambles it around that spot, render-only.
2. **Visitors reveal on a single tap.** Animals open their card on tap. Phase 3 adds tap-and-hold petting.
3. **The Animal Card is a right-side panel** (the spec allows a bottom sheet or side panel), so the yard stays visible.
4. **Toasts sit at the bottom center** so they never cover the HUD or the card.
5. **House color:** the first of the 8 swatches (Butter) until onboarding in Phase 8.
6. **One default profile** (`default` / "Player"). Profiles arrive in Phase 8.

### Known issues

- **Needs a real-device check:** playing the core loop on a real iPad and on desktop Safari/Firefox (DESIGN 22 manual checklist). Everything was verified in Chromium and emulated iPad WebKit only.
- Placeholder art: every species has the same round shape, and very dark variants (black kitten, dark otter) hide their eyes. Phase 10 is the art pass.
- Headless test browsers have no color emoji font, so 🪙 renders gray in screenshots. Real iPads and desktops show color.
- A baby's name label keeps the adult position, so it floats a little low under the smaller body.
- The iPad "Add to Home Screen" prompt (DESIGN 18.4) is still not built (planned with onboarding, Phase 8).
- A kept animal never gets a "Ready to sell" toast. That's by design, but Keep itself arrives in Phase 5.

## Phase 3: Care (built 2026-09-27)

### What was built

**Sim (`src/sim/systems/`)**

- `needs.ts`: hunger drains 100 → 0 over 30 min and happiness over 40 min. Happiness drains ×1.5 while Crowded (×2 while sick, ready for Phase 4). Zone cleanliness is `100 − 20 × poops in the zone`.
  - Care samples (the average of the three needs) are recorded once a minute; the last 10 minutes are kept.
  - **`careMultiplier`** maps that average linearly onto 0.8–1.3 and now feeds the sale price. It uses current needs when there are no samples yet.
- `feeding.ts`: an animal with hunger < 50 walks to a bowl in its zone that has food and eats one serving (fills hunger). Tapping a bowl refills it for free. **Treats** cost 5 coins for +30 hunger and +25 happiness; they're refused when the animal is already full or you're short on coins.
- `poop.ts`: every 8–14 min an animal poops at its spot. Tap to clean.
- `petting.ts`: tap-and-hold gives +15 happiness, then a 20 s cooldown.
- `naming.ts`: 1–14 characters (letters in any language, numbers, space, `' . -`). The local word filter (`src/config/wordFilter.ts`) blocks whole words ("Stupid") and fragments anywhere, including leetspeak and spaced-out tricks ("sh1t", "f u c k"). Innocent names that contain a blocked word survive ("Cassie", "Grape", "Cucumber", "Fuku"). An empty name clears it.
- **Offline (DESIGN 14):** needs don't decay, nobody poops or eats, and care sampling pauses. Poop and wander timers that come due while away just roll forward, so there's no pile of poop and no stampede on return.
- `GameSim` gains `refillBowl`, `feedTreat`, `cleanPoop`, `pet`, `rename`, `careMultiplier`, `cleanliness`, `bowls`, and events for eating, bowl empty/refill, treats, petting, poop appear/clean, and rename.
- New content: `src/config/yard.ts` (12×5 yard tile grid, `STARTING_ITEMS` = one food bowl) and the `food_bowl` item.

**Save v2** (`src/save/migrations.ts`): v1 → v2 gives every animal (out or stored) `nextPetAt`, and gives a game with no bowl a full starting bowl. Migration steps now turn any crash into a clean `SaveError`, so a malformed old save can't take the game down.

**World**

- **Food bowl:** the food mound shrinks as it's eaten, and it shows a bouncing "!" when empty. Tap to refill ("nom!" pops when an animal eats; "Full!" if it's already full).
- **Poop:** a little swirl with wavy lines. Tap it for a sparkle and it shrinks away.
- **Petting:** press and hold (450 ms) an animal to pet it, with floating hearts. A quick tap still opens the card. If it's still on cooldown, "💕 Loved that!" shows instead.
- Thought bubbles over animals when hunger < 25 (🍽️) or happiness < 25 (😢), so neglect is visible in the yard, not just on the card.
- Treats show 🍪 and hearts. Long walks (e.g. to the bowl) are capped at 2.5 s.

**Animal Card**

- Food / Happy / Clean bars (green/yellow/orange), a "Press and hold to pet!" tip, and "Care bonus +20%" / "Needs care −20%" next to the price.
- Tap the name (✏️) to rename it. The keyboard-friendly input shows the filter's reason when a name is refused.
- A 🍪 Treat button next to Sell. Refused actions explain themselves.

**Other**

- A "The food bowl is empty! Tap it to refill." toast.
- The session also saves right after treats (a purchase) and renames.
- Debug Panel: "😢 Neglect all" / "💖 Fill all" needs buttons.
- **Economy harness** has `caring` (default: refills, cleans, pets) and `neglect` bots: `npm run economy -- --neglect`.

**Tests**

- **Unit:** 213 in total (35 new). They cover:
  - Decay rates and clamping, Crowded drain, and offline pause.
  - Eating: hungry thresholds, sharing servings, zone-only bowls.
  - Free refill, and treats (cost, cap, refusals).
  - Poop timing and position, cleaning, per-zone cleanliness, and no offline poop.
  - The pet cooldown, the care multiplier mapping, and the sampling window.
  - Neglect vs care pricing, and the naming rules and filter.
  - The v1 → v2 migration, save-after-treat/rename, and caring-vs-neglect bots in the harness.
- **E2E:** 22 tests × 3 browser setups (6 new):
  - Hold to pet (and a hold doesn't open the card).
  - Tapping poop raises Clean.
  - Tapping the empty bowl feeds a hungry animal.
  - A treat costs 5 coins.
  - A neglected Rare sells for 80 with "Needs care −20%".
  - Renaming (unkind names refused), and the name survives a reload.

### Phase 3 "Done when"

- **Neglect lowers the price and care raises it.** The care multiplier runs 0.8× (neglected) to 1.3× (well cared for). Averaged over 30 bots × 24 h, the caring bot earns **~606 coins/hour** (care ×1.25) and the neglectful bot **~478** (×0.98). A unit test and an e2e test both check this.
- **Need math and multipliers are tested:** see the list above.

### Bugs found and fixed

- **First tap landed off target on desktop.** Phaser caches where the canvas sits on the page. In the letterboxed desktop layout its copy was stale after boot, so the first tap landed 64 px off (a probe measured 711 instead of 640). In Phase 2 I wrongly blamed this on Playwright and papered over it in the test helper. Now the game re-reads the canvas position at the start of every press (capture phase) and on resize. The test workaround is gone.
- The e2e suite could silently reuse a hand-started `vite preview` on port 4173 serving an old build. E2E now uses its own port (4317).

### Defaults chosen (spec left open) — please confirm or change

1. **Treat:** 5 coins, +30 hunger, +25 happiness; refused if already full.
2. **One serving fills hunger to 100.** With 5 servings per bowl, a bowl feeds about 5 meals, so with a full yard the kid refills it every 10–15 minutes.
3. **Cleanliness** drops 20 per uncleaned poop in the zone (5 poops = 0).
4. **Care multiplier mapping:** linear, where a 0 average → 0.8, 40 → 1.0, and 100 → 1.3. The average includes zone cleanliness as the third need. One sample per minute; the last 10 samples count.
5. **Pacing drift:** good care pays ~20% above the DESIGN 15.1 estimate (~500/h assumed ×1.0). **Designer call:** keep it (care feels rewarding), or lower `care.maxMultiplier` / base prices.
6. **Starting bowl:** one food bowl in the yard near the house (tile 1,0). More bowls come from the Home Store (Phase 6, default price 40).
7. **Hold to pet = 450 ms.** A quick tap opens the card. A press that drifts more than 28 px is neither.
8. **Visible neglect cues:** thought bubbles when hunger or happiness < 25 (render-only threshold).
9. **Word filter:** a local list in `src/config/wordFilter.ts`. Silly-but-harmless words (poop, fart, butt) are allowed as pet names on purpose. Edit the list freely.
10. **Eating is instant.** The animal's hunger fills as it starts walking to the bowl (the walk is at most 2.5 s).

### Known issues

- House bowls, beds, and coziness come with the House in Phase 6. `tickFeeding` already works per zone.
- Headless test browsers can't show color emoji, so 🍽️, 🪙 and friends look gray in screenshots only.
- Real-device check still pending: iPad tap-and-hold feel, and the on-screen keyboard with the rename field.

## Phase 4: Health and Vet (built 2026-09-27)

### What was built

**Content (`src/config/illnesses.ts`)**

- The 6 illnesses from DESIGN 9.4. Each has a yard symptom icon, short visible symptoms, a symptom animation kind, the correct treatment, and clues for each exam tool.
- 3 exam tools (🩺 Stethoscope, 🌡️ Thermometer, 🔍 Magnifying Glass) and a 6-treatment cabinet.
- Adding an illness is a data entry that reuses one of the 6 animation kinds.
- Config tests check that no two illnesses give the same clues through all three tools, so every illness can be diagnosed.

**Sim**

- `systems/sickness.ts`: once per simulated minute, each healthy animal rolls using the exact DESIGN 9.1 formula:
  - Base 0.002, ×2 when hunger < 25, ×2 with ≥ 3 poops in the zone, ×1.5 when happiness < 25.
  - Plus 0.01 for each contagious animal in the same zone.
  - The roll never happens offline, or when `settings.sicknessEnabled` is off.
  - Kept pets out in the world can get sick. Stored pets can't.
  - An immunity (30 min after a cure) protects against that illness. Expired immunities are pruned.
  - Emits `animalSick`.
- **Contagion copies the illness:**
  - One roll decides both whether the animal gets sick and what it gets. A roll in the contagion share catches that neighbor's illness, so an outbreak is all one illness.
  - Everyone rolls against the same snapshot, so an outbreak spreads one step per minute.
- **Effects:** can't sell, can't train (`canTrain` is ready for Phase 9), and happiness drains ×2. Never fatal.
- `systems/vet.ts`:
  - `goToVet`: pays the 20 fee once, or starts the Free Clinic. Going back is free.
  - `vetExamine`: returns the tool's clues and changes nothing.
  - `vetTreat`: 10 coins. The wrong treatment is spent with no effect. The right one cures and gives immunity.
  - Events: `vetVisitStarted`, `clinicReady`, `vetTreated`, `animalCured`.
- **Free Clinic (your choice):** if coins < fee + one treatment (30), the visit and all its treatments are free after a 3-minute wait. On a paid visit, a treatment you can't afford is free too. The wait keeps running offline.
- A sick animal doesn't show the "Ready to sell" badge.
- Economy harness: both bots take sick animals to the vet (25% of the time trying one wrong treatment first). The report adds sickness cases/hour, Free Clinic visits, and vet coins.

**Save v3:** `sickness.visit` ('paid' | 'free') records a check-in, so leaving the clinic or reloading never charges twice. The v2 → v3 migration only bumps the version (nobody could be sick before v3). The game also saves after vet fees and treatments.

**World and UI**

- **Yard:** each sick animal shows its illness's icon (🤧 🤢 🐜 🐾 🌡️ 💤, or 🏥 while waiting at the Free Clinic) and a placeholder animation:
  - A drippy nose and "achoo!"
  - Green cheeks and a wobbly tummy
  - Bouncing flea dots and scratching
  - A pink sore paw and a limp
  - Red spots and a warm glow
  - Droopy eyes and floating Z's
  - All of them hold still with reduced motion.
- **Animal Card:**
  - Shows the symptoms ("Sneezing a lot"), not the diagnosis.
  - A 🩺 "Go to Vet for 20" / 🏥 "Free Clinic" / "Back to the vet" button.
  - A Free Clinic countdown, and "Ready to sell once it's better".
- **`VetScene` (Phaser):** the patient stands on an exam table with 3 big tool buttons. Tap a tool, or drag it onto the patient. It goes over, wiggles, and pops up the clue icons. A drop anywhere else sends it back to the tray. The treatment icon shows over the patient; a cure gets stars and hearts, a wrong one a head-shake and "?". The yard sleeps meanwhile.
- **Clinic panel (React):**
  - Visit type, and a clue notebook listing each clue by tool.
  - A 2×3 treatment cabinet showing the cost ("10 coins each" / "Free").
  - A waiting room with a countdown.
  - "Hmm, that didn't work. Look at the clues again."
  - An "is all better!" screen, and Back to the yard.
- **Toasts:** "Oh no, Pip looks sick!", "The vet is ready to see Pip!", and "Pip is all better!".
- **Debug Panel:** make one or all animals sick (random or chosen illness), cure all, and turn sickness rolls on/off.

**Tests**

- **Unit:** 281 in total (68 new).
  - Every multiplier and its threshold edge.
  - Contagion is same-zone only, and waiting animals aren't contagious.
  - Statistical checks over 100k rolls: base rate, fully neglected rate, all illnesses picked about evenly, contagion copies the illness.
  - One step per minute, immunity and pruning, offline, and turned off.
  - Stored vs kept pets, and the effects of sickness.
  - Fee once, and refusals.
  - Clues change nothing.
  - Each illness is cured by its own treatment and nothing else.
  - A clue-only "detective" diagnoses all 6.
  - Free Clinic rules, and a paid visit where the next treatment can't be afforded.
  - The migration, save-after-vet, and the new toasts.
- **No-stuck proof:** at 0, 1, 5, 10, 19, 20, 25, 29, 30, 31, 45, and 100 coins, six animals (one with each illness) all get cured and sold. At every step the check confirms the next action is affordable. Also a 3-hour neglected game at 0 coins recovers.
- **E2E:** 36 new runs (12 tests × 3 browser setups):
  - The symptom shows, and Sell is refused.
  - Paid visit → clue → wrong treatment → cure → sell.
  - Dragging a tool onto the patient (and not elsewhere).
  - A paid visit survives a reload.
  - The Free Clinic waiting room.
  - The Free Clinic's free cure after the wait.
  - Diagnosing and curing each of the 6 illnesses from the clues in the UI.

### Phase 4 "Done when"

- **A player can diagnose and cure all 6 illnesses:** e2e tests do it in the real UI for each illness, using only the clues shown.
- **The game can't get stuck at 0 coins with sick animals:** the unit tests above.

### Economy (24 h × 30 runs)

- A caring bot has ~9.6 illnesses/day and spends ~310 coins/day at the vet (~13/hour).
- A neglectful bot has ~19/day and spends ~630 (~26/hour).
- Gross earnings are unchanged within seed noise (different seed ranges swing ±40/hour).

### Bugs found and fixed

- **Petting sometimes opened the card instead** (a Phase 3 bug): the hold was timed only by Phaser's game-loop timer, so with slow frames a real 800 ms hold ended before the timer fired. The e2e suite exposed it under full parallel load; a slow iPad could hit it too. On release, the yard now also checks real elapsed time.
- The visitor-schedule unit test depended on seed luck (it failed once sickness rolls shifted the RNG). It now counts Crowded-skipped arrivals too.

### Defaults chosen (spec left open): please confirm or change

1. **Free Clinic** covers the visit _and_ treatments when coins < 30 (fee + one treatment), after a 3-min wait. On a paid visit, a treatment you can't afford is free. (Your answer.)
2. **Contagion gives the neighbor's illness** (your answer); the base-risk share gives a random one.
3. **Specific symptom icons in the yard** (your answer). The card shows symptoms, not the illness name.
4. **Exam is optional:** you can pick a treatment before using any tool.
5. **Waiting at the Free Clinic:** the animal stays in the yard with a 🏥 icon, but isn't contagious while waiting. You can leave and come back.
6. **Immunity** is to the cured illness only (DESIGN 9.1 "the same illness").
7. **Clue texts, symptom icons, and treatment icons** are in `illnesses.ts`: edit them freely.
8. The clinic panel covers the right ~38% of the screen. The scene keeps everything left of that.

### Known issues

- "Tricky cases" (two illnesses at once) are Phase 10 per DESIGN 9.5.6. The sneeze sound is Phase 10 audio.
- Symptom animations are placeholders until the Phase 10 art pass.
- Headless test browsers show some emoji gray (🪙) in screenshots only.
- Real-device check still pending: dragging tools on an iPad, and the clinic panel on iPad mini.

## Phase 5: Keeping, Pet Storage, and Collection (built 2026-09-27)

### What was built

**Sim (`src/sim/systems/keeping.ts`, `dex.ts`)**

- **Slot and storage sizes:** Pet Slots = 2 + purchased, and Pet Storage = 20 + 10 × expansions (buying more is Phase 7).
- **Keep and un-keep:**
  - `keep` puts any animal (sick, pregnant, or a baby) in a free slot. With all slots full it's refused, and the UI opens the Swap screen.
  - `unkeep` only works on a pet that is out; a stored pet has to come out first. The name is kept through all moves.
  - Kept pets still can't be sold.
- **Moving pets:**
  - `storePet`: slot → Storage. A not-yet-kept animal can go straight there too, which keeps it. Storing frees capacity, so a visitor waiting at the gate walks in.
  - `retrievePet`: Storage → a free slot. It needs a free slot and room under capacity ("Your house is full!"). The pet comes out in the yard by the house door.
  - `swapPets`: a slot pet and a stored pet trade places. The count doesn't change, so it works even when the house is full.
  - `keepBumping`: a new pet takes a slot and the bumped pet goes to Storage. It needs Storage space.
- **Paused storage:**
  - Stored pets aren't in `animals`, so they get no decay, poop, sickness, eating, births, or aging. Offline catch-up doesn't touch them either.
  - On retrieval every timer shifts by (now − storedAt), using the existing `shiftAnimal`: hold, growth, pregnancy, poop, wander, petting, training, the Free Clinic wait, and immunities.
  - A pet stored sick comes back sick, and a paid vet visit is still paid.
- **Events:** `petKept`, `petUnkept`, `petStored`, `petRetrieved`. The game saves right after each one.
- `dexProgress`: per species it tracks whether it's discovered, the variants found, and the Sparkle, plus totals.
- **No save migration was needed:** every field already existed in the v1 schema.

**UI**

- **HUD:**
  - A ♥ Pet Slots pill ("1/2").
  - 🐾 Pets and 📖 Dex buttons, bottom-left.
- **Animal Card:**
  - ❤️ "Keep as my pet". With full slots it opens the Swap screen with this animal as the new pet.
  - Kept pets get 📦 Store and 💔 Un-keep instead.
- **Pets (Swap) screen:**
  - Pet Slots on top, empty slots dashed, and a Storage grid with counts.
  - Tap a pet, then tap where it goes, or drag it there. Drag uses pointer events, so it works with touch or a mouse.
  - A "Keeping Newbie!" banner when a new pet arrives with the slots full.
  - Friendly success and refusal messages.
- **Animal Dex:**
  - The species grouped by rarity, with a count of animals found and of colors and Sparkles found.
  - Found species show their color, the name, variant dots (dashed for not found yet), and a Sparkle star.
  - Undiscovered species show a silhouette, "???", and their rarity stars (your choice).
- **Yard:** a pet going into Storage floats "📦 Resting" and fades out; a pet coming back pops out of the house door.
- **Debug Panel:** no new controls. `debugAddStoredPets` fills Storage with random kept pets.

**Tests**

- **Unit:** 311 in total (30 new). They cover every DESIGN 10.1 rule, including:
  - Keeping with full slots.
  - Storing a sick pet: nothing progresses while stored, it comes out still sick, and the paid visit carries over.
  - Retrieving with no room under capacity, or while Crowded, is refused, while a direct swap still works.
  - Timers resume exactly after 30 days in storage (every timer is checked).
  - A pregnant pet gives birth on schedule after coming out.
  - Storage full, storing freeing capacity for a waiting visitor, un-keeping a stored pet refused, and names kept.
  - Offline catch-up and save/reload leave stored pets untouched.
  - Dex counts, and the save after storing.
- **E2E:** 21 new runs (7 tests × 3 browser setups):
  - Keep from the card.
  - Keep with full slots: bump a pet, or send the new one straight to Storage.
  - Drag a stored pet onto a slot pet to swap.
  - Taking a pet out with the house full says "Your house is full!", and a swap still works.
  - Storing a pet survives a reload.
  - The Dex shows found animals and silhouettes.

### Phase 5 "Done when"

All DESIGN 10.1 rules are unit tested, including the four named cases: keeping with full slots, storing a sick pet, retrieving with no capacity, and timers resuming after long storage.

### Defaults chosen (spec left open): please confirm or change

1. **Keeping is free and instant.** Any animal can be kept, including sick, pregnant, and babies.
2. **Swapping works even when the house is full**, because the animal count doesn't change. Only taking a pet out into an _empty_ slot needs free capacity.
3. **Pets come out of Storage into the yard by the house door.** Indoor placement arrives with the house in Phase 6.
4. **A pregnant pet in Storage** stays pregnant, and the countdown resumes when it comes out.
5. **The Dex hides names of undiscovered species**, showing a silhouette, "???", and rarity stars (your answer). Variant names show as tooltips only.
6. **The Dex counts 21 species:** the Phase 0 roster question (21 vs 20) is still open.

### Known issues

- **Pet tiles use `touch-action: none` so dragging works on touch.** With a large Storage, scrolling starts from the gaps between tiles. Check it on a real iPad; if it's awkward, the fix is press-and-hold to start a drag.
- Buying Pet Slots and Storage expansions arrives with the Real Estate shop in Phase 7.
- Portraits are colored circles until the Phase 10 art pass.

## Phase 6: House interior and Decorating (built 2026-09-28)

### What was built

**Content (`src/config/items.ts`)**

- **Placeable items:** each has a footprint, an icon, and a placeholder color.
  - The 10 yard lures, with DESIGN 6.5 prices and lure values. Little Pond and Rainbow Fountain are 2×1.
  - The food bowl.
  - 15 furniture items across all 8 DESIGN 12.3 categories. Each has a coziness value and a layer: floor, rug (goes under furniture), or wall (hangs on the wall strip).
  - 3 pet beds: Basic 60 / Fluffy 150 / Royal 400. Each gives +0.25 / +0.5 / +1 happiness a minute.
- **Wallpaper and flooring:** 4 wallpapers and 3 floors. The first of each is a free starter.
- **Prices and coziness are defaults.** Edit them freely.

**Sim**

- **Placement (`systems/placement.ts`):**
  - `buyItem` puts the item in the inventory. Wallpaper and flooring can only be bought once.
  - `placeItem`, `moveItem`, `rotateItem`, `storeItem`, and `applySurface`.
  - The checks: the item goes in the right zone, fits on the grid (house = the tier's interior grid, 8×6 for the Cottage; wall art on a one-row strip; yard 12×5), and doesn't overlap on its layer.
  - Yard lures are limited to the tier's lure slots (3 for the Cottage).
  - Rotating by 90° swaps the footprint's width and height, and rotating skips any turn that doesn't fit. Wall art only turns 180°.
  - The last food bowl can't be put away.
- **Zones (`systems/zones.ts`):**
  - Indoor slots = pet beds placed in the house. Beds add no capacity.
  - `moveAnimalToZone` backs drag-to-door. Going in needs a free bed ("Animals need a pet bed to come inside…"); going out always works.
  - Putting away a bed that's in use sends that animal outside.
- **Wandering (your choice):** when an animal's wander timer fires, it switches zones 25% of the time. Kept pets and unhappy animals (happiness < 50) go in 60% of the time and come out only 10%. Nobody switches while the player is away.
- **Coziness (your choice):** the sum of house decor, wallpaper, and flooring, capped at 100. Indoors, animals regain up to +1.5 happiness a minute from Coziness, plus their bed's bonus. The best bed goes to the first animal inside.
- **Hunger indoors:** a hungry animal with no bowl in its zone walks to a bowl in the other zone. It can always go out; it goes in only if a bed is free.
- **Events:** `animalMovedZone`, `itemBought`, `itemPlaced`, `itemMoved`, `itemStored`, `surfaceApplied`. The game saves after purchases and decorating.
- **Save v4:** adds `house.wallpaperId` and `house.flooringId`. Old saves get the free starters through the migration.

**World and UI**

- **`ZoneScene`:** a shared base for the yard and the house. It handles animals (tap = card, hold = pet, **drag to the door** = go to the other zone), bowls, poop, placed items, and Decorate mode. `YardScene` adds visitors and the house exterior; `HouseScene` draws the walls, floor, and the "🌳 Outside" doormat.
- **Moving between zones:** animals walk out through the door and in from the other side. Dropping an animal away from the door sends it back to its spot. A refused drop floats the reason by the door.
- **HUD menu:**
  - 🏠 House / 🌳 Yard toggle, with beds in use ("🛏️ 1/2").
  - 🐾 Pets, 📖 Dex, 🛒 Store, 🛠 Decorate.
  - Toasts moved up above the menu.
- **Decorate mode:**
  - The camera zooms out (0.8×) so the whole room fits above the tray, and a tile grid shows.
  - Tap a tray item, then a spot; or drag it from the tray into the room. A green or red footprint previews it.
  - Tap a placed item to 🔄 Turn or 📦 Put it away; drag it to move it.
  - The house has a "Walls & Floors" tab.
  - Stats show: yard "🌟 Lure 14 · slots 2/3", house "✨ Cozy 20 · 🛏️ beds 2".
- **Home Store:**
  - Tabs: Furniture, Pet Beds, Yard & Lures, Walls & Floors, Food & Treats.
  - Cards show the price, cozy/lure/affinity/bed info, and how many you own.
  - After buying, "🛠 Place it now" (or "Use it now" for wallpaper and flooring) jumps into Decorate in the right zone.
  - Pet Boutique is Phase 9 and Helpers is Phase 7.
- **Animal Card:** "🏠 Inside the house" / "🌳 Outside in the yard". It closes when Decorate starts.
- **Debug Panel:** "🛏️ Free house kit" and "🌷 Free lures" (`debugGiveItems`).

**Tests**

- **Unit:** 341 in total (30 new).
  - Buying: cost, refusals, and wallpaper once.
  - Placement: bounds on both grids, same-layer overlap only (rugs go under), the wall strip, allowed zones, move, rotation and footprint swap, the lure slot limit (moving a placed lure is fine), and Lure Score and affinity from placed lures.
  - The last food bowl, and wallpaper needing to be owned.
  - Beds as indoor slots, drag-to-door rules, and a bed put away sending its animal out.
  - **DESIGN 12.4 examples:**
    - 1 bed with capacity 7: never more than 1 inside on any tick over 3 hours, at least 5 different animals take turns, and the bed is used most of the time.
    - 7 beds: all 7 fit, and kept pets reach 7 inside on their own.
  - Kept or unhappy animals stay inside about 86% of the time vs about 50% for others; nobody switches offline.
  - **Contagion stays in its zone** with animals indoors (a 40,000-animal statistical check).
  - Coziness sum and cap, the happiness regen maths, bed assignment, the v3 → v4 migration, and hungry animals walking out to eat.
- **E2E:** 27 new runs (9 tests × 3 browser setups):
  - The Yard ⟷ House toggle.
  - Buy a bed, "Place it now", place it.
  - Drag an animal to the door (in with a bed; refused without one).
  - Drag an animal out through the doormat.
  - Drag a lure from the tray into the yard, and the Lure Score goes up.
  - Select, turn, and put away.
  - Buy wallpaper and apply it.
  - The layout survives a reload.

### Phase 6 "Done when"

- **The 1-bed and 7-bed examples behave exactly as DESIGN 12.4 describes:** unit tests check every tick over hours of play (see above).
- **Contagion respects zones:** unit-tested with animals split between yard and house.

### Defaults chosen (spec left open): please confirm or change

1. **Coziness:** gentle regen (your answer). Up to +1.5 happiness a minute at Coziness 100; beds add +0.25 / +0.5 / +1. Happiness drains 2.5 a minute, so a max-cozy room with a Royal bed slightly outpaces it.
2. **Wandering:** now and then (your answer). A 25% chance to switch each wander tick; kept or unhappy animals go in 60% and come out 10%.
3. **Starter catalog:** the furniture, beds, wallpaper, and flooring items and their prices are my picks. Edit `items.ts` freely.
4. **Wall art** hangs on a one-row wall strip above the floor and only turns 180°. **Rugs** go under furniture.
5. **Hungry animals** walk to a bowl in the other zone when theirs is empty, so nobody starves indoors. The house starts with no bowl; a second bowl costs 40.
6. **The last food bowl** can't be put away.
7. **Where animals start:** everyone starts outside. A new game has no beds (the first Basic Bed is 60 coins).
8. **Decorate mode** zooms the room out to fit above the tray. Animals fade and can't be tapped while decorating.

### Known issues

- **Saves before a reload:** a save started immediately before a reload can be cut off. This affects every save trigger, not just decorating; the e2e test waits 300 ms like the existing rename test. Autosave and save-on-hide cover normal play.
- **Real-device checks still needed:**
  - Dragging from the tray into the room.
  - Drag-to-door with a finger.
  - Whether tray items (`touch-action: none`) still let the tray scroll sideways when there are many items.
- **Placeholder art until Phase 10:** furniture is drawn as colored footprints with icons, and the store and tray use emoji.
- **Upgrading the house (Phase 7)** will have to move furniture that doesn't fit into the inventory, as DESIGN 12.1 says.

## Phase 7: Progression (built 2026-09-28)

### What was built

**Sim (`systems/realEstate.ts`, `systems/helpers.ts`)**

- **`upgradeHouse(colorId?)`:** moves to the **next** tier only (your choice), at its `balance.ts` price (1,500 / 5,000 / 15,000).
  - The exterior color can be re-picked for free as part of the upgrade (DESIGN 12.1).
  - All animals and stored pets stay, and anyone waiting at the gate walks in if there's now room.
  - **Everything about the house comes from the tier in `balance.ts`:** visitor interval, capacity, interior grid, lure slots, base lure, and the room limit.
- **`fitItems`:** after an upgrade, every placed item is re-checked against the new house. Items that don't fit go to the inventory, and the last food bowl moves to the first free yard tile instead. Grids only grow with the current tiers, so this is a safety net for edited tiers.
- **Other purchases:**
  - `buyRoomExpansion`: +1 capacity at 250 / 400 / 600 / 900 / 1,300, capped by the tier (2 / 3 / 4 / 5). Upgrading raises the cap; the count and prices carry on.
  - `buyPetSlot`: 6 purchases, 300 → 2,500.
  - `buyStorageExpansion`: +10 spaces, 3 purchases (200 / 400 / 800).
  - `changeHouseColor`: 50 coins.
- **The `realEstate()` query** gives the screen the current and next tiers, the counts, the next prices, and what's maxed out, so the UI hardcodes no numbers.
- **Helpers** (Home Store → Helpers, bought once, kept in the inventory, never placed), your choice:
  - **Scoop Bot** (500) cleans the oldest yard poop once a minute (DESIGN 8.3).
  - **Auto-Feeder** (400) refills every empty bowl, yard or house, once a minute.
  - Both work online only, like the rest of care.
- **Events:** `houseUpgraded` and `realEstateBought`, and `poopCleaned` / `bowlRefilled` now say `by` the helper. Real Estate purchases save right away.
- **Economy harness:** `npm run economy -- --spend` buys each house upgrade as soon as coins cover it plus a 50-coin vet reserve. It reports **hours to reach** each tier (DESIGN 22).
- No save migration: every field already existed.

**UI**

- **🏡 Real Estate** (HUD button) screen:
  - Your house next to the next house, with the changes from `balance.ts` (e.g. "Animals: 6 → 9", "A visitor every: 10 min → 8 min", room size, lure slots, lure bonus).
  - "Upgrade for 1500" opens a "Move in!" step with a free color pick.
  - Extra Room / Pet Slot / Pet Storage cards with counts and prices, or a note when maxed out.
  - House paint swatches at 50.
- **The yard house gets fancier per tier:**
  - Bungalow: a porch roof and flower boxes.
  - Farmhouse: adds a round attic window.
  - Manor: adds towers with purple roofs and a flag.
- **Moving in:** a star and heart burst over the house, plus a "🎉 Welcome to your Sunny Bungalow!" toast.
- **Scoop Bot:** a 🤖 that waits by the fence and zips over to each poop it cleans.
- **Home Store:** a Helpers tab.
- **HUD menu:** six buttons (House, Pets, Dex, Store, Real Estate, Decorate), slightly smaller so they fit on an iPad mini.
- **Debug Panel:** "+10k 🪙".

**Tests**

- **Unit:** 358 in total (17 new).
  - Upgrades go in order at the listed prices, and after **each** upgrade every tier number matches `BALANCE` (interval, capacity, grid, lure slots, base lure, room cap).
  - The new visitor interval applies from the next visitor on.
  - Refusals, and "biggest house already".
  - Animals, stored pets, and indoor animals are all kept.
  - Items that don't fit go to the inventory, and the last bowl is kept.
  - The free repaint on upgrade, and a waiting visitor admitted after an upgrade.
  - Room caps per tier, all Pet Slot and Storage prices, and paint rules.
  - Scoop Bot (the oldest yard poop, once a minute, never the house), Auto-Feeder, and helpers doing nothing unless bought or while away.
- **Done when "all four tiers reachable":** a spending bot moves all the way to the Grand Manor in the unit tests.
- **E2E:** 15 new runs (5 tests × 3 browser setups):
  - Upgrade to the Bungalow with a free Mint color.
  - "Not enough coins yet".
  - Buy a room, a Pet Slot, and Storage, and repaint.
  - The upgrade survives a reload.
  - Buy Scoop Bot and watch it clean a real yard poop (Clean goes 80 → 100).

### Phase 7 "Done when"

- **All four tiers are reachable:** a unit test and the harness show it.
- **Each tier's numbers come from `balance.ts`:** checked after each upgrade.

### Pacing (please look at this)

Averaged over 30 bots × 48 h with `--spend`:

| Tier           | Hours of play to move in               |
| -------------- | -------------------------------------- |
| Sunny Bungalow | **3.5 h** (DESIGN 15.1: "≈ 3–4 hours") |
| Big Farmhouse  | **8.7 h**                              |
| Grand Manor    | **21.4 h**                             |

DESIGN 15.1 calls the Manor "a multi-week goal". The bot is perfect: it taps every visitor instantly and sells the moment it can. A kid will be much slower, but maybe not "weeks" slow. Each upgrade also speeds up earning (more room, faster visitors, rarer animals). **Designer call:** keep it, or raise the Farmhouse and Manor prices in `balance.ts` (e.g. 8,000 and 30,000).

### Defaults chosen (spec left open): please confirm or change

1. **Upgrades go in order** (your answer).
2. **Helpers** (your answer): Scoop Bot 500 (the yard only, one poop a minute) and Auto-Feeder 400 (every empty bowl, once a minute).
3. **The free repaint** is part of the upgrade step, so no save field was needed.
4. **Room expansions carry over when upgrading**, and the per-tier cap (2 / 3 / 4 / 5) counts the rooms already bought.

### Known issues

- House exteriors and Scoop Bot are placeholder art until Phase 10.
- House interiors don't change look per tier beyond the bigger grid (smaller tiles).

## Phase 8: Profiles, Onboarding, Avatar, Gems, Parent Mode (built 2026-09-28)

### What was built

**Content and pure logic**

- **`src/config/avatarItems.ts`:** every DESIGN 13.3 slot (body shape, skin tone, eyes, brows, mouth, hairstyle, hair color, blush, eyeshadow, lips, face paint, top, bottom, one-piece, shoes, hat, glasses, bag, earrings). 94 items: a small free starter set (3–4 per clothing and face category) and Boutique items at 10–80 gems. **Body shapes and all 8 skin tones are always free.**
- **`src/profile/`** (no DOM, unit-tested):
  - Avatar loadouts: equip and unequip, a one-piece replacing the top and bottom and back again, one item per accessory slot, and checking ownership.
  - Usernames: 3–16 letters, numbers, or `_`, through the word filter, and unique on the device regardless of case.
  - The Parent PIN, salted and hashed. **This is a speed bump, not real security:** everything lives on the kid's device.
  - `numberInWords` for the forgot-PIN check, and the activity log (the last 50 events, newest first).
- **`src/art/avatarSvg.ts`:** a layered, parametric placeholder avatar as a pure SVG string. The same renderer drives the Creator and the world.

**Sim**

- `spendGems`, `grantGems` (1–500 per grant), and `updateSettings`.
- `newGame({ houseColor, tutorial })`: a tutorial game sends its first visitor right away and starts with an empty bowl.
- `tutorialNudge`: the first visitor gets a little hungry and poops within 20 s.

**Saves**

- **Save v5:** the profile gets its avatar, owned Boutique items, 3 favorite-outfit slots, and a tutorial step, and the save gets an activity log. The migration gives existing players the starter outfit and marks their tutorial done.
- **Device record** (`device` key, never exported): the profile list and the Parent PIN. An install from before profiles is adopted automatically, and a PIN is asked for once.
- **Backups (`save/backup.ts`):** a JSON file of every profile's save, with no PIN. Importing runs every save through the migrations and rejects anything else.

**App and screens**

- **`Root`** runs the whole app: first-run PIN setup → profile picker → onboarding → the game. Game sessions start from a tap, never from an effect, so StrictMode is safe. The rotate screen now covers every screen.
- **First run:** "Hi, grown-up!" sets the Parent PIN (typed twice).
- **Profile picker:** avatar cards, most recently played first, plus ➕ New player.
- **Onboarding** (DESIGN 5):
  - A nickname ("not your real name").
  - The Avatar Creator with starter items and 🔒 Boutique teasers ("More styles in the Boutique!").
  - The house color on a live cottage preview.
- **Tutorial** (a coach bubble that follows real play):
  1. Tap the visitor.
  2. Fill the empty bowl so it eats.
  3. Clean its poop.
  4. Open its card to see the 20-minute countdown.
  5. "Great job!"

  Skippable (your choice), and the step is saved so a reload resumes.

- **HUD:** the avatar's face (top-left) opens **My Style**; ⚙️ (bottom-right) opens **Settings**.
- **My Style:**
  - **Wardrobe:** owned items only, free changes, 3 favorite outfits.
  - **Boutique:** everything with gem prices, a live try-on, and "Buy X 💎30".
  - **💎 Get Gems:** "Ask a grown-up!" with the PIN, then gem packs.
- **Settings:** less motion, 👥 Switch player, and 🔒 Parent Mode (PIN). "Forgot PIN?" asks the grown-up to type a number written in words (e.g. "forty-seven thousand and six"), then set a new PIN (your choice). Saves are kept.
- **Parent Mode:**
  - Gems: 10 / 50 / 100 or a custom amount (your choice).
  - Recent activity.
  - Game settings: offline progress, sickness on/off, and the daily trick-gem cap (used in Phase 9).
  - Players: rename, 🌱 reset (start their meadow over, keeping their name and look), and delete (not the one playing).
  - 💾 Backups: save a file, and load one (replacing same-id players, after confirming).
  - Change the PIN.
- **World:** the player's avatar stands in the yard and the house and walks toward wherever the kid taps (flavor only, never in the way of taps). It's hidden while decorating.

**Tests**

- **Unit:** 413 in total (55 new).
  - The avatar catalog rules, and the renderer drawing every item without errors.
  - Loadout rules, usernames, the PIN hash, number words, and the activity log cap.
  - The device record adopting an old install, backup round-trips and rejections, and the v4 → v5 migration.
  - Gems (spend and grant limits), settings, the tutorial new game and nudge.
  - The session: create, Boutique purchases, outfits, the tutorial step surviving a reload, activity saved, and nothing saved after stop.
- **E2E:** 36 new runs (12 tests × 3 browser setups).
  - **The "Done when":** a brand-new device goes through PIN → nickname (including a refusal) → avatar → color → the whole tutorial → **its first sale**, entirely through the real UI. Playwright's clock skips the poop wait and the 20-minute hold.
  - A second player, a duplicate-name refusal, skipping the tutorial, and switching players.
  - An old install keeping its coins.
  - Boutique buy and try-on.
  - Wardrobe and favorites.
  - Get Gems (wrong PIN, then the right one).
  - Forgot PIN.
  - Parent Mode: gems, activity, and settings surviving a reload; renaming; saving a backup, editing it, and loading it back; a non-backup file refused.
  - All onboarding screens pass the 48 px touch-target check.
- The old e2e tests now seed a device record (PIN `1234`) and tap their profile in the picker.

### Bugs found and fixed (after Phase 8)

- **The menu buttons covered the Vet Clinic's exam tools.** The HUD menu (and ⚙️) stayed up in the clinic, over the bottom half of the stethoscope, thermometer, and magnifying glass. They now step aside in the clinic, as they already did in Decorate mode. The old vet tests only tapped the _centers_ of the tools, which sit just above the menu, so they missed it. A new e2e test checks every corner of every tool is the game canvas, and that the menu comes back in the yard.

### Phase 8 "Done when"

A brand-new player goes from first launch to their first sale entirely through the real UI. The e2e test above does exactly that on desktop Chromium, iPad mini, and iPad Pro.

### Defaults chosen (spec left open): please confirm or change

1. **Forgot PIN:** a grown-up check (your answer). Type a number written in words, then set a new PIN; saves are kept.
2. **The tutorial can be skipped** (your answer).
3. **Gem packs:** 10 / 50 / 100 + custom 1–500 (your answer).
4. **Tutorial "feed it":** the first visitor arrives a bit hungry next to an _empty_ bowl, so the kid fills it. The spec just says "feeds it"; a treat would have been refused because a new animal is full.
5. **Body shape and skin tone are never sold.**
6. **Usernames are unique per device**, ignoring case, so the picker never shows two the same.
7. **Resetting a player** keeps their name, avatar, and Boutique items, and starts a fresh meadow without the tutorial.
8. **The Parent PIN is asked once on a device** that already had a save from before profiles.
9. **Importing a backup** replaces players with the same id and adds the others. It never includes or changes the PIN.

### Known issues

- The avatar is placeholder art until Phase 10. Its world texture is rasterized through a canvas, because WebKit drew SVG textures at the wrong size.
- The PIN keeps kids out casually but isn't cryptographically strong (see above). Clearing site data resets everything.
- The first tutorial visitor can be pregnant; its babies then sit next to it. That's fine for play, but the e2e test tries each animal for the sale because of it.
- Real-device check still pending: the on-screen keyboard during onboarding and renaming on iPad, and downloading and loading backups in iPad Safari (Files app).

## Phase 9: Tricks and Pet Outfits (built 2026-09-28)

### What was built

**Content**

- **`src/config/tricks.ts`:** the 8 DESIGN 11 tricks (Sit, Spin, High-Five, Roll Over, Jump, Dance, Wave, Fetch), each with an icon and a world animation (`hop`, `spin`, `wiggle`, `roll`, `bow`), plus the five Simon-says cues (← ↑ → ↓ ⭐).
- **Pet Boutique** (`items.ts`, `petOutfit` category, coins), 11 outfits:
  - Head: Party Hat, Big Bow, Flower Clip, Royal Crown.
  - Body: Cozy Sweater, Hero Cape, Tutu, Warm Scarf.
  - Face: Round Glasses, Bandana, Star Shades.
- **Per-species outfit anchors** (`species.ts`: `outfitAnchors`, head/face/body positions and scale). Every species uses the placeholder critter's defaults for now; a species with its own art (Phase 10) just overrides them.

**Sim (`systems/tricks.ts`, `systems/petOutfits.ts`)**

- **`trainSession(animalId, trickId, success)`:**
  - The sim decides every rule; the UI only reports whether the round was won.
  - Blocked when: sick, resting (5 minutes after a _successful_ session), the trick is already known, or the rarity cap is reached (2/3/4/5/6).
  - A mistake changes nothing, so the kid can try again right away (your choice).
  - 3 successes learn the trick. Learning pays **5 gems, once per animal and trick**, up to what's left of today's cap.
  - **The daily cap** (`settings.dailyTrickGemCap`, default 40, adjustable in Parent Mode) counts every animal together. It resets at the player's local midnight (`dayKey`). A capped trick is still learned, just without gems.
- **`performTrick`:** kept pets only, known tricks only, **+10 happiness, no cooldown** (your choice).
- **`dressPet` / `undressPet`:** outfits are **bought once, and any number of animals can wear them** (your choice). One outfit per slot.
- **Events:** `trickPracticed`, `trickLearned` (with gems), `trickPerformed`, `petDressed`. The game saves right after each, and learning a trick goes in the activity log.
- **No save migration:** every field (`animal.tricks`, `animal.outfit`, `meta.dailyTrickGems`, the settings cap) was already there.

**UI**

- **Animal Card:**
  - 🎓 Train and 👒 Dress.
  - For kept pets that know tricks, a row of **Perform** buttons (one per known trick).
  - "Tricks: Spin, Sit (2/4)".
  - Treat and Sell now sit side by side so the taller card still fits on an iPad mini.
- **Training screen:**
  - Pick a trick: icon, name, and stars for progress; learned tricks are ticked; blocked ones explain why when tapped.
  - "💎 N trick gems left today".
  - **Simon says:** the animal hops toward each cue while it lights up (3, then 4, then 5 cues over the 3 sessions), then "Your turn!" on a big plus-shaped pad.
  - Results: "Great job! ⭐⭐☆ … Come back in 5 minutes!" / "Pip learned Sit! +5 💎" / "Almost! … Try again!".
  - Each cue is announced for screen readers.
- **Pet Wardrobe:** Head / Body / Face with the outfits owned, "Nothing", and what's worn. With no outfits yet it links to the 🎀 Pet Boutique.
- **Home Store:** a 🎀 Pet Boutique tab.
- **World:**
  - Outfits are drawn on every animal sprite at its species' anchors. Capes go behind the animal; everything else in front.
  - Performing plays the trick's move, with its icon and hearts.
  - Learning a trick bursts stars.
  - The player's avatar now stops **beside** a tapped spot instead of standing on top of the animal it walked to.

**Tests**

- **Unit:** 437 in total (24 new).
  - The trick list.
  - 3 sessions with 5-minute rests, and mistakes being free.
  - Sick, known, unknown, and **the cap for each rarity**.
  - Separate progress per trick, the +10% price per trick, and stored pets keeping their training timer.
  - Gems once per animal and trick.
  - **The daily cap:** partial payout (3 of 5), zero after that with the trick still learned, shared by all animals, reset at the next local day, and a Parent Mode change.
  - `dayKey` at midnight.
  - Perform: kept pets, known tricks, +10 each time.
  - Outfits: bought once, worn by many, one per slot, take off, not placeable, and **anchors for every species**.
- **E2E:** 21 new runs (7 tests × 3 browser setups):
  - Train Sit through 3 Simon-says rounds of 3, 4, and 5 cues (clock-skipped rests), earning +5 💎.
  - A mistake, then trying again.
  - A capped day: learned, but no gems.
  - Sick can't train.
  - A kept pet performs for happiness.
  - Buy a Party Hat, dress Pip, sell Pip, then the hat is still there for Moss.
  - **All 21 species wearing every kind of outfit with no errors.**

### Phase 9 "Done when"

- **Gems from tricks respect the daily cap:** unit tests (partial, zero, all animals together, daily reset, parent change) and an e2e test.
- **Outfits render on every species:** anchors are unit-tested for every species, an e2e test renders all 21 in outfits without errors, and a screenshot check looked right.

### Deviations from the spec (your choices)

1. **Outfits are bought once, and any animal can wear them.** DESIGN 10.3 says outfits "return to inventory when an animal is sold". Since wearing never uses one up, there's nothing to return: after a sale the outfit is simply still yours. Selling no longer adds worn outfits to the inventory, which would have duplicated them.
2. **Perform: +10 happiness, no cooldown.** It doesn't share petting's cooldown.
3. **A training mistake doesn't start the 5-minute rest.** Only a successful session does.

### Defaults chosen (spec left open): please confirm or change

1. **Simon-says length:** 3 → 4 → 5 cues for sessions 1 → 3 (`tricks.cuesPerSession`). Cues are ← ↑ → ↓ and ⭐.
2. **The daily cap resets at local midnight** on the kid's device. A partly capped trick pays only what's left (e.g. 3 of 5).
3. **Which animals can train:** any animal, not just kept pets (tricks raise the sale price), but not while sick.
4. **Outfit prices** are 30–120 coins (`items.ts`).

### Known issues

- Portraits in the card, training, and wardrobe screens are plain color circles until the Phase 10 art pass (the yard sprites do show the outfits).
- Trick moves are simple tweens; each trick could get its own animation in Phase 10.
- The Simon-says round lives in React, not a Phaser `TrainingScene` as DESIGN 18.3's folder sketch suggests; it keeps all the rules in the sim either way.

---

## Phase 10: Art, Audio, and Polish (built 2026-09-28)

Your choices before starting:

- **Audio:** made in code with Web Audio. It's original, needs no files or licenses, and makes no network calls.
- **Tricky vet cases:** from the Farmhouse tier on, 20% of new sicknesses (tunable) come with two illnesses. Each needs its own right treatment, and there's only one visit fee.
- **Pacing:** stop after the art (step A) for a review, then build the rest (B–F).

### Step A: Art pass (built 2026-09-28)

**Parametric species art (DESIGN 16.2)**

- **`src/config/species.ts`:** every species now has an `art` recipe that picks shared parts:
  - Body shape: round, long, bird, tall, or pony.
  - Head size and width.
  - Ears (long, pointy, floppy, round, fluffy, tufts, pig, gills) and tail (puff, thin, wag, bushy, ringed, curl, feather, flat, fin, flowing, dragon).
  - Nose (button, snout, big nose, pig, beak, bill, smile) and eyes (big, owl).
  - Markings (belly, muzzle, spots, patches, mask, tuxedo, cheek marks, socks, stripes, face disc, tipped ears, bands).
  - Extras (whiskers, cheek pouches, feather wings, bat wings, flippers, spines, wool, horn, horns, mane, tuft, moon mark, webbed feet).
- **Variant colors:** each variant has named color slots (`main`, `light`, `accent`, and optional `dark`), plus optional markings of its own, like a spotted puppy or a calico kitten. These replace `placeholderColor`.
  - Variant ids and their order didn't change, so saves and random picks are unaffected.
- **`src/art/animalSvg.ts`:** builds any species, color, Sparkle, and outfit as one SVG.
  - **Sparkle** is a palette swap: lighter colors, a rainbow shimmer, and glitter twinkles. The world's twinkling stars stay too.
  - **Silhouette** mode draws the dark shape for undiscovered Dex entries.
  - The mystery visitor at the gate stays a generic shape, so nothing is given away before the reveal.
- **Outfit anchors** are now worked out from each species' head and body sizes. Outfits are drawn into the same SVG:
  - Capes go behind the body, and sweaters and tutus under the head.
  - Scarves, face items, and hats go on top.
  - Glasses line up with each species' eyes.
- **`src/art/itemSvg.ts`:**
  - Its own drawing for all 10 lures, 15 furniture items, and 3 beds, sized to the footprint. Rotated items turn their picture.
  - Any future item without a drawing gets a tidy one for its category, so a new item still only needs a data entry.
- **`src/assets/manifest.ts`:** looks up art by asset key. An entry can point at an image URL (`{ kind: 'image' }`), so hand-drawn art can replace any species or item later without changing game logic.

**Wired in**

- **World:** animals, visitors, and placed items draw textures built from the SVG, via `src/game/sprites/svgTexture.ts`.
  - Each texture is built once at 2x for Retina, then shared.
  - The old `critter.ts` and `outfits.ts` placeholder drawings are gone.
  - Status badges sit higher, above taller ears and horns.
- **React:** `PetPortrait` shows a head-and-shoulders picture with the outfit in the Animal Card, Training, Pet Wardrobe, Pets, and Dex screens. This fixes the Phase 9 "plain color circles" issue.
  - The Dex shows each undiscovered species' silhouette with a "?".

**Tests**

- 12 new unit tests (449 in total). They cover:
  - Every species and color drawn plain, as Sparkle, and as a silhouette, with valid SVG whose tags balance, and its colors really used.
  - Every species looks different.
  - Every species in every outfit.
  - Draw order: a cape goes behind the body and a hat on top.
  - Fallbacks for unknown looks, texture keys, and the art origin.
  - Every lure, furniture item, and bed has its own art at every rotation.
  - Every asset key is in the manifest.
- The e2e suite passes unchanged: 226 passed, 2 skipped, across Chromium, iPad mini WebKit, and iPad Pro WebKit.
- The yard, house, and Dex were checked in WebKit screenshots.

### Deviations and defaults (step A): please confirm or change

1. **Textures are built on demand, not all at load.** Building every species, color, and Sparkle up front would be about 180 textures (about 60 MB of GPU memory), which is too much for an iPad. Each look is built the first time it's seen, which takes a few milliseconds.
2. **The avatar is unchanged.** It was already parametric SVG in Phase 8, in the same outlined, soft-color style.
3. **Unchanged:** the food bowl (its sprite shows how much food is left), poop, the Scoop Bot (still an emoji), and the yard and house backgrounds. The spec's art list is species, avatar, furniture, and lures.
4. **Rotated furniture turns its top-down picture** rather than having a separate side view.

### Known issues (step A)

- Sparkle's rainbow shimmer is subtle on dark colors (e.g. a Sparkle black kitten). The twinkling stars still mark it.
- The texture cache never empties during a session. It's limited by how many different looks you see (outfit combinations add some).

### Step B: Animations and celebrations

- **Particle cap** (DESIGN 18.5): at most 90 particles alive per scene (`src/game/fx/budget.ts`). Extra effects are trimmed, never queued.
- **New effects** (`src/game/fx/effects.ts`):
  - Confetti.
  - A coin shower that flies to the HUD's coin counter.
  - A puff of cloud.
  - A pop-in banner.
- **Reveal:** the mystery visitor turns into the animal with a puff and a burst.
  - Rare, Epic, Legendary, and Sparkle finds get confetti.
  - Epic and Legendary get a "Legendary!" banner, and Sparkle gets "✦ Sparkle! ✦".
- **Birth:** hearts, a burst, confetti, and one 🍼 per baby. The babies still pop in.
- **Sale:** "+N 🪙", hearts, and coins that fly to the coin counter (more coins for bigger sales).
- **Tricks:** each of the 8 tricks has its own move:
  - Sit: squish and hold. Spin: two turns. High-Five: lean back and reach, then bounce.
  - Roll Over: a full roll. Jump: squash, stretch, and land.
  - Dance: side-to-side hops. Wave: a tilting wave. Fetch: dash off and trot back.
- **Walking:** the hop-walk now stretches a little on the way up.
- **Reduced motion:** everything fades in place instead of moving.

### Step C: Music and sound (DESIGN 16.3)

- **Made in code with Web Audio** (`src/audio/`): the music and sound data is in `sounds.ts`, and `AudioEngine.ts` plays it. There are no audio files, no licenses, and no network calls.
- **Music:** separate loops for the yard (bright, about 21 seconds) and the house (a slow music box, about 27 seconds). The vet uses the house tune.
  - Tracks change with a short fade when the scene changes.
  - Notes are scheduled a little ahead of time, so the music doesn't stutter if the game slows for a moment.
- **Sounds:** a pop for reveals, coins, a sparkle for cleaning poop, a small silly sneeze, a baby squeak, a cheer for trick success, and a purchase jingle.
  - Also: a fanfare (trick learned, house upgrade, cure), a happy chirp (petting, treats, dressing), a gentle "oops" (wrong treatment, Simon-says mistake), gems, and a note for each Simon-says cue.
  - Each arrow has its own pitch, so the sequence can be learned by ear too.
- **How it's wired:** `bridge/audioBridge.ts` maps sim events to sounds (a pure, tested function) and scenes to music.
  - Sound starts on the first tap, click, or key press, which iOS requires.
  - It pauses while the page is hidden.
  - The same sound can't restart within 70 ms, so a burst of events still sounds nice.
- **Settings** (for kids, no PIN): 🔇 All sounds off, and 🎵 Music and 🔊 Sounds sliders (0–10).
- **Phaser's own audio is off**, so there's only one audio context.
- **Save v6:** `settings.muted` (the migration sets it to off).

### Step D: "While you were away" card (DESIGN 14, 17.1 #15)

- **When it shows:** after at least 5 minutes away (`BALANCE.offline.summaryMinMinutes`), when loading a save or coming back to a hidden page. Never during the first-time tutorial.
- **What it says:**
  - "You were gone 2 hours."
  - Visitors waiting, babies born, babies grown up, and animals ready to sell.
  - "Everyone had a cozy nap" if nothing happened, or "Everything waited for you" if offline progress is off.
  - Always: "Nobody got hungry or sick while you were gone."
- **Toast:** shorter breaks still get the old "Welcome back!" toast; longer ones get the card instead.

### Step E: Tricky two-illness vet cases (DESIGN 9.5 step 6)

- **When:** from the Big Farmhouse on (`trickyCaseMinTier`), 20% of new sicknesses (`trickyCaseChance`) get a second, different illness (`sickness.secondIllnessId`).
  - An illness caught from a neighbor is never tricky.
  - Only the first illness shows in the world and spreads.
- **At the vet:**
  - The card and clinic show both symptoms, and a purple "Tricky case! Two things are wrong" note.
  - Exams show both illnesses' clues. An "all clear" clue only shows if neither illness shows anything.
  - Each right treatment fixes one illness, in either order: "Great, that fixed one thing! One more to go." The clue notebook clears for the one that's left.
  - One visit fee, and each treatment is paid. The Free Clinic works too.
  - The animal becomes immune to both illnesses.
- **Events:** `vetTreated` gains `helped`. The sounds, the vet scene ("1 more!"), and the toast ("A tricky case: two things are wrong") use it.
- **Dev:** the Debug Panel has a 🤒🤒 Tricky button.

### Step F: Speed and accessibility

**Speed**

- **Measured** with `npm run perf`: a busy yard (24 animals, some in outfits or Sparkle, 3 visitors, and 6 poops).
  - 60 fps in iPad mini and iPad Pro WebKit, and 59 in Chromium, on this Mac.
  - With Chromium's CPU slowed 4x: 42 fps. Profiling that shows about 70% of the time is the headless browser's _software_ GPU drawing. The game's own code is under 2% of a frame.
  - A real iPad draws on its GPU, so this should be fine, **but it has to be checked on the device** (checklist below).
- **Changes:**
  - Sprites skip rebuilding their art key unless the look changed.
  - Textures are capped at 4096 px (tested).
  - Particles are capped.
  - Phaser's own audio is off.

**Accessibility**

- **Automated check** (e2e, all 3 browser setups): on the world, Pets, Dex, Store, Real Estate, Settings, Style, Animal Card, and Vet Clinic screens, every control is at least 48×48 and has a name a screen reader can read. Everything passed.
- **Less motion:** the in-game "Less motion" setting now calms the CSS animations too (`data-reduced-motion`), not just the Phaser ones.
- **Keyboard:** a visible focus ring for everything.
- **Sound is never the only cue:** Simon-says cues light up, and all game news also shows as text.

**Tests**

- 491 unit tests (42 new in steps B–F). They cover:
  - The particle budget and texture caps.
  - Notes, patterns, songs, and sound recipes.
  - The event-to-sound map and the audio engine against a fake Web Audio: nothing plays before unlock, mute, the burst limit, music scheduling and stopping, and pausing.
  - The away card and the session showing it.
  - Tricky cases: the tier gate, about 20% frequency, immunity, spreading, merged clues, either order, fees, and the Free Clinic.
  - The v5 → v6 migration.
- 250 e2e runs (2 skipped). New ones:
  - The sound settings save and reload.
  - Audio really starts on the first tap, and a reveal plays notes (Web Audio is watched in the browser).
  - The away card shows, and a quick reload doesn't show it.
  - A full tricky-case cure.
  - The accessibility check and the Less motion attribute.
- The economy harness is unchanged (its bot stays at the Cottage, so no tricky cases).

### Phase 10 "Done when": your turn on the iPad

The spec's "runs at 60 fps on the target iPad and passes the manual checklist in Section 22" needs a real device. Please check each of these:

1. Install to the Home Screen (Share → Add to Home Screen) and launch it from there.
2. **Sound starts after the first tap**: music in the yard, a different tune in the house, and a sneeze when someone gets sick. The Settings sliders and mute work, and the sound stops when you switch apps.
3. Touch targets feel easy, with no accidental zoom (double-tap or pinch) in the game.
4. The rotate prompt shows in portrait.
5. A reload keeps the save. Leave for over 5 minutes and come back: the "While you were away" card shows.
6. **30 minutes of play without frame drops**, including a crowded yard, reveals with confetti, and sales. If it stutters, tell me where.
7. Kid playtest (DESIGN 22): watch her play without helping. Does she like the animals, the sounds, and the celebrations? Where does she get stuck?

### Deviations and defaults (steps B–F): please confirm or change

1. **Music and sounds are made in code** (your choice). They're cute and simple chiptune-style sounds. Tell me if any of them are annoying, too loud, or too quiet.
2. **The vet uses the house music** (the spec only names yard and house tracks).
3. **The away card shows after 5 minutes away.** Shorter breaks keep the small toast.
4. **Tricky cases:** only brand-new sicknesses can be tricky (never caught ones), and only the first illness spreads (your choice). A cure makes the animal immune to both illnesses.
5. **Volume sliders have 11 steps** (Off, 1–10) and sit in the kid's Settings, not behind the PIN.
6. **One save version (v6)** covers the mute switch and the optional `secondIllnessId`.

### Known issues (steps B–F)

- The frame rate on a real iPad is still unchecked (see above).
- I can't listen to the audio from here. The tests check that it plays, stays in range, and never gets too loud, but not how it _sounds_. Please listen and tell me what to change.
- The onboarding e2e test (Phase 8) failed once while the whole suite ran at full speed, then passed 3 times in a row on its own and in the next full run. It's probably timing under load; I'll keep an eye on it.
- The game world itself (the Phaser canvas) can't be read by a screen reader. Everything important also shows in the HTML screens (card, toasts, HUD).

### Bugs found and fixed (after Phase 10)

- **Vet exam tools hid behind the patient.** Animals set their draw depth to their y position every frame (the patient sits at y = 452), but the tools used depths 20 and 30. The tools now draw at 5000, and the one being used or dragged at 5001. That's above any animal and below the effects (10 000). Checked with a screenshot of a tool mid-exam.

---

## Early-game pass (built 2026-09-29)

The start felt slow: after the tutorial the next visitor took 10 minutes, nothing could be sold for 20, and 100 coins bought almost nothing. You picked ideas 1, 2, 3, 4, 6, and 7.

### What was built

**1. A welcome wave of visitors** (`BALANCE.welcome`, `systems/welcome.ts`)

- A new player's first 5 visitors come 2 minutes apart; then the Cottage's usual 10 minutes. With the tutorial, the first comes right away.
- Offline arrivals use up quick gaps too. Skipped visitors (crowded yard) don't.

**2. Sooner first sales**

- The first 3 animals that walk in can be sold after 5 minutes. After that it's the usual 20.
- **This changes decision #6 ("Sell unlocks at 20 min")** for those 3 animals only.

**4. Guaranteed early surprises**

- The new-player visitors get a fixed list of surprises, one each, in order: the tutorial visitor (none), then "expecting babies" (at least 2), then "at least Uncommon".
- If the yard is crowded and a visitor is skipped, the surprise waits for the next one.

**3. Meadow Goals** (`src/config/goals.ts`, `systems/goals.ts`, `GoalsScreen.tsx`)

- **The 8 goals:**

  | Goal                    | Reward |
  | ----------------------- | ------ |
  | Meet 3 mystery visitors | +20 🪙 |
  | Fill a food bowl        | +10 🪙 |
  | Pet animals 5 times     | +15 🪙 |
  | Clean up 3 poops        | +15 🪙 |
  | Give an animal a name   | +5 💎  |
  | Make your first sale    | +10 💎 |
  | Put a lure in the yard  | +20 🪙 |
  | Teach a trick           | +10 💎 |

  Finishing all of them gives a **free Flower Garden and +50 🪙**.

- **Counting:** the sim counts the player's own actions (not Scoop Bot's or the Auto-Feeder's). A lure only counts when placed in the yard.
- **HUD:** a 🎯 Goals button appears after the tutorial. It turns yellow with a pulsing count when something is ready, and disappears once every goal is collected. There's a "Goal done!" toast and sound.
- **Data-driven:** a new goal is a data entry that uses one of the 8 things the sim counts.

**6. Things to find in the yard** (`BALANCE.finds`, `systems/finds.ts`, `FindSprite.ts`, `art/findSvg.ts`)

- A coin (+3), a butterfly (+2), or a lucky clover (+6) appears every 2–4 minutes, starting 5 minutes into a new game. There are at most 2 at once.
- Each floats away after 3 minutes if nobody taps it (no harm done). Tapping one sends coins flying to the counter.
- **Online only:** nothing piles up while away.
- **Placement:** finds draw above animals, so they're always tappable, with an 88 px tap target. They're hidden while decorating.

**7. A daily present** (`BALANCE.dailyGift`, `systems/dailyGift.ts`, `DailyGift.tsx`)

- **When:** on the first play of each local day (not a new player's first day). It waits for the tutorial and the away card.
- **Opening:** tap the wiggling 🎁 to open it.
  - 55%: 30–60 coins.
  - 25%: a yard lure (Carrot Patch, Bird Bath, Toy Basket, or Flower Garden), placed from Decorate.
  - 20%: 5 gems plus 20 coins.
- **Missed days:** skipping days is never punished; it's just one present when you come back.

**Plumbing**

- **Save v7:** `world.welcome`, `goals`, `finds`, `nextFindAt`, and `dailyGift`.
  - The migration treats an existing game as past the quick start. Goals start fresh, the first find comes 2 minutes after loading, and **a present is waiting** (so your daughter gets one on her next play).
- **Saving:** claiming a goal, tapping a find, and opening the present save right away.
- **Unit tests:** `newSim()` in the tests now defaults to no quick start, so tests of other rules keep their plain timings. The quick start has its own tests.

### Pacing effect (please look at this)

Economy harness, perfect bot, 40 seeds:

|                                    | Without quick start | With quick start |
| ---------------------------------- | ------------------- | ---------------- |
| Coins earned in the first 30 min   | 55                  | **473**          |
| Hours to afford the Sunny Bungalow | 3.4                 | **2.35**         |

The start is much busier, as intended. But because the yard fills to capacity about 40 minutes sooner, the Bungalow also comes about an hour sooner, which is below DESIGN 15.1's "≈ 3–4 hours". A real kid is slower than the bot. If it feels too fast, a Bungalow price of about 2,000 (from 1,500) would bring it back. I haven't changed any prices.

### Tests

- **Unit:** 515 in total (24 new). They cover:
  - Visitor gaps: 2 minutes ×5 then 10; plain timings without the quick start; the tutorial visitor right away.
  - Quick holds: 3 at 5 minutes, then 20.
  - Surprises across 30 seeds, including crowded yards, each used once.
  - Goals: counting, helper actions ignored, reward once, lures only in the yard, the all-goals prize, data sanity.
  - Finds: first at 5 minutes, collecting, at most 2, the 3-minute lifetime, about one every 3 minutes, none offline.
  - The daily present: not on day one, once a day, missed days, all 3 kinds of reward really added.
  - The v6 → v7 migration, saving right away, and sounds.
- **E2E:** 256 passed (5 skipped, 3 of them the opt-in `npm run perf`). New:
  - Collect a goal from the HUD.
  - Tap a coin in the yard.
  - Open a present, and it stays opened after a reload.
  - The Goals screen in the accessibility check.
- **Updated:**
  - The new-game countdown now expects 2:00.
  - The Phase 8 onboarding test now reads fresh positions and only taps animals that are ready to sell. The busier yard made its old "tap each saved position" loop fail about 1 time in 9; it now passes 36 of 36.
  - Two statistical economy tests use more seeds (the random stream shifted), and the care-vs-neglect comparison runs without the quick start.

### Defaults chosen: please confirm or change

1. All the numbers above: 5 fast visitors 2 minutes apart, 3 quick sales at 5 minutes, the goal list and rewards, find values and timing, and the present's odds.
2. The present **isn't given on day one** (the tutorial and goals are already a lot), but is given right away to existing saves.
3. **Only yard lures count** for the lure goal. Finds only appear in the yard, not the house.
4. The Goals button sits in the top bar after the Pet Slots pill, and is hidden during the tutorial.

### Known issues

- On this Mac's WebKit, the 🪙 emoji draws as a grey coin. That comes from the device's emoji font (it was already like this in toasts); iPads show a gold coin.
- A find can land on top of an animal. The first tap then collects the find, and the second tap reaches the animal.
- **The tutorial still said "In 20 minutes it's ready for a new home"** after the early-game pass made a new player's first animals ready in 5. The text was hardcoded. It now shows the animal's real wait ("In 5 minutes…", counting down), using `inMinutes()` in `bridge/describe.ts` (unit-tested). The onboarding e2e test checks it.
- **Animals invisible after reloading a save (dev server).** The texture helper kept one shared list of pictures being built for _every_ Phaser game. React StrictMode in dev creates a game, destroys it, and creates another, so the second game waited on the first game's build. The picture then went into the destroyed game's texture store, and the second game was told to use a texture it never got. Animals showed only their names and shadows. It could also happen in a real build if the game is recreated mid-load (e.g. Switch player right after loading). In-progress builds are now kept per game (`svgTexture.ts`). A unit test reproduces it with two fake games, and dev-server screenshots confirm the fix.
- **Pet clothes looked bad (sweater, scarf, tutu, bandana).** They were drawn at one fixed spot and size for every animal: the sweater was a striped oval floating over the body, the tutu a flat disc at the feet, and the scarf and bandana covered the mouth. These four are now drawn to each animal's own shape (`fittedOutfit` in `art/outfitSvg.ts`):
  - **Sweater:** knitted onto the body itself (clipped to its outline), with stripes, a ribbed hem, and a ribbed collar under the chin. The belly and feet show below it.
  - **Tutu:** a two-layer ruffled skirt that flares from the animal's real waist width.
  - **Scarf:** wraps around the neck under the chin, with a dashed knit stripe and a fringed end hanging down.
  - **Bandana:** a polka-dot neckerchief under the chin, with a little knot.

  Hats, glasses, and the cape still use their anchors. Checked on 10 body shapes, plus close-ups. A unit test pins the layering.

- **Poop could hide under the bottom menu.** The yard's usable area ran down to y = 730, but the HUD menu covers the world from about y = 698 on wide screens (measured: 1280×720 and 1920×1080 windows, and it's similar in iPad Safari with its toolbars). The yard now spans y = 430–665 (was 470–730). It uses the empty grass under the fence, so it's almost as tall as before. Saves are unaffected (positions are stored as 0–1). The house floor already stopped at 650. New e2e tests at 1280×720 tap poops in the bottom-left, middle, and bottom-right of both the yard and the house floor, and check that all 3 got cleaned. They failed before the fix: the House button caught the tap. Known: at that widest shape, the name labels under bottom-row animals can still tuck under the menu (the animals themselves stay tappable).

---

## Deployment (fixed 2026-09-29)

- **Live at https://pforce.com/mystery-meadow/** (and https://forcepd.github.io/mystery-meadow/). Every green push to `main` deploys through GitHub Pages (`.github/workflows/ci.yml`).
- **Why nothing had deployed:**
  1. From Phase 7 on, `npm run format:check` failed on an unformatted `docs/PROGRESS.md`, which skipped every later step.
  2. Behind that: one economy test ran past Vitest's 5 s limit on the slower runner (economy tests now get 30 s).
  3. The e2e suite ran on 1 worker, at about 35 minutes.
  4. Two e2e tests depended on page-load speed.
  5. GitHub Pages was never turned on, and the repo was private.
- **What changed:**
  - **CI settings:** CI runs Playwright with 2 workers, 60 s tests, 10 s expects, and a 45-minute job limit. It skips the iPad Pro WebKit project; all 3 projects still run locally.
  - **Repo:** made public (your choice), with Pages set to "GitHub Actions".
  - **Result:** the first green run took about 16 minutes.

---

# Mystery Meadow 3D

## 3D setup (2026-09-30)

- Copied the original project at commit `45d5c05` (github.com/forcepd/mystery-meadow) into this folder as a new local git repo. The original folder and repo are untouched.
- Separate saves: IndexedDB database `mystery-meadow-3d` (the e2e helpers use it too). Backup files keep the `mystery-meadow-backup` format, so a parent can still import an original backup by hand in Parent Mode.
- Renamed to "Mystery Meadow 3D" (title, profile picker, privacy page, PWA name and short name), with its own PWA `id` so it installs separately on an iPad.
- Added `three` and `@types/three`. Nothing uses them yet.
- Checked: `npm test` (519 passed), `npm run build` and `npm run typecheck` pass.
- Decisions and the 3D build plan are in `docs/DESIGN-3D.md`.

## Phase 3D-0: Foundation (built 2026-09-30)

### What was built

**Try it:** add `?3d` to the address (e.g. `http://localhost:5173/?3d`). Without it, the game runs the original Phaser world, unchanged. The 3D code is its own chunk, loaded only with `?3d`, so the default game never downloads Three.js (an e2e test checks this).

**3D world (`src/world3d/`)**

- `World3D.ts` replaces the Phaser game when `?3d` is on:
  - **Rendering:** a WebGL renderer with the pixel ratio capped at 2, soft sun shadows (one 1024 px shadow map), a sky/hemisphere light, and fog so the ground never shows an edge.
  - **Sim wiring:** render only, like the original scenes. Every frame it reconciles with the sim, and taps go to sim commands or the app bus.
  - **Events:** it sends the same bus events as the Phaser world (`canvasTap`, `selectAnimal`, `worldReady`, `sceneChanged`), so the HUD, Animal Card, and toasts work unchanged.
- `coords.ts`: the original 1280×800 layout lies flat on the ground (100 world px = 1 unit; x → X, y → Z). Every spot in `layout.ts` (gate queue, doors, yard, tiles) lines up with the original.
- `CameraRig.ts`: one orbit camera per zone.
  - **Default view:** fitted to the zone like the original screen (house and gate queue at the top, yard down to above the menu, the room's back wall), for any screen shape.
  - **Limits:** from 4° off overhead down to 20° above the ground; zoom 0.3×–1.3×; panning stays over the zone.
  - **Zoom:** zooms toward the point under the finger or cursor.
  - **Reset:** animates the short way around, or jumps with reduced motion.
- `gestures.ts`: pure tap / orbit / pinch / object-press recognizer:
  - A press on an object belongs to it and never moves the camera.
  - On empty ground, a press that lifts within 10 px is a tap; one that moves orbits.
  - Two fingers pinch-zoom and pan. The finger left after a pinch is ignored until lifted.
  - A second finger cancels an object press.
- **Picking:** a raycast against generous invisible hit volumes. If that misses, the nearest object whose middle is within 30 CSS px counts, so far-away and zoomed-out things still get a finger-sized target.
- **Inputs:** mouse wheel and trackpad pinch zoom. The right-click menu is suppressed on the canvas.
- **Placeholders** (`placeholders.ts`, `standIns.ts`) until the real art phases:
  - The yard has a fence with a gate, the path, and the house in the saved exterior color. The room has a floor, a back wall, low side walls, and the doormat.
  - Capsule stand-ins in each variant's main color: babies smaller, Sparkle glowing.
  - Mystery visitors are dark with a "?" bubble and color in when revealed. There's a selection ring and a tap ripple.

**UI**

- `GameCanvas` picks the renderer; `GameCanvas3D.tsx` hosts the 3D world.
- 🎥 **Reset view** button above ⚙️. It only shows once the camera has moved, and hides while decorating and in the Vet Clinic, like ⚙️.
- `window.meadow3d` (`testHooks.ts`) has read-only `projectObject`, `projectWorld`, and `view`, so e2e tests can find things wherever the camera is.
- New app-bus events: `resetView`, `viewChanged`.
- ESLint now also blocks Three.js and `world3d/` imports from `src/sim` and `src/config`.

### Tests

- **Unit:** 555 in total (36 new).
  - **Mapping:** the world ↔ ground round trip.
  - **Default view:** fits the whole yard and room on 4:3, iPad mini, 16:10, 16:9 and 21:9, including every gate slot, yard corner and door.
  - **Camera limits:** polar and zoom clamps, zoom-to-point keeps the point fixed, pan follows the finger and stops at the zone edge.
  - **Reset:** instant, animated the short way around, and interrupted by a new gesture.
  - **Gestures:** every recognizer rule above, and the `?3d` flag.
- **E2E:** 8 new tests × 3 browser setups (22 passed, 2 skipped: no mouse wheel on iPads).
  - Three.js isn't loaded without `?3d`.
  - Tap an animal to open its card, and tap empty ground to close it.
  - Tap the visitor to reveal it and it comes in.
  - Drag to orbit, the reset button appears, taps still hit animals from the new angle, and reset returns home.
  - A drag starting on an animal doesn't move the camera.
  - Wheel zoom.
  - Switch to the house and tap an animal there.
  - Canvas taps are counted, and button taps don't fall through.

### Defaults chosen (please confirm or change)

1. **Taps on empty ground act on release**, not on press (the original closed the card on press). That's what lets a drag on the ground rotate the camera without closing the card first.
2. **Two-finger pan** is included. The plan only mentioned rotate and zoom, but with zoom-to-point, being able to slide the view felt necessary. Reset undoes it.
3. **Orbit speed:** a drag the full height of the screen turns 180°.
4. **Default angle 40°** from overhead, with a narrow 30° lens so the view stays close to the original's flat 3/4 look.
5. **No sky shows even at the lowest angle** (the top of the screen is still 5° below the horizon). A visible horizon can come with the yard art in 3D-1.

### Known issues (planned for later 3D phases)

- **Everything is a placeholder.** The yard art is 3D-1, the animals 3D-2.
- **Not built in 3D yet:**
  - No hold to pet and no drag to the door (3D-3).
  - Bowls, poop, finds, effects and the player's avatar don't show (3D-3 / 3D-5).
  - Decorate mode doesn't work in 3D (3D-4).
- **The Vet Clinic's patient scene isn't built** (3D-5). The panel opens, but there's no patient to examine.
- **Animals don't move in 3D yet.** The sim's wander spots and the render-only ambling come with 3D-2.

## Phase 3D-1: The yard (built 2026-09-30)

### What was built

**Look (`src/world3d/art/toon.ts`)**: the shared 3D style.

- Toon shading in three soft tones.
- A soft dark-brown outline on everything, like the original's thick outlines. It's drawn as an "inverted hull" with welded, smoothed normals, so box corners don't crack.
- Static scenery is built from colored parts merged into one mesh, using vertex colors.

**The yard (`src/world3d/yard/`)**

- **Ground:** rolling grass with soft light and dark patches (`terrain.ts`). It's perfectly flat over the yard, the house, the gate queue and a margin around them, then rises into gentle hills.
- **Path:** the sandy path runs from the gate up past the queue, then winds over the hills into the distance.
- **Fence:** a picket fence with pointed pickets now goes all the way around the yard. The house's front wall takes the place of the fence, so the door opens onto the yard. The gate has tall posts with red caps, and its panel is swung open outward.
- **Around the yard:**
  - Round-canopy and pine trees along the back, sides and front, plus a looser ring on the hills.
  - Bushes behind the fence.
  - Flowers where the original drew them, plus more along the fence and below the yard.
  - 900 grass tufts, drawn as one instanced mesh.
- **Sky:** a sky gradient, puffy clouds, and fog that fades the hills into the horizon.
- **The house** (`house.ts`), rebuilt when its color or tier changes:
  - **Every tier:** walls in the saved exterior color, a gable roof with overhang and chimney, and an arched door with a gold knob and stone step at `HOUSE_DOOR`. It has windows on all four sides, so it looks right from any angle.
  - **Bungalow:** a porch roof and flower boxes.
  - **Farmhouse:** a round attic window.
  - **Manor:** two towers with purple roofs, and a pink flag.
- **Lighting:** a sky/grass hemisphere fill and a warm sun from the upper left, with a 2048 px soft shadow map covering the whole yard.
- **Near-camera fade:** trees, fences and the house dissolve (a 4×4 dither, no transparency sorting) when they're closer to the camera than 60% of the distance to what it's looking at. Low angles and zoomed-in views never have a tree in the way. Animals never fade.

**Camera**: the lowest angle is now 12° above the ground (was 20°), so a sliver of sky and the hills show when you look across the yard.

**Performance**: a full Manor yard with 16 animals draws about 90 draw calls and 210k triangles, including the shadow pass. An e2e test holds it under 150 calls and 300k triangles. To get there:

- Near trees get round canopies; far trees are simpler and cast no shadows.
- Fence posts have fewer rounding segments.
- Tufts have no bases, and the flowers are low-poly with a thinner outline.

`window.meadow3d.stats()` reports the last frame's draw calls and triangles.

### Tests

- **Unit:** 567 in total (12 new).
  - **Terrain:** flat everywhere the game puts things (the yard corners, the door, the tiles, 8 gate slots), with no cliffs in the hills.
  - **Play area kept clear:**
    - Nothing taller than a flower stands in the yard.
    - Gate slots 0–5, the gate gap, and the door spot are free of tall scenery.
    - The fence is present along the top of the yard.
  - **Flowers** are short everywhere.
  - **Merged meshes:** the scenery is at most 11 meshes.
  - **House, every tier × all 8 colors:** centered on the door, just behind the door spot, grander by tier, within its patch, painted the chosen color, and its outline never takes taps or casts shadows.
  - **The near fade** is only on scenery materials.
- **E2E:** 2 new tests × 3 browser setups (28 passed, 2 skipped).
  - An animal right below the house and fence can be tapped, and so can one seen from the lowest angle, past the faded trees.
  - The drawing budget above.

### Defaults chosen (please confirm or change)

1. **A fence all the way around the yard.** The original only drew one along the top, because its sides were the screen edges. The front and side fences sit outside the default view.
2. **The house sits just behind the fence line,** and its front wall takes the fence's place. In the original, the fence was drawn across the bottom of the house.
3. **The lowest camera angle is 12°,** down from 20°, so the sky and hills show.
4. **Scenery fades at 60%** of the camera's distance.

### Known issues

- Headless desktop Chromium in the e2e tests draws the yard on the CPU, so each 3D test there takes 8–16 s (iPad WebKit: about 1–2 s). This is well within the timeouts, and it doesn't affect real devices.
- The house zone's room is still the 3D-0 placeholder (3D-4).
- Scoop Bot, finds, bowls and the house-upgrade sparkle don't show in 3D yet (3D-3).

## Phase 3D-2: Animals and visitors (built 2026-09-30)

### What was built

**3D species (`src/world3d/animals/model.ts`)**

- **Driven by the species data:** every species is built from shared 3D parts chosen by its `art` recipe in `species.ts`, the same data the original's SVG art uses. Adding a species is still data only. The parts:
  - 5 body shapes: round, long, bird (an egg shape), tall, and pony (legs, hooves and a neck).
  - 9 ear kinds.
  - 12 tails, some built as chains of balls and some as smooth tubes.
  - 7 noses.
  - Big shiny eyes, or owl eyes.
  - 12 markings, which bulge out of the body or face a little, like decals.
  - 13 extras: whiskers, cheek pouches, feather wings, bat wings, flippers, spines, wool, horn, horns, mane, head tuft, moon mark, and webbed feet.
- **Colors and Sparkle** come from `paintFor` in `art/animalSvg.ts`, so every variant's colors and Sparkle's lighter glow match the original exactly. Every animal also gets pink blush cheeks.
- **Chibi look:** front-facing, with heads about 8% bigger than the original's. Faces tilt up 18° as if looking up at you, because the camera looks down on the yard and an upright face would be squashed.
- **Caching:** each look (species, color, Sparkle) is one merged mesh plus its outline hull, cached and shared by every animal with that look. The biggest model is under 7,000 triangles.
- **The mystery visitor** is a faceless dark silhouette, one flat color, like the original.

**Actors (`AnimalActor.ts`, `VisitorActor.ts`, `motion.ts`, `Critters.ts`)**

- **Animals, like the original's sprites:**
  - They breathe.
  - Every 2.5–6.5 s they amble within 0.3 units of their home spot with a hop-walk (0.1 up, every 320 ms).
  - They walk to new wander spots at the original's speed, capped at 2.5 s per trip.
  - They turn to face where they're going, then turn back toward the camera (a little off-center) when they stop.
  - Babies are 65% size.
- **Entrances:** animals walk in from the gate when a visitor comes in, and walk in through the door from the other zone. Newborns pop in at their mother and walk to their spot. Pets back from Storage pop out of the door.
- **Exits:** animals walk to the door and shrink through it when going to the other zone. Sold and stored animals float up and shrink away.
- **Tricks:** all 8 trick moves play when a trick is performed. The spin and roll are real 3D turns.
- **Sparkle:** Sparkle animals have 4 twinkling colored stars around them.
- **Grounding:** a soft round shadow under each animal, like the original's, which shrinks while it's up in the air. It costs much less than real shadows.
- **Visitors:**
  - While unrevealed, a visitor wobbles with a "?" bubble.
  - Revealing it pops it into the real animal, with its name and rarity stars in the rarity color ("✦ Sparkle" when it is one), and a "No room!" bubble while it waits.
  - Visitors shuffle along when the queue moves. One that gives up waves 👋 and walks off up the path.
- **Labels are HTML** (Three.js CSS2DRenderer): the name under the feet, badges over the head (🤒 🍽️ 😢 🍼 🪙 ❤️ ✨, at most 2, with the illness's own icon), and the visitor bubbles and titles.
  - They're crisp at any zoom, show color emoji, and the labels layer never takes taps.
  - Only the showing zone's labels appear.
  - This also fixes the original's "baby's name label floats low" issue.
- **Reduced motion:** no breathing, ambling, hops, pops or twinkling; walks jump straight to the spot.
- `standIns.ts` (from 3D-0) is gone.

### Tests

- **Unit:** 583 in total (16 new).
  - **Every species × every variant × Sparkle (130 looks):**
    - The feet are on the ground, at a sensible height and reach.
    - The eyes are on the front.
    - The variant's main color is used, including Sparkle's lighter version.
    - Each is under the triangle budget.
  - **Distinct and shared:** every species has its own shape, and models are shared per look. An unknown species falls back to the bunny.
  - **Mystery visitor:** faceless and one color.
  - **Motion:**
    - Walking speed, with the minimum and maximum trip times, stopping exactly at the target, and the "done" callback firing once.
    - Hop height, and instant walks with reduced motion.
    - A delayed walk doesn't bob before it starts.
    - Heading, amble range and timing, breathing range, and turning the short way around.
    - Every trick starts and ends at rest.
- **E2E:** 5 new tests × 3 browser setups (40 passed, 2 skipped).
  - All 21 species show on screen with their names and no page errors.
  - Badges show, and tapping on a name label still reaches the animal.
  - A visitor goes from "?" to "Fox ★★" and "No room!" in a full yard.
  - A sold animal leaves and its label goes.
  - The house view only shows its own labels.
- **Checked in a browser:** with reduced motion off, animals amble 5–17 px around their spots in 7 s. A 21-animal yard draws about 219k triangles in 40 draw calls.

### Defaults chosen (please confirm or change)

1. **Faces tilt up 18°** and heads are 8% bigger than the original's proportions.
2. **Blob shadows under animals** instead of real sun shadows (cheaper, and like the original). The scenery still casts real shadows.
3. **Labels are always drawn on top,** even when an animal is behind the house (the original did the same).
4. **Standing animals turn back toward the camera.** They still face where they walk.
5. **Blush cheeks on every species,** for cuteness (the original has blush too).

### Known issues

- **A flaky test in the 2D game:** the full e2e run (301 passed) had one failure in the original game's onboarding test (`profiles.spec.ts:61`, desktop Chromium). The tutorial's "feed" step didn't advance within 5 s while the software-rendered 3D tests were running in parallel. It passed 8 of 8 on its own, and it doesn't touch the 3D code. It was already timing-sensitive in the original (see its Phase 8 notes).
- Headless Chrome (in the tests) has no color emoji font, so the 🪙 badge draws gray in screenshots. Real iPads and desktops show color.
- **Coming in 3D-3:** the effects (reveal star burst, hearts, confetti, "+45 🪙", coin shower), sickness looks (sneezes, limp, shiver), hold to pet, and drag to the door.
- **Coming in 3D-5:** pet outfits.
- **Two small looks to tune later:** the baby dragon's wings look a bit spiky up close, and the lamb's wool hides its tail.

## Phase 3D-3: Care and effects (built 2026-09-30)

### What was built

**Care things (`src/world3d/care/`)**

- **Food bowls** (DESIGN 8.2), in the yard and the house, on their tiles:
  - A blue bowl turned on a lathe, with a food mound and kibble on top that shrink as servings are eaten. One cached mesh per fill level.
  - A pulsing pink "!" when empty. It stays still with reduced motion.
  - Tap to refill. Tapping a full bowl says "Full!".
- **Poop** (DESIGN 8.3): a three-scoop swirl with a curl on top and two wavy stink lines. New ones plop in (ones already there when the game loads don't). Tap to clean: a sparkle, and it shrinks away.
- **Finds** (the early-game coin, lucky clover and butterfly):
  - They hover and bob. The coin spins, the clover turns, and the butterfly flaps its wings.
  - Tap one for coins: "+3 🪙" floats up with a sparkle, and coins fly to the counter.
  - One nobody taps floats away. Tap targets are the original's 88 px.
- **Scoop Bot:** a little robot on wheels with a scoop, antenna and visor, parked by the fence left of the gate. It shows once bought. When it cleans a yard poop, it zips over, wiggles, sparkles, and drives back.
- **House upgrade:** a star burst and hearts over the house.

**Pet and carry (`animals/animalPress.ts`)**, like the original:

- A quick tap (on release) opens the card.
- **Holding 450 ms pets:** hearts, or "💕 Loved that!" if it was just petted.
- **Dragging** (past 18 CSS px) picks the animal up. It's lifted and 10% bigger while it follows the finger, and a ring glows at the door, turning green when it's close enough to drop.
- **Drop within the original's door radius:** it goes through (walks out and shrinks through the door). If there's no room, it says why ("…bed…") and walks home.
- **Anywhere else:** it walks home.
- **Cancel** (a second finger, or the browser taking the touch) puts it back down.

**Sickness looks (`animals/symptoms.ts`)**: all 6 of the original's symptoms. The models now report where their eyes, nose, cheeks and paws are (`AnimalModel.anchors`), so each look sits on that species' own face and body.

| Illness look | Drawing                            | Motion               | Words        |
| ------------ | ---------------------------------- | -------------------- | ------------ |
| sneeze       | a drippy blue nose                 | a squash every 2.6 s | "achoo!"     |
| wobble       | green cheeks                       | a rumbly tilt        | "~"          |
| dots         | 6 bouncing flea dots               | a scratch-shake      |              |
| limp         | a puffy pink paw                   | a limp               |              |
| spots        | red spots and a warm, pulsing glow |                      |              |
| zzz          | heavy eyelids                      | slow breathing       | drifting "z" |

With reduced motion, everything stays still and "achoo!" and "z z" stay put.

**Effects (`fx/Effects3D.ts`)**: the original's effects, in 3D.

- **Particles** are billboard sprites (stars, puffs, hearts) and tumbling paper confetti. They share the original's cap (`MAX_PARTICLES` = 90, the same `ParticleBudget`); extras are trimmed, never queued.
- **Floating text** ("+45 🪙", "nom!", "🍼🍼", trick icons, "📦 Resting") and **banners** ("✦ Sparkle! ✦", "Epic!", "Legendary!") are HTML labels with a white outline.
- **Coin showers** are DOM coins that hop up from the spot and fly to wherever the HUD's coin counter really is.
- **The tap ripple** is here now too.
- **Reduced motion:** everything fades in place.
- **Hooked to the same events as the original:**
  - reveal (a puff and burst, confetti for Rare and up, and a banner for Sparkle, Epic and Legendary)
  - birth, sale, storage
  - trick performed and learned
  - pet, treat, eat, refill, clean, find
  - Scoop Bot, house upgrade

**Test hooks:** `window.meadow3d.projectObject` now takes bowls, poops and finds, and `particles()` counts live particles. `tests/e2e/helpers3d.ts` holds the shared 3D e2e helpers.

### Tests

- **Unit:** 594 in total (11 new). They cover every rule of the animal press:
  - tap vs hold, a single pet, "Loved that!", and a late timer still petting
  - the drag slop, and carrying cancelling the hold
  - dropping at the yard and house doors (with the door glow states)
  - dropping away from the door, and a refused move with its reason
  - the slow press-then-drag, and cancel
- **E2E:** a new `world3d-care.spec.ts`, 8 tests × 3 browser setups:
  - An empty bowl's "!", refilling it, and "Full!".
  - Cleaning poop.
  - A coin find (+3 coins, with coins flying).
  - Pet hearts and "Loved that!".
  - Carrying an animal in with a bed and back out from the doormat.
  - No bed: it stays out and walks home, and a drag isn't a tap.
  - The sneeze and sleepy symptoms.
  - The Sparkle reveal banner.
  - It passed 32 of 32 when repeated under load on desktop Chromium, and 72 of 72 repeated 3× across all three browser setups.
- **Full e2e run:** 325 passed and 7 skipped. One 3D test failed only because it read an animal's screen position a frame too early under load, so it now waits for it.

### Defaults chosen (please confirm or change)

1. **A slow press-then-drag still picks the animal up,** even after the hold has petted it. The original ignored movement after a pet. The e2e tests showed a slow "press, pause, drag" otherwise does nothing, which would confuse a kid.
2. **A glowing ring at the door while carrying an animal** (it turns green in range). This is new, to show kids where to drop.
3. **Bowls, poop and finds use real 3D models with outlines** and never fade near the camera.
4. **Butterflies are drawn 1.7× bigger than the other finds,** so they're easy to spot in 3D.

### Known issues

- The room is still the 3D-0 placeholder. Its doormat is brown with no "🌳 Outside" label yet (3D-4).
- Decorate mode (moving bowls and other items, hiding finds while decorating) comes in 3D-4.
- Headless Chrome draws the 🪙 emoji gray (fine on devices).

### Fix after 3D-3: tapping poop (2026-09-30)

- **Bug (reported in play):** tapping poop often opened the animal's card instead of cleaning it.
  - Poop lands where its animal stands, and the animal only ambles about 0.3 units away. The animal's generous tap area covered the poop, and the ray reached the animal's area first.
  - The e2e test missed it because its poop had no animal nearby.
- **Fix:** when a tap lands on several tap areas at once, the one whose on-screen middle is nearest the finger wins. A tap on the poop cleans it, and a tap on the animal's body still opens its card. A find's middle is now the floating find itself, not the ground under it.
- **New e2e test:** two poops right under an animal. Tapping one cleans it, with no card, and tapping the animal opens its card, with the other poop still there.

## Phase 3D-4: House interior and Decorate mode (built 2026-09-30)

### What was built

**The room (`src/world3d/house/Room.ts`)**: a cutaway dollhouse room replaces the 3D-0 placeholder.

- **Surfaces:** the floor and walls wear the chosen flooring and wallpaper. Patterns are drawn to small textures after the original's look:
  - Walls: soft cream stripes, mint stripes, berry hearts, sky and clouds.
  - Floors: honey wood boards, checker tiles, speckled carpet.
- **Walls:** a full-height back wall and two low side walls, with white baseboards, a top rail and corner posts. The room sits on a wooden slab over the original's warm brown frame.
- **Cutaway:** the walls are one-sided, facing into the room. When you orbit outside a wall, it disappears (only its top rail stays), so it never blocks the view in. Wall art hides too when the camera is behind the back wall.
- **The doormat** is the original's green one, with "🌳 Outside" on it.

**Items in 3D (`src/world3d/items/`)**

- **Every placeable item** has its own 3D recipe, following the original's drawings (`art/itemSvg.ts`):
  - **All 10 yard lures:** carrot patch, bird bath (with a little bird), toy basket, flower garden, pond with stones and a lily pad, bamboo, eucalyptus tree, warm rock, rainbow fountain, and moon lantern.
  - **All 15 furniture pieces:** armchair, sofa, little table, picnic table, cartoon TV, sunshine picture, paw poster, round rug, rainbow rug, glow lamp, fairy lights, potted plant, sunflower pot, bookshelf full of books, and toy shelf with a teddy.
  - **The 3 pet beds:** basic, fluffy, and royal with a gold rim and crown.
- **Sizing (`placement3d.ts`):**
  - Each model fills its footprint and is turned by its rotation. The model swaps back to its own width and depth at 90° and 270°.
  - Heights scale with the tile size, so things get smaller in bigger houses, like the original's tiles.
  - Rugs lie just above the floor.
  - Wall items hang on the back wall where the original's wall strip is, and a wall item turned 180° is mirrored.
- **Caching:** models are cached per item and size.

**Decorate mode in 3D (`src/world3d/decorate/Decorate.ts`)**

- **Entering it:** the camera glides back a little and moves the room up above the tray, and a white grid lies over the floor (and the house's back wall).
- **While decorating:** animals fade to 35% and can't be tapped. Finds hide. Only placed items and bowls take taps, like the original.
- **A ghost footprint** (green if it fits, red if not) shows where an item would go:
  - while dragging from the tray,
  - while a mouse hovers with a tray item picked,
  - while moving a placed item.
- **Placing:** tap a tray item then a spot, or drag it from the tray into the world. Pictures go on the back wall. Placing shows a sparkle, and a refused spot shows its reason in red.
- **Moving:** press a placed item (or bowl) to select it (it gets a glowing yellow outline) and drag it to move it. The tray's Turn and Put away work unchanged.
- **Leaving it:** "Done" returns the camera to the normal view.
- **One small UI change:** the tray's `decorDrag` event also carries the finger's page point (`client`). Its old 1280×800 point only makes sense for the original's fixed camera. The Phaser world is unchanged, and all the original Decorate tests still pass.

**Camera:** `CameraRig.goTo(view)` glides to any view (used for Decorate). `homeView` gives the default.

### Tests

- **Unit:** 601 in total (7 new).
  - The back wall mapping round-trips.
  - Floor items fill their footprint at every tier and rotation, with the swapped width and depth and the correct turn.
  - Wall items hang within the wall art band and mirror at 180°.
  - Rugs lie just above the floor.
  - Heights shrink in bigger houses.
  - Every item model stays inside its footprint and on the floor, or flat against the wall.
  - Models are shared per size.
  - **This found a small bug:** the Warm Rock sat partly underground. It's fixed.
- **E2E:** a new `world3d-decorate.spec.ts`, 8 tests × 3 browser setups:
  - Buy a pet bed and place it with a tap, and the camera comes back home after Done.
  - Drag a lure from the tray into the yard (the Lure Score goes up).
  - Select a sofa to turn it and put it away.
  - Drag a placed table to a new tile.
  - Hang a picture on the back wall.
  - Animals and finds are out of the way while decorating, and animals can be tapped again after.
  - The layout survives a reload.
  - A furnished Manor room with 10 animals stays within the drawing budget: about 171k triangles and 92 draw calls, held under 300k and 150.
- **Full run:** 353 passed, 7 skipped, 0 failed.

### Defaults chosen (please confirm or change)

1. **A cutaway dollhouse room:** a full back wall and half-height side walls, which vanish from outside.
2. **Wall art hangs between 0.7 and 2.15 units** up the back wall (the original's wall strip, standing up).
3. **The Decorate camera** zooms out 20% and moves the room up above the tray (the original zoomed to 0.8). You can still orbit while decorating.
4. **The selected item gets a glowing yellow outline.** The original made it 75% see-through.

### Known issues

- **Yard lures** are sized to the yard's small 0.88 × 0.47 tiles, like the original's, so some (the moon lantern, the bamboo) look slim from far away.
- **The Vet Clinic scene, the player's avatar and pet outfits** are 3D-5.

## Phase 3D-5: Vet Clinic, avatar, outfits and portraits (built 2026-09-30)

### What was built

**Pet outfits in 3D (`animals/outfits.ts`)**: all 11 from the Pet Boutique.

- Each outfit is fitted to the animal's own head, neck, body and eyes, using new model anchors (`AnimalModel.anchors`), like the original's fitted outfits:
  - **Hats:** a party hat with stripes and a pom-pom, a big bow, a flower clip, and a crown with gems.
  - **Body:** a knitted sweater (stripes, ribbed hem and collar), a hero cape with a gold clasp, a two-layer tutu, and a scarf with a hanging, fringed end.
  - **Face:** round glasses, star shades, and a polka-dot bandana on the chest.
- **Sharing:** one merged mesh per look and outfit, using the animals' shared materials, so it fades with them in Decorate mode.

**The player's avatar in 3D (`avatar/`)**

- **A chunky chibi kid** built from the same loadout as the original's SVG avatar. Every Boutique option has a 3D recipe:
  - **Body:** 3 body shapes and 8 skin tones.
  - **Face:** 5 eye styles (round, happy, wide, sparkly, wink), 3 brows, 4 mouths.
  - **Hair:** 7 hairstyles in 8 colors.
  - **Makeup:** blush and heart blush, eyeshadow, lips, and face paint (glitter, heart, whiskers).
  - **Clothes:** tops (tee, stripes, hoodie, heart, star, rainbow), bottoms (pants, shorts, skirt, tutu), and one-pieces (dress, overalls, starry gown).
  - **Shoes:** sneakers, boots, sandals, bunny slippers.
  - **Accessories:** cap, flower crown, tiny crown, bunny ears; round, star and sun glasses; backpack and purse; studs, hoops and heart earrings.
- **Face:** it tilts up to look at the camera, like the animals.
- **In the world:** one avatar per zone. It walks toward every tap, stopping beside the spot on the side it came from, at the original's pace, with a hop. It never takes taps, and it hides while decorating.

**3D portraits in the menus (`portraits/Portraits.ts`, `ui/portraitProviders.ts`)**

- **Where they show:** the Animal Card, Pets, Pet Wardrobe, Training, the Dex (with dark 3D silhouettes for animals not found yet), the HUD's avatar button, the Style / Wardrobe screens, and Settings.
- **How:** one small offscreen renderer draws each look once to an image and caches it. Pets are drawn head-and-shoulders, outfit included; avatars stand full height.
- **The 2D game is unchanged:** a tiny registry in the main bundle lets the 3D world plug portraits in while it's loaded, so the default game still uses the original's SVG pictures and never downloads Three.js.

**The Vet Clinic in 3D (`vet/VetRoom.ts`)**

- **The room:** mint striped walls, a window, the big red cross sign, the "Vet Clinic" title, a striped floor, and the exam table.
- **The patient** stands on the table at the original's 1.8× size, facing you, with its symptom and outfit.
- **Exam tools:** the three tools are the original's cream tray cards, in the same places along the bottom-left. Tap one, or drag it onto the patient, to examine. It glides over, wiggles, and the clue icons float up. Dropping a tool elsewhere sends it back. The tools rest (dimmed) during a Free Clinic wait, or when the patient is well.
- **Panel:** the clinic panel (React) is unchanged. It gets the same `vetExamined` events.
- **Treatments:**
  - **The cure:** stars, hearts and a happy jump.
  - **The first fix of two:** "1 more!".
  - **A wrong one:** a "?" and a wobble.
- **Camera:** a fixed head-on camera at 58°, like the original's front view. No orbiting in the clinic.

**Model change:** `silhouetteModel()` gives the Dex its faceless, one-color shapes (no whiskers or face marks, no shading).

### Tests

- **Unit:** 607 in total (6 new).
  - Every Pet Boutique outfit kind has a 3D recipe.
  - Every outfit on every species stays on the animal, with hats on the head and face items on the face.
  - Outfit meshes are shared per look and outfit.
  - Silhouettes are one color for every species.
  - The avatar builds with every one of the 83 avatar items, standing on the ground at its height.
  - Avatar meshes are shared per loadout.
- **E2E:** two new specs, each 4 tests × 3 browser setups.
  - **`world3d-vet.spec.ts`:**
    - Pay, examine with a tool, a wrong treatment, the cure, and back to the yard.
    - Drag a tool onto the patient to examine; dropping it elsewhere does nothing.
    - Nothing covers the tools, and they're at least 48 px.
    - The Free Clinic wait rests the tools.
  - **`world3d-dress.spec.ts`:**
    - PNG (3D) portraits with `?3d`, SVG without.
    - Dress a pet in the wardrobe, and its portrait changes.
    - Every species wears every outfit kind without errors, within the drawing budget.
    - The Dex shows 3D shapes.

- **Full e2e run:** 377 passed, 7 skipped, 0 failed.

### Defaults chosen (please confirm or change)

1. **The exam tools stay flat cards** (like the original's), not 3D objects.
2. **The avatar is about twice an animal's height,** like the original.
3. **The clinic camera is fixed** (no orbiting), for a clear exam view next to the panel.
4. **Portraits are drawn from slightly above,** with the pet's face tilted up, so they match the world.
5. **Outfit meshes are trimmed to low detail.** 21 animals in full outfits stay under 350k triangles.

### Known issues

- The Vet Clinic title can overlap the floating clue icons for a moment.
- The avatar's portrait is drawn straight on; the original's was a flat front view.
- **Coming in 3D-6:** the iPad performance pass, moving the original e2e tests to the 3D world, making 3D the default, and removing Phaser and the SVG renderers.
