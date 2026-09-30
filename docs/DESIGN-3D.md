# Mystery Meadow 3D — Addendum to DESIGN.md

This project is a 3D remake of Mystery Meadow (original: `../AnimalLover`, github.com/forcepd/mystery-meadow).
`docs/DESIGN.md` is still the game spec. **Gameplay must stay the same as the original.** This
addendum overrides only the parts of DESIGN.md that talk about 2D rendering (Section 2 "Style",
16.1, 16.2, and the Phaser rows of 18.1 and 18.5).

## Decisions (2026-09-30)

| Topic     | Decision                                                                                                                                                                                                                                         |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Rendering | Three.js (WebGL) replaces Phaser. React UI, sim, saves, config, and audio are reused as-is.                                                                                                                                                      |
| Art       | **Built in code**: chunky, rounded, toy-like 3D animals and props from primitives, soft toon shading. Species are parametric part templates (body, head, ears, tail, pattern, eyes) with color slots, so variants, Sparkle and outfits are data. |
| Camera    | **Free rotate**, within limits (see below).                                                                                                                                                                                                      |
| Saves     | **Completely separate** from the original. IndexedDB database `mystery-meadow-3d` (the original uses `mystery-meadow`; both can share an origin on pforce.com). No automatic import.                                                             |
| Hosting   | Local only for now. `.github/workflows/ci.yml` is kept but nothing is pushed.                                                                                                                                                                    |
| App name  | "Mystery Meadow 3D" (title, PWA name, own PWA `id`).                                                                                                                                                                                             |

## Camera and input rules

- One-finger drag (or mouse drag) on **empty ground** orbits the camera around the zone's center.
  Pinch / scroll wheel zooms. A "reset view" button returns to the default 3/4 angle.
- Limits: the camera can't go below ~20° above the ground or past straight down, and zoom is
  clamped so the whole zone and at least one animal always fit.
- A tap (little movement, short press) behaves exactly like the original: open card, reveal
  visitor, clean poop, refill bowl, collect find, close card on empty ground.
- Press-and-hold on an animal = pet; drag an animal = drag-to-door; Decorate drags move items.
  Drags that **start on an object** never rotate the camera.
- Picking is by raycast with generous invisible hit volumes, so on-screen tap targets stay at
  least as big as the original's (48 CSS px minimum, animals larger).
- Name labels, badges and "?" bubbles are billboards (always face the camera).
- Reduced motion: no idle animation, no camera easing; rotating is still allowed.

## Positions

The sim stores normalized 0..1 zone positions. `src/game/layout.ts` keeps the original's 2D
layout; the 3D world maps that same layout onto the ground plane (x → x, y → z), so every spot
(gate queue, doors, yard rectangle, grid tiles) lines up with the original.

## Performance targets (unchanged from 18.5)

60 fps on an A13-class iPad: device-pixel-ratio cap (≈2), one directional shadow-casting light
with a small shadow map, merged/instanced static scenery, shared geometries/materials per
species, particle cap kept from `fx/budget.ts`, and WebGL context-loss recovery.

## Build plan (each phase ends with a playable build and passing tests)

Phaser stays in the build until the 3D yard reaches parity, so the game stays playable. The 3D
renderer sits behind a dev flag (`?3d`) until then.

1. **3D-0 Foundation:** Three.js host replacing `GameCanvas`'s Phaser game, renderer/resize/DPR,
   camera rig (orbit, tap vs drag, pinch, reset), raycast picking, world→screen projection (for
   coin flights to the HUD and for e2e tests), placeholder ground.
2. **3D-1 Yard:** terrain, path, fence and gate, house exterior in the saved color, trees and
   flowers, lighting and shadows, sky.
3. **3D-2 Animals and visitors:** parametric 3D builder for all 21 species, variants, Sparkle,
   babies, idle/hop animation, wander, billboard labels and badges, mystery visitor silhouettes,
   reveal, walk in, wave goodbye.
4. **3D-3 Care and effects:** bowls, poop, finds, petting, drag-to-door, symptoms, hearts,
   confetti, coin shower.
5. **3D-4 House and Decorate:** interior room per tier, 3D furniture, lures and pet beds, grid
   placement and dragging in Decorate mode.
6. **3D-5 Vet, avatar, outfits:** Vet scene, 3D player avatar, pet outfits fitted to 3D bodies,
   3D portraits for Animal Card / Dex / Pets / Avatar screens.
7. **3D-6 Polish:** iPad performance pass, e2e suite moved to projection-based helpers, Phaser and
   the SVG renderers removed, PROGRESS and CREDITS updated.
