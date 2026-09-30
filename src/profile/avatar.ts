import {
  ACCESSORY_SLOTS,
  AVATAR_ITEMS,
  MAKEUP_SLOTS,
  REQUIRED_SLOTS,
  getAvatarItem,
  type AvatarSlot,
} from '../config/avatarItems';

/** DESIGN 19 AvatarLoadout: one item id per slot (makeup and accessories are optional). */
export interface AvatarLoadout {
  bodyShape: string;
  skinTone: string;
  eyes: string;
  brows: string;
  mouth: string;
  hairStyle: string;
  hairColor: string;
  makeup: { blush?: string; eyeshadow?: string; lips?: string; face?: string };
  top?: string;
  bottom?: string;
  onePiece?: string;
  shoes?: string;
  /** At most one per accessory slot (hat, glasses, bag, earrings). */
  accessories: string[];
}

/** What a brand new avatar wears (all free starter items). */
export const DEFAULT_LOADOUT: AvatarLoadout = {
  bodyShape: 'body_regular',
  skinTone: 'skin_3',
  eyes: 'eyes_round',
  brows: 'brows_soft',
  mouth: 'mouth_smile',
  hairStyle: 'hair_short',
  hairColor: 'haircolor_brown',
  makeup: {},
  top: 'top_tee_blue',
  bottom: 'bottom_jeans',
  shoes: 'shoes_sneakers',
  accessories: [],
};

export function isStarter(itemId: string): boolean {
  return getAvatarItem(itemId)?.cost === 0;
}

/** Starter items are everyone's; Boutique items once bought. */
export function owns(owned: readonly string[], itemId: string): boolean {
  return isStarter(itemId) || owned.includes(itemId);
}

const isMakeup = (slot: AvatarSlot): slot is (typeof MAKEUP_SLOTS)[number] =>
  (MAKEUP_SLOTS as readonly string[]).includes(slot);
const isAccessory = (slot: AvatarSlot) => (ACCESSORY_SLOTS as readonly string[]).includes(slot);

/** The item worn in a slot, if any. */
export function wornIn(loadout: AvatarLoadout, slot: AvatarSlot): string | undefined {
  if (isMakeup(slot)) return loadout.makeup[slot];
  if (isAccessory(slot)) return loadout.accessories.find((id) => getAvatarItem(id)?.slot === slot);
  return (loadout as unknown as Record<string, string | undefined>)[slot];
}

/** Every item id the avatar is wearing. */
export function wornItems(loadout: AvatarLoadout): string[] {
  const ids = [
    loadout.bodyShape,
    loadout.skinTone,
    loadout.eyes,
    loadout.brows,
    loadout.mouth,
    loadout.hairStyle,
    loadout.hairColor,
    ...Object.values(loadout.makeup),
    loadout.top,
    loadout.bottom,
    loadout.onePiece,
    loadout.shoes,
    ...loadout.accessories,
  ];
  return ids.filter((id): id is string => typeof id === 'string');
}

/**
 * Puts an item on (replacing whatever was in its slot). A one-piece takes the place of the top
 * and bottom, and a top or bottom takes the place of a one-piece. Returns a new loadout.
 */
export function equip(loadout: AvatarLoadout, itemId: string): AvatarLoadout {
  const def = getAvatarItem(itemId);
  if (!def) return loadout;
  const next: AvatarLoadout = {
    ...loadout,
    makeup: { ...loadout.makeup },
    accessories: [...loadout.accessories],
  };
  const slot = def.slot;
  if (isMakeup(slot)) next.makeup[slot] = itemId;
  else if (isAccessory(slot)) {
    next.accessories = next.accessories.filter((id) => getAvatarItem(id)?.slot !== slot);
    next.accessories.push(itemId);
  } else if (slot === 'onePiece') {
    next.onePiece = itemId;
    delete next.top;
    delete next.bottom;
  } else if (slot === 'top' || slot === 'bottom') {
    next[slot] = itemId;
    delete next.onePiece;
  } else {
    (next as unknown as Record<string, string>)[slot] = itemId;
  }
  return next;
}

/** Takes off whatever is in an optional slot. Required slots (face, hair, body) stay. */
export function unequip(loadout: AvatarLoadout, slot: AvatarSlot): AvatarLoadout {
  if (REQUIRED_SLOTS.includes(slot)) return loadout;
  const next: AvatarLoadout = {
    ...loadout,
    makeup: { ...loadout.makeup },
    accessories: loadout.accessories.filter((id) => getAvatarItem(id)?.slot !== slot),
  };
  if (isMakeup(slot)) delete next.makeup[slot];
  else if (slot === 'top' || slot === 'bottom' || slot === 'onePiece' || slot === 'shoes') {
    delete next[slot];
  }
  return next;
}

/**
 * True if every worn item exists, is owned, and sits in its own slot, and every required slot
 * is filled. Used to check outfits from saves and imports.
 */
export function isValidLoadout(loadout: AvatarLoadout, owned: readonly string[]): boolean {
  for (const slot of REQUIRED_SLOTS) {
    const id = wornIn(loadout, slot);
    if (!id || getAvatarItem(id)?.slot !== slot) return false;
  }
  return wornItems(loadout).every((id) => getAvatarItem(id) !== undefined && owns(owned, id));
}

/** Starter ids per slot (the Creator in onboarding shows only these). */
export function starterItems(slot: AvatarSlot) {
  return AVATAR_ITEMS.filter((a) => a.slot === slot && a.cost === 0);
}
