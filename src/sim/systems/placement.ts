import { BALANCE } from '../../config/balance';
import {
  allowedZones,
  getItem,
  isPlaceable,
  layerOf,
  type Footprint,
  type Layer,
  type PlaceableItemDef,
} from '../../config/items';
import { YARD_GRID } from '../../config/yard';
import { nextId, type SimContext } from '../context';
import type { CommandResult, PlacedItem, WorldState, Zone } from '../types';
import { addCoins } from './economy';
import { getHouseTier } from './housing';
import { evictExtraIndoors } from './zones';

/**
 * Buying and placing items (DESIGN 6.5, 12.3): a tile grid per zone. The yard is YARD_GRID;
 * the house floor is the tier's interior grid, with a one-row wall strip above it for wall art.
 * Items only collide with items on the same layer (rugs go under furniture).
 */

export type Rotation = PlacedItem['rotation'];
export interface Tile {
  x: number;
  y: number;
}

export function gridSize(world: WorldState, zone: Zone, layer: Layer = 'floor') {
  if (zone === 'yard') return { cols: YARD_GRID.cols, rows: YARD_GRID.rows };
  const [cols, rows] = getHouseTier(world).interiorGrid;
  return { cols, rows: layer === 'wall' ? 1 : rows };
}

/** Center of a floor tile in a zone, in the 0..1 coordinates animals use. */
export function tileCenterIn(world: WorldState, zone: Zone, tile: Tile): { x: number; y: number } {
  const { cols, rows } = gridSize(world, zone);
  return { x: (tile.x + 0.5) / cols, y: (tile.y + 0.5) / rows };
}

/** The footprint after rotation: 90 and 270 swap width and height. */
export function rotatedSize(size: Footprint, rotation: Rotation): Footprint {
  return rotation === 90 || rotation === 270 ? { w: size.h, h: size.w } : size;
}

/** Wall items can only turn around (a picture can't lie on its side). */
function rotationsFor(def: PlaceableItemDef): Rotation[] {
  return layerOf(def) === 'wall' ? [0, 180] : [0, 90, 180, 270];
}

function cells(tile: Tile, size: Footprint): string[] {
  const out: string[] = [];
  for (let dx = 0; dx < size.w; dx++) {
    for (let dy = 0; dy < size.h; dy++) out.push(`${tile.x + dx},${tile.y + dy}`);
  }
  return out;
}

function placedDef(item: PlacedItem): PlaceableItemDef | undefined {
  const def = getItem(item.itemId);
  return def && isPlaceable(def) ? def : undefined;
}

export function lureSlots(world: WorldState): number {
  return getHouseTier(world).lureSlots;
}

export function luresPlaced(world: WorldState): number {
  return world.placedItems.filter((p) => p.zone === 'yard' && placedDef(p)?.category === 'lure')
    .length;
}

/** How many of an item the player has: unplaced in inventory, plus placed. */
export function ownedCount(world: WorldState, itemId: string): number {
  const placed = world.placedItems.filter((p) => p.itemId === itemId).length;
  const def = getItem(itemId);
  const starter = def && 'starter' in def && def.starter ? 1 : 0;
  return (world.inventory[itemId] ?? 0) + placed + starter;
}

/** Can `itemId` go at `tile` in `zone`? `movingId` is an already-placed item being moved. */
export function canPlace(
  world: WorldState,
  itemId: string,
  zone: Zone,
  tile: Tile,
  rotation: Rotation = 0,
  movingId?: string,
): CommandResult {
  const def = getItem(itemId);
  if (!def || !isPlaceable(def)) return { ok: false, reason: 'That can’t be placed.' };
  if (!allowedZones(def).includes(zone)) {
    return {
      ok: false,
      reason: zone === 'yard' ? 'That goes inside the house.' : 'That goes in the yard.',
    };
  }
  if (!rotationsFor(def).includes(rotation))
    return { ok: false, reason: 'It can’t turn that way.' };
  const layer = layerOf(def);
  const size = rotatedSize(def.size, rotation);
  const { cols, rows } = gridSize(world, zone, layer);
  if (tile.x < 0 || tile.y < 0 || tile.x + size.w > cols || tile.y + size.h > rows) {
    return { ok: false, reason: 'It doesn’t fit there.' };
  }
  const taken = new Set<string>();
  for (const p of world.placedItems) {
    if (p.id === movingId || p.zone !== zone) continue;
    const other = placedDef(p);
    if (!other || layerOf(other) !== layer) continue;
    for (const c of cells(p.tile, rotatedSize(other.size, p.rotation))) taken.add(c);
  }
  if (cells(tile, size).some((c) => taken.has(c))) {
    return { ok: false, reason: 'Something is already there.' };
  }
  if (def.category === 'lure' && zone === 'yard') {
    const moving = world.placedItems.find((p) => p.id === movingId);
    const alreadyCounted = moving?.zone === 'yard';
    if (!alreadyCounted && luresPlaced(world) >= lureSlots(world)) {
      return { ok: false, reason: `All ${lureSlots(world)} lure slots are full!` };
    }
  }
  return { ok: true };
}

/** Home Store purchase: into the inventory. Wallpaper and flooring are bought once. */
export function buyItem(ctx: SimContext, itemId: string): CommandResult {
  const world = ctx.state.world;
  const def = getItem(itemId);
  if (!def) return { ok: false, reason: 'That’s not in the store.' };
  if (!isPlaceable(def) && ownedCount(world, itemId) > 0) {
    return { ok: false, reason: 'You already have it!' };
  }
  if (world.coins < def.cost) return { ok: false, reason: 'Not enough coins!' };
  addCoins(ctx, -def.cost);
  world.inventory[itemId] = (world.inventory[itemId] ?? 0) + 1;
  ctx.emit('itemBought', { itemId });
  return { ok: true };
}

/** Places one from the inventory. Returns the new placed item's id. */
export function placeItem(
  ctx: SimContext,
  itemId: string,
  zone: Zone,
  tile: Tile,
  rotation: Rotation = 0,
): CommandResult & { placedId?: string } {
  const world = ctx.state.world;
  if ((world.inventory[itemId] ?? 0) < 1)
    return { ok: false, reason: 'You don’t have one to place.' };
  const check = canPlace(world, itemId, zone, tile, rotation);
  if (!check.ok) return check;
  world.inventory[itemId] = (world.inventory[itemId] ?? 0) - 1;
  if (world.inventory[itemId] === 0) delete world.inventory[itemId];
  const item: PlacedItem = { id: nextId(ctx, 'i'), itemId, zone, tile: { ...tile }, rotation };
  if (placedDef(item)?.category === 'bowl') item.servings = BALANCE.needs.bowlServings;
  world.placedItems.push(item);
  ctx.emit('itemPlaced', { item });
  return { ok: true, placedId: item.id };
}

/** Moves a placed item to another tile (in the same zone). */
export function moveItem(ctx: SimContext, placedId: string, tile: Tile): CommandResult {
  const item = ctx.state.world.placedItems.find((p) => p.id === placedId);
  if (!item) return { ok: false, reason: 'Can’t find that item.' };
  const check = canPlace(ctx.state.world, item.itemId, item.zone, tile, item.rotation, item.id);
  if (!check.ok) return check;
  item.tile = { ...tile };
  ctx.emit('itemMoved', { item });
  return { ok: true };
}

/** Turns a placed item to the next rotation that fits where it is. */
export function rotateItem(ctx: SimContext, placedId: string): CommandResult {
  const world = ctx.state.world;
  const item = world.placedItems.find((p) => p.id === placedId);
  const def = item && placedDef(item);
  if (!item || !def) return { ok: false, reason: 'Can’t find that item.' };
  const options = rotationsFor(def);
  const start = options.indexOf(item.rotation);
  for (let i = 1; i < options.length; i++) {
    const rotation = options[(start + i) % options.length]!;
    if (canPlace(world, item.itemId, item.zone, item.tile, rotation, item.id).ok) {
      item.rotation = rotation;
      ctx.emit('itemMoved', { item });
      return { ok: true };
    }
  }
  return { ok: false, reason: 'No room to turn it here.' };
}

/** Back into the inventory. The last food bowl stays, so nobody is ever left without food. */
export function storeItem(ctx: SimContext, placedId: string): CommandResult {
  const world = ctx.state.world;
  const item = world.placedItems.find((p) => p.id === placedId);
  const def = item && placedDef(item);
  if (!item || !def) return { ok: false, reason: 'Can’t find that item.' };
  if (
    def.category === 'bowl' &&
    world.placedItems.filter((p) => placedDef(p)?.category === 'bowl').length <= 1
  ) {
    return { ok: false, reason: 'Your animals need at least one food bowl!' };
  }
  world.placedItems = world.placedItems.filter((p) => p !== item);
  world.inventory[item.itemId] = (world.inventory[item.itemId] ?? 0) + 1;
  ctx.emit('itemStored', { item });
  // One bed fewer: anyone left without a bed goes outside.
  if (def.category === 'bed') evictExtraIndoors(ctx);
  return { ok: true };
}

/** Applies owned wallpaper or flooring to the house. */
export function applySurface(ctx: SimContext, itemId: string): CommandResult {
  const world = ctx.state.world;
  const def = getItem(itemId);
  if (!def || (def.category !== 'wallpaper' && def.category !== 'flooring')) {
    return { ok: false, reason: 'That’s not wallpaper or flooring.' };
  }
  if (ownedCount(world, itemId) < 1)
    return { ok: false, reason: 'Buy it in the Home Store first.' };
  if (def.category === 'wallpaper') world.house.wallpaperId = itemId;
  else world.house.flooringId = itemId;
  ctx.emit('surfaceApplied', { itemId });
  return { ok: true };
}
