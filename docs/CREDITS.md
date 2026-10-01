# Credits and Licenses

Every art, audio, and font asset shipped in the game is listed here with its source and license.

## Fonts

| Asset                                        | Source                                                                                                                                        | License                   |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Nunito (weights 400, 700, 800; Latin subset) | Vernon Adams et al., via the `@fontsource/nunito` npm package. Bundled into the build and served from our own site, with no Google Fonts CDN. | SIL Open Font License 1.1 |

## Art

| Asset                                                                                                                       | Source                                                                                     | License           |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------- |
| App icon / favicon (`public/icons/favicon.svg` and the PNGs rendered from it)                                               | Original, made for this project                                                            | Project-owned     |
| Meadow, house, and HUD shapes; avatar parts (`src/art/avatarSvg.ts`)                                                        | Original, drawn in code                                                                    | Project-owned     |
| Animals (all 21 species, colors, Sparkle), pet outfits, lures, furniture, and beds: parametric SVG in `src/art/` (Phase 10) | Original, drawn in code                                                                    | Project-owned     |
| Emoji icons in the HUD, badges, and toasts                                                                                  | Rendered by the player's own device emoji font. No emoji images are bundled or downloaded. | n/a (system font) |

## Audio

| Asset                                        | Source                                                                                                                         | License       |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| Yard and house music, and every sound effect | Original. Synthesized live with Web Audio from the note and sound recipes in `src/audio/sounds.ts` (Phase 10). No audio files. | Project-owned |

## Code libraries (runtime)

three.js (MIT, for the 3D world, including its CSS2DRenderer addon), Phaser (MIT, for the classic 2D world), React and React DOM (MIT), Workbox (MIT, via vite-plugin-pwa).
