import { deepFreeze } from './deepFreeze';

/**
 * Everything the player can buy and place (DESIGN 6.5, 12.3, 12.4, 13.1). Adding an item is a
 * data entry here (plus, optionally, its own drawing in src/art/itemSvg.ts). Prices, coziness, and footprints are [DEFAULT, Phase 6]
 * except the yard lures, which are DESIGN 6.5 verbatim.
 */

/** Width x height in tiles, at rotation 0. */
export interface Footprint {
  readonly w: number;
  readonly h: number;
}

interface BaseItemDef {
  readonly id: string;
  readonly name: string;
  readonly cost: number;
  /** Icon for store cards and toasts. */
  readonly icon: string;
  /** Main color of the item's art. */
  readonly color: string;
  readonly assetKey: string;
}

/** Yard lure: raises Lure Score while placed in the yard. */
export interface LureItemDef extends BaseItemDef {
  readonly category: 'lure';
  readonly lure: number;
  /** Species ids this lure attracts within their rarity tier. Empty = general. */
  readonly affinity: readonly string[];
  readonly size: Footprint;
}

/** Food bowl (DESIGN 8.2). Holds `needs.bowlServings`; refilling is free. Yard or house. */
export interface BowlItemDef extends BaseItemDef {
  readonly category: 'bowl';
  readonly size: Footprint;
}

export type FurnitureGroup =
  'seating' | 'table' | 'tv' | 'wallArt' | 'rug' | 'lamp' | 'plant' | 'shelf';

/**
 * Where a house item sits. Items only collide with items on the same layer: rugs go under
 * furniture, and wall art hangs on the wall strip above the floor.
 */
export type Layer = 'floor' | 'rug' | 'wall';

/** House decor: adds Coziness (DESIGN 12.3). */
export interface FurnitureItemDef extends BaseItemDef {
  readonly category: 'furniture';
  readonly group: FurnitureGroup;
  readonly layer: Layer;
  readonly coziness: number;
  readonly size: Footprint;
}

/** Pet bed (DESIGN 12.4): exactly one indoor slot each, plus a small happiness bonus. */
export interface BedItemDef extends BaseItemDef {
  readonly category: 'bed';
  readonly style: 'basic' | 'fluffy' | 'royal';
  /** Happiness per minute for the animal using this bed. */
  readonly happinessPerMinute: number;
  readonly coziness: number;
  readonly size: Footprint;
}

/** Wallpaper or flooring: covers the whole room. Bought once, applied any time. */
export interface SurfaceItemDef extends BaseItemDef {
  readonly category: 'wallpaper' | 'flooring';
  readonly coziness: number;
  /** Free and owned from the start. */
  readonly starter?: true;
}

/** Helper (DESIGN 8.3, 13.1): bought once, works on its own. Behavior in balance.helpers. */
export interface HelperItemDef extends BaseItemDef {
  readonly category: 'helper';
  readonly helper: 'scoopBot' | 'autoFeeder';
  readonly description: string;
}

export type OutfitSlot = 'head' | 'body' | 'face';

/**
 * Pet outfit (DESIGN 10.3), from the Home Store's Pet Boutique. Bought once, then any number of
 * animals can wear it (your choice). `kind` picks the drawing in src/art/outfitSvg.ts.
 */
export interface PetOutfitItemDef extends BaseItemDef {
  readonly category: 'petOutfit';
  readonly slot: OutfitSlot;
  readonly kind: string;
  readonly color2?: string;
}

export type PlaceableItemDef = LureItemDef | BowlItemDef | FurnitureItemDef | BedItemDef;
export type ItemDef = PlaceableItemDef | SurfaceItemDef | HelperItemDef | PetOutfitItemDef;

const one: Footprint = { w: 1, h: 1 };

const lure = (
  id: string,
  name: string,
  cost: number,
  lureValue: number,
  affinity: readonly string[],
  icon: string,
  color: string,
  size: Footprint = one,
): LureItemDef => ({
  id,
  name,
  category: 'lure',
  cost,
  lure: lureValue,
  affinity,
  icon,
  color,
  size,
  assetKey: `item.${id}`,
});

const furniture = (
  id: string,
  name: string,
  group: FurnitureGroup,
  cost: number,
  coziness: number,
  icon: string,
  color: string,
  size: Footprint = one,
  layer: Layer = 'floor',
): FurnitureItemDef => ({
  id,
  name,
  category: 'furniture',
  group,
  layer,
  cost,
  coziness,
  icon,
  color,
  size,
  assetKey: `item.${id}`,
});

const bed = (
  id: string,
  name: string,
  style: BedItemDef['style'],
  cost: number,
  happinessPerMinute: number,
  coziness: number,
  color: string,
): BedItemDef => ({
  id,
  name,
  category: 'bed',
  style,
  cost,
  happinessPerMinute,
  coziness,
  icon: '🛏️',
  color,
  size: one,
  assetKey: `item.${id}`,
});

const outfit = (
  id: string,
  name: string,
  slot: OutfitSlot,
  kind: string,
  cost: number,
  icon: string,
  color: string,
  color2?: string,
): PetOutfitItemDef => ({
  id,
  name,
  category: 'petOutfit',
  slot,
  kind,
  cost,
  icon,
  color,
  ...(color2 ? { color2 } : {}),
  assetKey: `outfit.${id}`,
});

const surface = (
  id: string,
  name: string,
  category: SurfaceItemDef['category'],
  cost: number,
  coziness: number,
  color: string,
  starter = false,
): SurfaceItemDef => ({
  id,
  name,
  category,
  cost,
  coziness,
  icon: category === 'wallpaper' ? '🧱' : '🟫',
  color,
  assetKey: `item.${id}`,
  ...(starter ? { starter: true as const } : {}),
});

// prettier-ignore
export const ITEMS: readonly ItemDef[] = deepFreeze([
  // Yard & Lures (DESIGN 6.5).
  lure('carrot_patch',     'Carrot Patch',     80,   4,  ['bunny', 'piglet'],                          '🥕', '#f28c38'),
  lure('bird_bath',        'Bird Bath',        100,  4,  ['chick', 'duckling', 'owl'],                  '🐦', '#9fd3e8'),
  lure('toy_basket',       'Toy Basket',       120,  5,  ['puppy', 'kitten'],                           '🧺', '#d9a86a'),
  lure('flower_garden',    'Flower Garden',    150,  6,  [],                                            '🌷', '#ff9fc4'),
  lure('little_pond',      'Little Pond',      300,  8,  ['otter', 'duckling', 'penguin', 'axolotl'],   '💧', '#6fc3e8', { w: 2, h: 1 }),
  lure('bamboo_grove',     'Bamboo Grove',     400,  8,  ['red_panda'],                                 '🎋', '#7cc46a'),
  lure('eucalyptus_tree',  'Eucalyptus Tree',  600,  10, ['koala'],                                     '🌳', '#6aa88a'),
  lure('warm_rock',        'Warm Rock',        900,  12, ['baby_dragon'],                               '🪨', '#c9a27a'),
  lure('rainbow_fountain', 'Rainbow Fountain', 1500, 15, ['unicorn'],                                   '⛲', '#b69bff', { w: 2, h: 1 }),
  lure('moon_lantern',     'Moon Lantern',     1500, 15, ['moon_bunny'],                                '🏮', '#ffe38a'),

  // Food & Treats.
  { id: 'food_bowl', name: 'Food Bowl', category: 'bowl', cost: 40, icon: '🥣', color: '#6fa8dc', size: one, assetKey: 'item.food_bowl' },

  // Furniture (DESIGN 12.3 categories).
  furniture('armchair',      'Comfy Armchair',  'seating', 90,  6,  '🪑', '#e8a0a0'),
  furniture('sofa',          'Big Soft Sofa',   'seating', 220, 12, '🛋️', '#8fb8e8', { w: 2, h: 1 }),
  furniture('side_table',    'Little Table',    'table',   60,  3,  '🪵', '#c9a27a'),
  furniture('dining_table',  'Picnic Table',    'table',   150, 6,  '🍽️', '#b98a5e', { w: 2, h: 1 }),
  furniture('tv',            'Cartoon TV',      'tv',      250, 8,  '📺', '#5a5f73'),
  furniture('sun_picture',   'Sunshine Picture', 'wallArt', 70, 4,  '🌞', '#ffd84d', one, 'wall'),
  furniture('paw_poster',    'Paw Print Poster', 'wallArt', 90, 5,  '🐾', '#ff9fc4', { w: 2, h: 1 }, 'wall'),
  furniture('round_rug',     'Round Rug',       'rug',     80,  6,  '⭕', '#f6c65b', { w: 2, h: 2 }, 'rug'),
  furniture('rainbow_rug',   'Rainbow Rug',     'rug',     180, 10, '🌈', '#b69bff', { w: 3, h: 2 }, 'rug'),
  furniture('floor_lamp',    'Glow Lamp',       'lamp',    70,  5,  '💡', '#ffe38a'),
  furniture('fairy_lights',  'Fairy Lights',    'lamp',    120, 8,  '✨', '#ffd1e8', { w: 2, h: 1 }, 'wall'),
  furniture('potted_plant',  'Potted Plant',    'plant',   50,  4,  '🪴', '#7cc46a'),
  furniture('flower_pot',    'Flower Pot',      'plant',   60,  4,  '🌻', '#ffd84d'),
  furniture('bookshelf',     'Bookshelf',       'shelf',   130, 7,  '📚', '#a57a5a', { w: 2, h: 1 }),
  furniture('toy_shelf',     'Toy Shelf',       'shelf',   110, 6,  '🧸', '#e8b865'),

  // Pet Beds (DESIGN 12.4): one indoor slot each; styles differ only in looks and bonus.
  bed('bed_basic',  'Basic Bed',  'basic',  60,  0.25, 2, '#c9c4b5'),
  bed('bed_fluffy', 'Fluffy Bed', 'fluffy', 150, 0.5,  4, '#ffd1e8'),
  bed('bed_royal',  'Royal Bed',  'royal',  400, 1,    8, '#b69bff'),

  // Wallpaper and flooring.
  surface('wallpaper_cream',   'Creamy Walls',    'wallpaper', 0,   0, '#fbf1dc', true),
  surface('wallpaper_mint',    'Mint Stripes',    'wallpaper', 80,  4, '#cdeee0'),
  surface('wallpaper_berry',   'Berry Hearts',    'wallpaper', 120, 6, '#f9d2e1'),
  surface('wallpaper_sky',     'Sky and Clouds',  'wallpaper', 160, 8, '#cfe6fb'),
  surface('flooring_wood',     'Honey Wood',      'flooring',  0,   0, '#e3c08f', true),
  surface('flooring_checker',  'Checker Tiles',   'flooring',  90,  4, '#f2e3c9'),
  surface('flooring_carpet',   'Cozy Carpet',     'flooring',  150, 8, '#d8c3f0'),

  // Pet Boutique (DESIGN 10.3). [DEFAULT, Phase 9] prices (coins).
  outfit('party_hat',    'Party Hat',     'head', 'party',   40,  '🥳', '#ff8fc4', '#ffd84d'),
  outfit('big_bow',      'Big Bow',       'head', 'bow',     35,  '🎀', '#ff6f9a'),
  outfit('flower_clip',  'Flower Clip',   'head', 'flower',  30,  '🌼', '#ffd84d', '#ff9fc4'),
  outfit('pet_crown',    'Royal Crown',   'head', 'crown',   120, '👑', '#ffd84d'),
  outfit('cozy_sweater', 'Cozy Sweater',  'body', 'sweater', 60,  '🧶', '#6fa8ef', '#ffffff'),
  outfit('hero_cape',    'Hero Cape',     'body', 'cape',    80,  '🦸', '#ef6f6f', '#ffd84d'),
  outfit('pet_tutu',     'Tutu',          'body', 'tutu',    70,  '🩰', '#ffd1e8'),
  outfit('warm_scarf',   'Warm Scarf',    'body', 'scarf',   45,  '🧣', '#7cc46a', '#ffffff'),
  outfit('round_specs',  'Round Glasses', 'face', 'glasses', 40,  '👓', '#4a3b33'),
  outfit('bandana',      'Bandana',       'face', 'bandana', 35,  '🔴', '#ef6f6f', '#ffffff'),
  outfit('star_shades',  'Star Shades',   'face', 'star',    90,  '⭐', '#ff6f9a'),

  // Helpers (DESIGN 8.3, 13.1). [DEFAULT, Phase 7] prices.
  { id: 'scoop_bot',   name: 'Scoop Bot',   category: 'helper', helper: 'scoopBot',   cost: 500, icon: '🤖', color: '#a7cdef', assetKey: 'item.scoop_bot',
    description: 'Cleans up one poop in the yard every minute' },
  { id: 'auto_feeder', name: 'Auto-Feeder', category: 'helper', helper: 'autoFeeder', cost: 400, icon: '🍽️', color: '#f6c65b', assetKey: 'item.auto_feeder',
    description: 'Refills empty food bowls by itself' },
]);

export function getItem(id: string): ItemDef | undefined {
  return ITEMS.find((i) => i.id === id);
}

export function isPlaceable(def: ItemDef): def is PlaceableItemDef {
  return (
    def.category === 'lure' ||
    def.category === 'bowl' ||
    def.category === 'furniture' ||
    def.category === 'bed'
  );
}

/** Which zone(s) an item can be placed in. */
export function allowedZones(def: PlaceableItemDef): readonly ('yard' | 'house')[] {
  if (def.category === 'lure') return ['yard'];
  if (def.category === 'bowl') return ['yard', 'house'];
  return ['house'];
}

/** Layer an item occupies: lures, bowls, and beds sit on the floor. */
export function layerOf(def: PlaceableItemDef): Layer {
  return def.category === 'furniture' ? def.layer : 'floor';
}

/** Coziness a placed or applied item adds (0 for lures and bowls). */
export function cozinessOf(def: ItemDef): number {
  return 'coziness' in def ? def.coziness : 0;
}

export const DEFAULT_WALLPAPER = 'wallpaper_cream';
export const DEFAULT_FLOORING = 'flooring_wood';
