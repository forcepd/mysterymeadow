import { deepFreeze } from './deepFreeze';

/**
 * Avatar parts and clothes (DESIGN 13.3). `cost: 0` = the free starter set; everything else is
 * sold in the Boutique for gems. Adding an item = a data entry here (it reuses one of the
 * renderer's `kind`s, or gets new art in the Phase 10 pass).
 *
 * Body shape and skin tone are never sold: every choice there is free.
 */

export const AVATAR_SLOTS = [
  'bodyShape',
  'skinTone',
  'eyes',
  'brows',
  'mouth',
  'hairStyle',
  'hairColor',
  'blush',
  'eyeshadow',
  'lips',
  'face',
  'top',
  'bottom',
  'onePiece',
  'shoes',
  'hat',
  'glasses',
  'bag',
  'earrings',
] as const;
export type AvatarSlot = (typeof AVATAR_SLOTS)[number];

/** Slots that must always have something (the rest can be empty). */
export const REQUIRED_SLOTS: readonly AvatarSlot[] = [
  'bodyShape',
  'skinTone',
  'eyes',
  'brows',
  'mouth',
  'hairStyle',
  'hairColor',
];

export const MAKEUP_SLOTS = ['blush', 'eyeshadow', 'lips', 'face'] as const;
export const ACCESSORY_SLOTS = ['hat', 'glasses', 'bag', 'earrings'] as const;

export interface AvatarItemDef {
  readonly id: string;
  readonly slot: AvatarSlot;
  readonly name: string;
  /** Gems. 0 = free starter item. */
  readonly cost: number;
  /** Which drawing the renderer uses (e.g. hair "bob", top "hoodie"). */
  readonly kind: string;
  readonly color: string;
  readonly color2?: string;
  /** Never sold or offered: only worn on a special day (see birthday.ts). */
  readonly special?: boolean;
}

/** Boutique categories (DESIGN 13.3), in shop order. */
export const AVATAR_CATEGORIES: readonly {
  id: string;
  name: string;
  icon: string;
  slots: readonly AvatarSlot[];
}[] = deepFreeze([
  { id: 'body', name: 'Body', icon: '🙂', slots: ['bodyShape', 'skinTone'] },
  { id: 'face', name: 'Face', icon: '👀', slots: ['eyes', 'brows', 'mouth'] },
  { id: 'hair', name: 'Hair', icon: '💇', slots: ['hairStyle', 'hairColor'] },
  { id: 'makeup', name: 'Makeup', icon: '💄', slots: ['blush', 'eyeshadow', 'lips', 'face'] },
  { id: 'clothes', name: 'Clothes', icon: '👕', slots: ['top', 'bottom', 'onePiece'] },
  { id: 'shoes', name: 'Shoes', icon: '👟', slots: ['shoes'] },
  { id: 'extras', name: 'Accessories', icon: '🎀', slots: ['hat', 'glasses', 'bag', 'earrings'] },
]);

export const SLOT_NAMES: Readonly<Record<AvatarSlot, string>> = deepFreeze({
  bodyShape: 'Body',
  skinTone: 'Skin',
  eyes: 'Eyes',
  brows: 'Eyebrows',
  mouth: 'Mouth',
  hairStyle: 'Hairstyle',
  hairColor: 'Hair color',
  blush: 'Blush',
  eyeshadow: 'Eyeshadow',
  lips: 'Lips',
  face: 'Face paint',
  top: 'Tops',
  bottom: 'Bottoms',
  onePiece: 'Dresses',
  shoes: 'Shoes',
  hat: 'Hats',
  glasses: 'Glasses',
  bag: 'Bags',
  earrings: 'Earrings',
});

const i = (
  slot: AvatarSlot,
  id: string,
  name: string,
  cost: number,
  kind: string,
  color: string,
  color2?: string,
): AvatarItemDef => ({ id, slot, name, cost, kind, color, ...(color2 ? { color2 } : {}) });

// prettier-ignore
export const AVATAR_ITEMS: readonly AvatarItemDef[] = deepFreeze([
  // Body shape and skin tone: always free.
  i('bodyShape', 'body_slim',    'Slim',    0, 'slim',    '#000'),
  i('bodyShape', 'body_regular', 'Regular', 0, 'regular', '#000'),
  i('bodyShape', 'body_round',   'Round',   0, 'round',   '#000'),
  i('skinTone', 'skin_1', 'Skin 1', 0, 'skin', '#fbe3d0'),
  i('skinTone', 'skin_2', 'Skin 2', 0, 'skin', '#f5cfae'),
  i('skinTone', 'skin_3', 'Skin 3', 0, 'skin', '#e8b48a'),
  i('skinTone', 'skin_4', 'Skin 4', 0, 'skin', '#d49a6a'),
  i('skinTone', 'skin_5', 'Skin 5', 0, 'skin', '#b87a4b'),
  i('skinTone', 'skin_6', 'Skin 6', 0, 'skin', '#94593a'),
  i('skinTone', 'skin_7', 'Skin 7', 0, 'skin', '#6e3f28'),
  i('skinTone', 'skin_8', 'Skin 8', 0, 'skin', '#4a2a1c'),

  // Face.
  i('eyes', 'eyes_round',   'Round eyes',   0,  'round',   '#3b2a24'),
  i('eyes', 'eyes_happy',   'Happy eyes',   0,  'happy',   '#3b2a24'),
  i('eyes', 'eyes_wide',    'Wide eyes',    0,  'wide',    '#3b2a24'),
  i('eyes', 'eyes_sparkle', 'Sparkly eyes', 20, 'sparkle', '#3b2a24'),
  i('eyes', 'eyes_wink',    'Wink',         25, 'wink',    '#3b2a24'),
  i('brows', 'brows_soft',   'Soft brows',   0, 'soft',   '#5a3d2b'),
  i('brows', 'brows_arched', 'Arched brows', 0, 'arched', '#5a3d2b'),
  i('brows', 'brows_bold',   'Bold brows',   0, 'bold',   '#5a3d2b'),
  i('mouth', 'mouth_smile', 'Smile',      0,  'smile', '#8a3b3b'),
  i('mouth', 'mouth_grin',  'Big grin',   0,  'grin',  '#8a3b3b'),
  i('mouth', 'mouth_o',     'Surprised',  0,  'o',     '#8a3b3b'),
  i('mouth', 'mouth_tongue','Silly face', 15, 'tongue','#8a3b3b'),

  // Hair.
  i('hairStyle', 'hair_short',    'Short',      0,  'short',    '#000'),
  i('hairStyle', 'hair_bob',      'Bob',        0,  'bob',      '#000'),
  i('hairStyle', 'hair_ponytail', 'Ponytail',   0,  'ponytail', '#000'),
  i('hairStyle', 'hair_long',     'Long',       20, 'long',     '#000'),
  i('hairStyle', 'hair_curly',    'Curly',      25, 'curly',    '#000'),
  i('hairStyle', 'hair_buns',     'Space buns', 30, 'buns',     '#000'),
  i('hairStyle', 'hair_spiky',    'Spiky',      30, 'spiky',    '#000'),
  i('hairColor', 'haircolor_brown',  'Brown',  0,  'color', '#6b4226'),
  i('hairColor', 'haircolor_black',  'Black',  0,  'color', '#2b2220'),
  i('hairColor', 'haircolor_blonde', 'Blonde', 0,  'color', '#e8c46a'),
  i('hairColor', 'haircolor_red',    'Red',    0,  'color', '#b8532b'),
  i('hairColor', 'haircolor_pink',   'Pink',   20, 'color', '#ff8fc4'),
  i('hairColor', 'haircolor_blue',   'Blue',   20, 'color', '#6fa8ef'),
  i('hairColor', 'haircolor_purple', 'Purple', 25, 'color', '#9b7be0'),
  i('hairColor', 'haircolor_mint',   'Mint',   25, 'color', '#7fd6b4'),

  // Makeup.
  i('blush', 'blush_pink',  'Pink blush',  0,  'blush', '#ff9fb5'),
  i('blush', 'blush_peach', 'Peach blush', 10, 'blush', '#ffb38a'),
  i('blush', 'blush_heart', 'Heart blush', 20, 'heart', '#ff7fa8'),
  i('eyeshadow', 'shadow_lilac', 'Lilac shadow', 10, 'shadow', '#c7a6f0'),
  i('eyeshadow', 'shadow_sky',   'Sky shadow',   10, 'shadow', '#9fd0f5'),
  i('eyeshadow', 'shadow_gold',  'Gold shadow',  20, 'shadow', '#f5d06a'),
  i('lips', 'lips_rose',  'Rose lips',  0,  'lips', '#e0628b'),
  i('lips', 'lips_berry', 'Berry lips', 10, 'lips', '#a8386b'),
  i('lips', 'lips_coral', 'Coral lips', 10, 'lips', '#ff7f6a'),
  i('face', 'face_glitter',  'Glitter',        15, 'glitter', '#ffd84d'),
  i('face', 'face_heart',    'Heart paint',    15, 'heart',   '#ff6f9a'),
  i('face', 'face_whiskers', 'Kitty whiskers', 20, 'whiskers','#4a3b33'),

  // Clothes.
  i('top', 'top_tee_red',     'Red tee',        0,  'tee',     '#ef6f6f'),
  i('top', 'top_tee_blue',    'Blue tee',       0,  'tee',     '#6fa8ef'),
  i('top', 'top_stripes',     'Stripy shirt',   0,  'stripes', '#fff6e3', '#6fc3a8'),
  i('top', 'top_hoodie',      'Cozy hoodie',    30, 'hoodie',  '#b69bff'),
  i('top', 'top_sweater',     'Heart sweater',  40, 'heart',   '#ff9fc4', '#ffffff'),
  i('top', 'top_star',        'Star tee',       35, 'star',    '#2f3a6c', '#ffd84d'),
  i('top', 'top_rainbow',     'Rainbow top',    60, 'rainbow', '#ff9f9f', '#9fd0f5'),
  i('bottom', 'bottom_jeans',   'Jeans',        0,  'pants',   '#5a7fb8'),
  i('bottom', 'bottom_shorts',  'Shorts',       0,  'shorts',  '#e8b865'),
  i('bottom', 'bottom_skirt',   'Pink skirt',   0,  'skirt',   '#ff9fc4'),
  i('bottom', 'bottom_tutu',    'Tutu',         35, 'tutu',    '#ffd1e8'),
  i('bottom', 'bottom_plaid',   'Plaid skirt',  30, 'skirt',   '#c05050', '#f3ead6'),
  i('bottom', 'bottom_joggers', 'Joggers',      25, 'pants',   '#7cc46a'),
  i('onePiece', 'dress_sun',     'Sundress',      0,  'dress',     '#ffd84d'),
  i('onePiece', 'dress_party',   'Party dress',   50, 'dress',     '#b69bff', '#ffffff'),
  i('onePiece', 'overalls',      'Overalls',      40, 'overalls',  '#5a7fb8', '#ffffff'),
  i('onePiece', 'dress_star',    'Starry gown',   80, 'gown',      '#2f3a6c', '#ffd84d'),
  i('shoes', 'shoes_sneakers', 'Sneakers',     0,  'sneakers', '#ffffff', '#ef6f6f'),
  i('shoes', 'shoes_boots',    'Boots',        0,  'boots',    '#8b5e3c'),
  i('shoes', 'shoes_sandals',  'Sandals',      0,  'sandals',  '#e8b865'),
  i('shoes', 'shoes_sparkle',  'Sparkle shoes',30, 'sneakers', '#ffd1e8', '#ffd84d'),
  i('shoes', 'shoes_rain',     'Rain boots',   25, 'boots',    '#ffd84d'),
  i('shoes', 'shoes_bunny',    'Bunny slippers',45, 'slippers', '#fff6e3', '#ff9fc4'),

  // Accessories.
  i('hat', 'hat_cap',     'Cap',           0,  'cap',    '#ef6f6f'),
  i('hat', 'hat_flowers', 'Flower crown',  35, 'flowers','#7cc46a', '#ff9fc4'),
  i('hat', 'hat_crown',   'Tiny crown',    60, 'crown',  '#ffd84d'),
  i('hat', 'hat_ears',    'Bunny ears',    40, 'ears',   '#fff6e3', '#ff9fc4'),
  { ...i('hat', 'hat_birthday', 'Birthday hat', 0, 'party', '#b69bff', '#ffd84d'), special: true },
  i('glasses', 'glasses_round', 'Round glasses', 0,  'round', '#4a3b33'),
  i('glasses', 'glasses_star',  'Star glasses',  30, 'star',  '#ff6f9a'),
  i('glasses', 'glasses_sun',   'Sunglasses',    25, 'sun',   '#2b2220'),
  i('bag', 'bag_backpack', 'Backpack',    20, 'backpack', '#6fc3a8'),
  i('bag', 'bag_purse',    'Little purse',30, 'purse',    '#ff9fc4'),
  i('earrings', 'earrings_studs', 'Studs', 0,  'studs', '#ffd84d'),
  i('earrings', 'earrings_hoops', 'Hoops', 15, 'hoops', '#ffd84d'),
  i('earrings', 'earrings_hearts','Heart earrings', 25, 'hearts', '#ff6f9a'),
]);

export function getAvatarItem(id: string): AvatarItemDef | undefined {
  return AVATAR_ITEMS.find((a) => a.id === id);
}

/** What the Boutique and Wardrobe offer for a slot (special-day items are never offered). */
export function itemsForSlot(slot: AvatarSlot): AvatarItemDef[] {
  return AVATAR_ITEMS.filter((a) => a.slot === slot && !a.special);
}
