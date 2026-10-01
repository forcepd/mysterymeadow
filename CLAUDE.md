# Mystery Meadow 3D — Instructions for Claude Code

This is the 3D (Three.js) remake of Mystery Meadow. The original 2D game lives in `../AnimalLover` and must never be modified from here.

The 3D world (`src/world3d/`, hosted by `src/ui/GameCanvas3D.tsx`) is the default. The original's Phaser world (`src/game/`, `src/ui/GameCanvas2D.tsx`) is kept as the "Classic 2D world" switch (Settings, or `?2d`; see `src/ui/worldStyle.ts`). Both are lazy-loaded; neither may import the other. Gameplay changes go in the sim and work in both worlds. E2E: `world3d*.spec.ts` test the 3D world; the original specs run against the 2D world through `tests/e2e/fixtures2d.ts`.

## Source of truth
- `docs/DESIGN-3D.md` holds the 3D decisions and build plan; it overrides DESIGN.md's 2D rendering sections. Gameplay must stay identical to the original.
- `docs/DESIGN.md` is the game and technical spec. Read the sections relevant to the current phase before planning.
- `docs/PROGRESS.md` records what has been built. Read it at the start of every session.

## How we work
- Build ONLY the phase I ask for. Propose a plan first, then implement. Stop and summarize when the phase is done.
- A phase is done when: `npm test` passes, `npm run build` passes, the phase's "Done when" criteria in DESIGN.md are met, and `docs/PROGRESS.md` is updated with what was built, any deviations from the spec, and known issues.
- If the spec is ambiguous or contradictory, ask me instead of guessing. If you must pick a default, record it in PROGRESS.md.
- Commit at logical checkpoints with clear messages.

## Architecture rules
- `src/sim/` is pure TypeScript: no imports from Three.js, Phaser, React, or the DOM. It must be deterministic given a seeded RNG and injected Clock.
- UI and 3D scenes never mutate game state directly; they call sim commands and react to sim events.
- Every gameplay number lives in `src/config/balance.ts` (or the content data files in `src/config/`). Never hardcode tunables.
- Content (species, items, illnesses, tricks, avatar items) is data-driven. Adding a species must not require code changes beyond data + art.
- Saves are versioned. Any change to saved state requires a migration in `src/save/migrations.ts`. Never break an existing save.
- Every sim rule gets Vitest coverage, including edge cases.
- The dev Debug Panel must be excluded from production builds.

## Platform rules
- Touch-first. Everything works with tap, tap-and-hold, and drag. No hover-only UI. Minimum touch target 48x48 CSS px.
- Must run well in iPad Safari (landscape) and desktop browsers. Follow the iPad requirements in DESIGN.md section 18.5.
- No external network calls, analytics, ads, or trackers.

## Audience rules
- Players are kids around 8-12. Short, friendly, positive text with icons.
- Animals never die or run away. Nothing scary, gory, or shaming.
- All art and audio must be original or CC0/royalty-free; record sources in `docs/CREDITS.md`. No copyrighted characters or assets.
