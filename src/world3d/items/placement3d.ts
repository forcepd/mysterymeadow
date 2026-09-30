import { layerOf, type PlaceableItemDef } from '../../config/items';
import { tileRect, type Grid } from '../../game/layout';
import type { PlacedItem, Zone } from '../../sim/types';
import { groundRect, toUnits, WALL_ART, wallStripToWall } from '../coords';

/** Where and how a placed item stands in 3D. */
export interface ItemPlacement {
  layer: 'floor' | 'rug' | 'wall';
  /** Center of the footprint (floor) or of the picture (wall). */
  x: number;
  y: number;
  z: number;
  /** The model's own width (x) and depth (z) before turning; for wall items, width and height. */
  w: number;
  d: number;
  /** Turn around the vertical axis (floor), in radians. */
  yaw: number;
  /** Wall items turned 180 degrees are mirrored (a picture can't hang upside down). */
  mirror: boolean;
  /** Height scale: the tile size (tiles are smaller in bigger houses, like the original). */
  s: number;
}

/** The footprint after rotation: 90 and 270 swap width and height (like the sim). */
export function rotatedSize(def: PlaceableItemDef, rotation: PlacedItem['rotation']) {
  return rotation === 90 || rotation === 270 ? { w: def.size.h, h: def.size.w } : def.size;
}

/** The height scale for a grid's tiles. */
export function tileScale(zone: Zone, grid: Grid): number {
  const r = tileRect(zone, grid, { x: 0, y: 0 }, { w: 1, h: 1 });
  return Math.min(1.25, Math.max(0.5, Math.sqrt(toUnits(r.w) * toUnits(r.h)) * 1.15));
}

/**
 * Places an item on its tiles: floor items fill their footprint on the ground, turned by their
 * rotation (clockwise seen from above, like the original's art); wall items hang on the back
 * wall where the original's wall strip is.
 */
export function placeItem(
  def: PlaceableItemDef,
  item: Pick<PlacedItem, 'zone' | 'tile' | 'rotation'>,
  grid: Grid,
): ItemPlacement {
  const layer = layerOf(def);
  const size = rotatedSize(def, item.rotation);
  const wall = layer === 'wall';
  const rect = tileRect(item.zone, grid, item.tile, size, wall);
  const s = tileScale(item.zone, grid);
  if (wall) {
    const top = wallStripToWall({ x: rect.x, y: rect.y });
    const bottom = wallStripToWall({ x: rect.x + rect.w, y: rect.y + rect.h });
    return {
      layer,
      x: (top.x + bottom.x) / 2,
      y: (top.y + bottom.y) / 2,
      z: top.z + 0.03,
      w: bottom.x - top.x,
      d: Math.min(top.y - bottom.y, WALL_ART.top - WALL_ART.bottom),
      yaw: 0,
      mirror: item.rotation === 180,
      s,
    };
  }
  const g = groundRect(rect);
  const turned = item.rotation === 90 || item.rotation === 270;
  return {
    layer,
    x: g.x,
    y: layer === 'rug' ? 0.004 : 0,
    z: g.z,
    // The model is built unturned, so it swaps back to its own width and depth.
    w: turned ? g.d : g.w,
    d: turned ? g.w : g.d,
    yaw: (-item.rotation * Math.PI) / 180,
    mirror: false,
    s,
  };
}
