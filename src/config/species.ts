import type { Rarity } from '../sim/types';
import { deepFreeze } from './deepFreeze';

/**
 * Species roster (DESIGN.md 7.1). Adding a species = adding an entry here: its variants' colors
 * and an `art` recipe that picks from the shared SVG parts in src/art/species (DESIGN 16.2).
 * A brand-new body part is the only thing that needs code.
 */

/** Named color slots every part draws with (DESIGN 16.2). */
export interface VariantColors {
  /** Fur, feathers, or scales. */
  readonly main: string;
  /** Belly, muzzle, tail tips. */
  readonly light: string;
  /** Inner ears, noses, beaks, horns, manes. */
  readonly accent: string;
  /** Markings (masks, socks, stripes, spots). Defaults to a darker `main`. */
  readonly dark?: string;
}

export interface SpeciesVariant {
  readonly id: string;
  readonly name: string;
  readonly colors: VariantColors;
  /** Extra markings only this color has (a spotted puppy, a calico kitten). */
  readonly patterns?: readonly PatternKind[];
}

export type BodyShape = 'round' | 'long' | 'bird' | 'tall' | 'pony';
export type EarKind =
  'none' | 'long' | 'pointy' | 'floppy' | 'round' | 'fluffy' | 'tufts' | 'pig' | 'gills';
export type TailKind =
  | 'none'
  | 'puff'
  | 'thin'
  | 'wag'
  | 'bushy'
  | 'ringed'
  | 'curl'
  | 'feather'
  | 'flat'
  | 'fin'
  | 'flowing'
  | 'dragon';
export type NoseKind = 'button' | 'snout' | 'bigNose' | 'pig' | 'beak' | 'bill' | 'smile';
export type EyeKind = 'big' | 'owl';
export type PatternKind =
  | 'belly'
  | 'muzzle'
  | 'spots'
  | 'patches'
  | 'mask'
  | 'tuxedo'
  | 'cheekMarks'
  | 'socks'
  | 'stripes'
  | 'faceDisc'
  | 'tipEars'
  | 'bands';
export type ExtraKind =
  | 'whiskers'
  | 'pouches'
  | 'featherWings'
  | 'batWings'
  | 'flippers'
  | 'spines'
  | 'wool'
  | 'horn'
  | 'horns'
  | 'mane'
  | 'tuft'
  | 'moonMark'
  | 'webbedFeet';

/**
 * How to build a species from the shared parts. Sprite space: the body is centered on (0, 0) and
 * the feet touch y = +22 (the same space as the pet outfit anchors).
 */
export interface SpeciesArt {
  readonly body: { readonly shape: BodyShape; readonly w: number; readonly h: number };
  /** Head center y and radius; `wide` stretches it sideways. */
  readonly head: { readonly y: number; readonly r: number; readonly wide?: number };
  readonly ears: EarKind;
  /** Ear size multiplier (1 = normal). */
  readonly earSize?: number;
  readonly tail: TailKind;
  readonly nose: NoseKind;
  readonly eyes?: EyeKind;
  readonly patterns: readonly PatternKind[];
  readonly extras: readonly ExtraKind[];
}

/** Where pet outfits sit on a species' art, in its sprite space (feet near y = +22). */
export interface OutfitAnchors {
  readonly head: { readonly x: number; readonly y: number };
  readonly face: { readonly x: number; readonly y: number };
  readonly body: { readonly x: number; readonly y: number };
  /** Outfit size relative to a standard head (radius 27). */
  readonly scale: number;
}

export interface SpeciesDef {
  readonly id: string;
  readonly name: string;
  readonly rarity: Rarity;
  readonly assetKey: string;
  readonly variants: readonly SpeciesVariant[];
  readonly art: SpeciesArt;
  /** Only needed when the anchors worked out from `art` don't fit (e.g. hand-drawn art). */
  readonly outfitAnchors?: OutfitAnchors;
}

/** Anchors for a standard head (radius 27 at y = -32); unknown species fall back to these. */
export const DEFAULT_OUTFIT_ANCHORS: OutfitAnchors = deepFreeze({
  head: { x: 0, y: -58 },
  face: { x: 0, y: -34 },
  body: { x: 0, y: 2 },
  scale: 1,
});

/** DESIGN 10.3: where outfits go on this species (every species has anchors). */
export function outfitAnchors(speciesId: string): OutfitAnchors {
  const species = getSpecies(speciesId);
  if (!species) return DEFAULT_OUTFIT_ANCHORS;
  if (species.outfitAnchors) return species.outfitAnchors;
  const { head, body } = species.art;
  return {
    head: { x: 0, y: head.y - head.r + 1 },
    face: { x: 0, y: head.y - head.r * 0.05 },
    body: { x: 0, y: bodyCenterY(body) + 2 },
    scale: head.r / 27,
  };
}

/**
 * Bodies stand on the ground: the bottom edge sits at y = +24 whatever the height. Ponies stand
 * on legs, so their body is higher.
 */
export function bodyCenterY(body: SpeciesArt['body']): number {
  return 24 - body.h / 2 - (body.shape === 'pony' ? 12 : 0);
}

const v = (
  id: string,
  name: string,
  main: string,
  light: string,
  accent: string,
  extra: { dark?: string; patterns?: PatternKind[] } = {},
): SpeciesVariant => ({
  id,
  name,
  colors: { main, light, accent, ...(extra.dark ? { dark: extra.dark } : {}) },
  ...(extra.patterns ? { patterns: extra.patterns } : {}),
});

const ROUND = { shape: 'round', w: 72, h: 52 } as const;
const HEAD = { y: -32, r: 27 } as const;

// Variant ids and their order are part of the sim (random picks), so only ever append.
// prettier-ignore
export const SPECIES: readonly SpeciesDef[] = deepFreeze([
  // Common
  { id: 'bunny', name: 'Bunny', rarity: 'common', assetKey: 'species.bunny',
    art: { body: ROUND, head: HEAD, ears: 'long', tail: 'puff', nose: 'button', patterns: ['belly'], extras: [] },
    variants: [
      v('white', 'Snow', '#f7f4ef', '#ffffff', '#ffb3c6'),
      v('brown', 'Cocoa', '#a57a5a', '#e9d6c2', '#ffb3c6'),
      v('gray', 'Pebble', '#a9a9b3', '#e6e6ec', '#ffb3c6'),
      v('spotted', 'Patches', '#f4ece0', '#ffffff', '#ffb3c6', { dark: '#b08462', patterns: ['spots'] }),
    ] },
  { id: 'kitten', name: 'Kitten', rarity: 'common', assetKey: 'species.kitten',
    art: { body: { shape: 'round', w: 68, h: 50 }, head: { y: -32, r: 28, wide: 1.08 }, ears: 'pointy', tail: 'thin', nose: 'button', patterns: ['belly'], extras: ['whiskers'] },
    variants: [
      v('orange', 'Ginger', '#f0a35e', '#fde6c8', '#ff9fb5', { dark: '#d27a36', patterns: ['stripes'] }),
      v('black', 'Shadow', '#3d3a40', '#6b6670', '#ff9fb5'),
      v('gray', 'Misty', '#9fa3ad', '#e4e6ea', '#ff9fb5'),
      v('calico', 'Calico', '#fbf5ec', '#ffffff', '#ff9fb5', { dark: '#e8973f', patterns: ['patches'] }),
      v('white', 'Cotton', '#fbf8f3', '#ffffff', '#ff9fb5'),
    ] },
  { id: 'puppy', name: 'Puppy', rarity: 'common', assetKey: 'species.puppy',
    art: { body: { shape: 'round', w: 74, h: 52 }, head: { y: -32, r: 28, wide: 1.06 }, ears: 'floppy', tail: 'wag', nose: 'snout', patterns: ['belly'], extras: [] },
    variants: [
      v('golden', 'Golden', '#e8b865', '#fbe8c3', '#4a3b33', { dark: '#c98f3d' }),
      v('brown', 'Mocha', '#8b5e3c', '#d9b894', '#4a3b33', { dark: '#6a4329' }),
      v('spotted', 'Dotty', '#f6efe4', '#ffffff', '#4a3b33', { dark: '#4a3b33', patterns: ['spots'] }),
      v('black', 'Midnight', '#403833', '#a88e78', '#2a2320', { dark: '#2a2320' }),
    ] },
  { id: 'hamster', name: 'Hamster', rarity: 'common', assetKey: 'species.hamster',
    art: { body: { shape: 'round', w: 78, h: 56 }, head: { y: -26, r: 28, wide: 1.1 }, ears: 'round', earSize: 0.8, tail: 'none', nose: 'button', patterns: ['belly'], extras: ['pouches', 'whiskers'] },
    variants: [
      v('golden', 'Honey', '#e9b872', '#fff4e0', '#ffb3c6'),
      v('white', 'Marshmallow', '#faf5ee', '#ffffff', '#ffb3c6'),
      v('gray', 'Smoky', '#a4a0a0', '#eeeae6', '#ffb3c6'),
    ] },
  { id: 'duckling', name: 'Duckling', rarity: 'common', assetKey: 'species.duckling',
    art: { body: { shape: 'bird', w: 66, h: 52 }, head: { y: -34, r: 25 }, ears: 'none', tail: 'feather', nose: 'bill', patterns: [], extras: ['featherWings', 'webbedFeet', 'tuft'] },
    variants: [
      v('yellow', 'Sunny', '#ffe066', '#fff3b0', '#ffa54a'),
      v('brown', 'Mallard', '#b58b52', '#e8d3a8', '#ffa54a'),
      v('white', 'Puff', '#fffaf0', '#ffffff', '#ffa54a'),
    ] },
  { id: 'chick', name: 'Chick', rarity: 'common', assetKey: 'species.chick',
    art: { body: { shape: 'bird', w: 60, h: 50 }, head: { y: -30, r: 25 }, ears: 'none', tail: 'feather', nose: 'beak', patterns: [], extras: ['featherWings', 'tuft'] },
    variants: [
      v('yellow', 'Lemon', '#fff07a', '#fffac4', '#ff9a3c'),
      v('peach', 'Peachy', '#ffcf9e', '#ffe9d2', '#ff8a3c'),
      v('brown', 'Speckle', '#c49a6c', '#ead2b4', '#ff9a3c', { dark: '#8e6a44', patterns: ['spots'] }),
    ] },
  // Uncommon
  { id: 'hedgehog', name: 'Hedgehog', rarity: 'uncommon', assetKey: 'species.hedgehog',
    art: { body: { shape: 'round', w: 76, h: 50 }, head: { y: -28, r: 25 }, ears: 'round', earSize: 0.6, tail: 'none', nose: 'snout', patterns: ['belly'], extras: ['spines'] },
    variants: [
      v('brown', 'Chestnut', '#f1dcc0', '#fbeedd', '#4a3b33', { dark: '#8a6a4f' }),
      v('cream', 'Cream', '#fbefdc', '#fff8ec', '#4a3b33', { dark: '#d9bf98' }),
      v('dark', 'Acorn', '#e5ccac', '#f6e6d0', '#4a3b33', { dark: '#5c4636' }),
    ] },
  { id: 'fox', name: 'Fox', rarity: 'uncommon', assetKey: 'species.fox',
    art: { body: ROUND, head: { y: -32, r: 27, wide: 1.1 }, ears: 'pointy', earSize: 1.2, tail: 'bushy', nose: 'snout', patterns: ['belly', 'muzzle', 'socks', 'tipEars'], extras: [] },
    variants: [
      v('red', 'Ember', '#e0703a', '#fff6ec', '#4a3b33', { dark: '#5a3b2e' }),
      v('silver', 'Silver', '#b8bcc6', '#ffffff', '#4a3b33', { dark: '#5d6170' }),
      v('arctic', 'Frost', '#f4f7fb', '#ffffff', '#4a3b33', { dark: '#b9c6d8' }),
    ] },
  { id: 'raccoon', name: 'Raccoon', rarity: 'uncommon', assetKey: 'species.raccoon',
    art: { body: { shape: 'round', w: 74, h: 54 }, head: { y: -32, r: 27, wide: 1.1 }, ears: 'round', tail: 'ringed', nose: 'snout', patterns: ['belly', 'mask', 'muzzle'], extras: ['whiskers'] },
    variants: [
      v('gray', 'Bandit', '#8e8e96', '#eeeef2', '#ffb3c6', { dark: '#3f3e46' }),
      v('brown', 'Hazel', '#8f7560', '#efe4d8', '#ffb3c6', { dark: '#4a382c' }),
      v('light', 'Ash', '#c4c2c0', '#fbfaf8', '#ffb3c6', { dark: '#6f6c69' }),
    ] },
  { id: 'piglet', name: 'Piglet', rarity: 'uncommon', assetKey: 'species.piglet',
    art: { body: { shape: 'round', w: 78, h: 54 }, head: { y: -30, r: 28, wide: 1.08 }, ears: 'pig', tail: 'curl', nose: 'pig', patterns: [], extras: [] },
    variants: [
      v('pink', 'Rosie', '#f7b3c2', '#fcd5de', '#f28aa3'),
      v('spotted', 'Domino', '#f6dcdc', '#fff0f0', '#f0a0b0', { dark: '#6e5a5a', patterns: ['spots'] }),
      v('brown', 'Truffle', '#a0705a', '#c99a82', '#d98d8d'),
    ] },
  { id: 'lamb', name: 'Lamb', rarity: 'uncommon', assetKey: 'species.lamb',
    art: { body: { shape: 'round', w: 76, h: 54 }, head: { y: -32, r: 24 }, ears: 'floppy', tail: 'puff', nose: 'button', patterns: [], extras: ['wool'] },
    variants: [
      v('white', 'Cloud', '#fbfaf5', '#f6e6da', '#ffb3c6', { dark: '#f0e2d6' }),
      v('cream', 'Biscuit', '#efdfc2', '#f7e2d8', '#ffb3c6', { dark: '#e8cdb0' }),
      v('black', 'Licorice', '#3f3b3d', '#a89a92', '#ffb3c6', { dark: '#2b2829' }),
    ] },
  // Rare
  { id: 'red_panda', name: 'Red Panda', rarity: 'rare', assetKey: 'species.red_panda',
    art: { body: ROUND, head: { y: -32, r: 28, wide: 1.1 }, ears: 'round', earSize: 1.1, tail: 'ringed', nose: 'snout', patterns: ['cheekMarks', 'socks'], extras: [] },
    variants: [
      v('red', 'Maple', '#c9542e', '#fff6ec', '#fff6ec', { dark: '#4a2a22' }),
      v('amber', 'Amber', '#d98a3d', '#fff6ec', '#fff6ec', { dark: '#5a3a24' }),
      v('dark', 'Cinnamon', '#8c3b22', '#f3e2d2', '#f3e2d2', { dark: '#3a2018' }),
    ] },
  { id: 'otter', name: 'Otter', rarity: 'rare', assetKey: 'species.otter',
    art: { body: { shape: 'long', w: 84, h: 46 }, head: { y: -28, r: 25, wide: 1.1 }, ears: 'round', earSize: 0.6, tail: 'flat', nose: 'snout', patterns: ['belly', 'muzzle'], extras: ['whiskers'] },
    variants: [
      v('brown', 'River', '#7a5a41', '#e8d5bf', '#3a2a20'),
      v('light', 'Sandy', '#b89a7a', '#f5e8d8', '#3a2a20'),
      v('dark', 'Pebble', '#4d3a2c', '#c9b29a', '#2a1d15'),
    ] },
  { id: 'penguin', name: 'Penguin', rarity: 'rare', assetKey: 'species.penguin',
    art: { body: { shape: 'tall', w: 62, h: 66 }, head: { y: -44, r: 26 }, ears: 'none', tail: 'none', nose: 'beak', patterns: ['tuxedo'], extras: ['flippers', 'webbedFeet'] },
    variants: [
      v('classic', 'Tuxedo', '#2f3440', '#ffffff', '#ffa54a'),
      v('blue', 'Little Blue', '#5d7fa8', '#f4f8ff', '#ffa54a'),
      v('fluffy', 'Fluffball', '#9a9aa0', '#dcdce0', '#ffa54a'),
    ] },
  { id: 'owl', name: 'Owl', rarity: 'rare', assetKey: 'species.owl',
    art: { body: { shape: 'bird', w: 66, h: 58 }, head: { y: -36, r: 28, wide: 1.1 }, ears: 'tufts', tail: 'feather', nose: 'beak', eyes: 'owl', patterns: ['faceDisc', 'belly'], extras: ['featherWings'] },
    variants: [
      v('brown', 'Hoot', '#8b6b4a', '#f0dcc0', '#f5b93a'),
      v('snowy', 'Snowy', '#f3f3ee', '#ffffff', '#f5b93a', { dark: '#9ea3a8', patterns: ['spots'] }),
      v('barn', 'Barnaby', '#d9b98c', '#fffaf2', '#f5b93a'),
    ] },
  // Epic
  { id: 'koala', name: 'Koala', rarity: 'epic', assetKey: 'species.koala',
    art: { body: { shape: 'round', w: 72, h: 54 }, head: { y: -32, r: 28, wide: 1.1 }, ears: 'fluffy', tail: 'none', nose: 'bigNose', patterns: ['belly'], extras: [] },
    variants: [
      v('gray', 'Eucy', '#9aa0a6', '#eef0f2', '#3d3a40'),
      v('light', 'Silverleaf', '#c9ccd1', '#ffffff', '#3d3a40'),
      v('brown', 'Gumnut', '#8d7b6b', '#e6ddd4', '#3d3a40'),
    ] },
  { id: 'fennec_fox', name: 'Fennec Fox', rarity: 'epic', assetKey: 'species.fennec_fox',
    art: { body: { shape: 'round', w: 66, h: 50 }, head: { y: -30, r: 25, wide: 1.1 }, ears: 'pointy', earSize: 1.7, tail: 'bushy', nose: 'snout', patterns: ['belly', 'muzzle'], extras: [] },
    variants: [
      v('sand', 'Dune', '#e8c99b', '#fff8ec', '#ffb3a0'),
      v('cream', 'Vanilla', '#f5e6c8', '#ffffff', '#ffb3a0'),
      v('ginger', 'Sunset', '#e3a063', '#fff3e2', '#ffb3a0'),
    ] },
  { id: 'axolotl', name: 'Axolotl', rarity: 'epic', assetKey: 'species.axolotl',
    art: { body: { shape: 'long', w: 76, h: 44 }, head: { y: -28, r: 26, wide: 1.25 }, ears: 'gills', tail: 'fin', nose: 'smile', patterns: ['belly'], extras: [] },
    variants: [
      v('pink', 'Bubblegum', '#f7a8c4', '#fcd6e4', '#e05a8a'),
      v('gold', 'Goldie', '#f5d76e', '#fbeeb8', '#f08a5a'),
      v('blue', 'Lagoon', '#8fb8e8', '#cfe2f8', '#6a5ad0'),
      v('white', 'Pearl', '#faf2f5', '#ffffff', '#ff7fa8'),
    ] },
  // Legendary
  { id: 'unicorn', name: 'Unicorn', rarity: 'legendary', assetKey: 'species.unicorn',
    art: { body: { shape: 'pony', w: 78, h: 44 }, head: { y: -40, r: 26, wide: 1.05 }, ears: 'pointy', earSize: 0.8, tail: 'flowing', nose: 'button', patterns: [], extras: ['mane', 'horn'] },
    variants: [
      v('white', 'Starlight', '#fdfbff', '#ffffff', '#b69bff', { dark: '#ffd84d' }),
      v('pink', 'Candyfloss', '#f9c6e0', '#fde6f2', '#8fd6ff', { dark: '#ffd84d' }),
      v('lilac', 'Lilac', '#d6c2f2', '#efe6fb', '#ff8fc4', { dark: '#ffd84d' }),
    ] },
  { id: 'baby_dragon', name: 'Baby Dragon', rarity: 'legendary', assetKey: 'species.baby_dragon',
    art: { body: { shape: 'round', w: 72, h: 54 }, head: { y: -34, r: 27, wide: 1.1 }, ears: 'none', tail: 'dragon', nose: 'smile', patterns: ['belly', 'bands'], extras: ['batWings', 'horns'] },
    variants: [
      v('green', 'Moss', '#7cc47a', '#fbe8a6', '#f5b93a', { dark: '#4f9a52' }),
      v('red', 'Blaze', '#e2604a', '#ffe2a8', '#ffd84d', { dark: '#a93c2e' }),
      v('purple', 'Amethyst', '#9b6fd1', '#f6d8f2', '#8fd6ff', { dark: '#6c4aa0' }),
    ] },
  { id: 'moon_bunny', name: 'Moon Bunny', rarity: 'legendary', assetKey: 'species.moon_bunny',
    art: { body: ROUND, head: HEAD, ears: 'long', earSize: 1.15, tail: 'puff', nose: 'button', patterns: ['belly'], extras: ['moonMark'] },
    variants: [
      v('silver', 'Moonbeam', '#dfe3f2', '#ffffff', '#b8c4ff', { dark: '#ffe38a' }),
      v('night', 'Nightsky', '#4a4f8a', '#8f95d6', '#b8c4ff', { dark: '#ffe38a' }),
      v('gold', 'Harvest Moon', '#f0d77a', '#fff6d0', '#ffb3c6', { dark: '#fffaf0' }),
    ] },
]);

export function getSpecies(id: string): SpeciesDef | undefined {
  return SPECIES.find((s) => s.id === id);
}
