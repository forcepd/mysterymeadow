import { ANIMAL_VIEW, animalKey, animalSvg, mysterySvg, type AnimalLook } from '../art/animalSvg';
import { itemKey, itemSvg } from '../art/itemSvg';
import { svgDataUri, type ViewBox } from '../art/svg';
import { ITEMS, isPlaceable, type PlaceableItemDef } from '../config/items';
import { SPECIES, getSpecies } from '../config/species';

/**
 * Asset manifest (DESIGN 16.2). Game code asks for art by asset key; the manifest says where it
 * comes from. Today everything is parametric SVG, built on demand. To swap in hand-drawn or
 * commissioned art later, point a key at an image URL (`{ kind: 'image' }`): no game logic changes.
 */
export type AssetSource =
  | { readonly kind: 'parametricAnimal'; readonly speciesId: string }
  | { readonly kind: 'parametricItem'; readonly itemId: string }
  | { readonly kind: 'image'; readonly url: string; readonly w: number; readonly h: number };

export const MYSTERY_KEY = 'animal.mystery';

export const ASSET_MANIFEST: Readonly<Record<string, AssetSource>> = Object.freeze({
  ...Object.fromEntries(
    SPECIES.map((s) => [s.assetKey, { kind: 'parametricAnimal', speciesId: s.id } as const]),
  ),
  ...Object.fromEntries(
    ITEMS.filter(isPlaceable).map((i) => [
      i.assetKey,
      { kind: 'parametricItem', itemId: i.id } as const,
    ]),
  ),
});

export interface ArtRequest {
  /** Texture / cache key: the same key always means the same picture. */
  readonly key: string;
  /** Data URI or URL for an <img> or a texture. */
  readonly uri: () => string;
  /** Size in world px at scale 1. */
  readonly size: { readonly w: number; readonly h: number };
  /** Where sprite-space (0, 0) is, as a fraction of the picture (for Phaser origins). */
  readonly origin: { readonly x: number; readonly y: number };
}

const originOf = (v: ViewBox) => ({ x: -v.x / v.w, y: -v.y / v.h });

/** An animal's picture, with outfit and Sparkle. */
export function animalArt(look: AnimalLook, view: ViewBox = ANIMAL_VIEW): ArtRequest {
  const assetKey = getSpecies(look.speciesId)?.assetKey ?? '';
  const source = ASSET_MANIFEST[assetKey];
  if (source?.kind === 'image') {
    return {
      key: assetKey,
      uri: () => source.url,
      size: { w: source.w, h: source.h },
      origin: { x: 0.5, y: 0.85 },
    };
  }
  const viewSuffix = view === ANIMAL_VIEW ? '' : `.${view.x},${view.y},${view.w},${view.h}`;
  return {
    key: animalKey(look) + viewSuffix,
    uri: () => svgDataUri(animalSvg(look, view)),
    size: { w: view.w, h: view.h },
    origin: originOf(view),
  };
}

/** The unrevealed visitor. */
export function mysteryArt(): ArtRequest {
  return {
    key: MYSTERY_KEY,
    uri: () => svgDataUri(mysterySvg()),
    size: { w: ANIMAL_VIEW.w, h: ANIMAL_VIEW.h },
    origin: originOf(ANIMAL_VIEW),
  };
}

/** A placed item filling a `w` x `h` footprint (world px), turned to `rotation`. */
export function itemArt(def: PlaceableItemDef, w: number, h: number, rotation: number): ArtRequest {
  const source = ASSET_MANIFEST[def.assetKey];
  if (source?.kind === 'image') {
    return {
      key: `${def.assetKey}.r${rotation}`,
      uri: () => source.url,
      size: { w, h },
      origin: { x: 0.5, y: 0.5 },
    };
  }
  return {
    key: itemKey(def, w, h, rotation),
    uri: () => svgDataUri(itemSvg(def, w, h, rotation)),
    size: { w, h },
    origin: { x: 0.5, y: 0.5 },
  };
}
