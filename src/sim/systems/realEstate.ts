import { BALANCE, type HouseTier } from '../../config/balance';
import { HOUSE_COLORS } from '../../config/houseColors';
import { getItem } from '../../config/items';
import { YARD_GRID } from '../../config/yard';
import type { SimContext } from '../context';
import type { CommandResult, Ms, PlacedItem, WorldState } from '../types';
import { addCoins } from './economy';
import { getHouseTier } from './housing';
import { canPlace } from './placement';
import { admitVisitors } from './visitors';
import { evictExtraIndoors } from './zones';

/** DESIGN 12.1, 12.5, 13.2: house upgrades, extra rooms, Pet Slots, Storage, and paint. */

export interface Purchase {
  /** How many bought so far. */
  bought: number;
  /** The most you can own right now (rooms depend on the house tier). */
  max: number;
  /** Price of the next one, or null when maxed out. */
  nextCost: number | null;
}

export interface RealEstate {
  tier: HouseTier;
  /** The next house tier, or null at the Grand Manor. */
  next: HouseTier | null;
  rooms: Purchase;
  petSlots: Purchase;
  storage: Purchase;
  colorCost: number;
}

function tierIndex(world: WorldState): number {
  return BALANCE.houseTiers.findIndex((t) => t.id === world.house.tierId);
}

function purchase(bought: number, max: number, costs: readonly number[]): Purchase {
  return { bought, max, nextCost: bought < max ? (costs[bought] ?? null) : null };
}

export function realEstate(world: WorldState): RealEstate {
  const tier = getHouseTier(world);
  const h = world.house;
  return {
    tier,
    next: BALANCE.houseTiers[tierIndex(world) + 1] ?? null,
    rooms: purchase(h.roomExpansions, tier.maxRoomExpansions, BALANCE.roomExpansionCosts),
    petSlots: purchase(h.petSlotsPurchased, BALANCE.petSlots.costs.length, BALANCE.petSlots.costs),
    storage: purchase(
      h.storageExpansions,
      BALANCE.petStorage.expansionCosts.length,
      BALANCE.petStorage.expansionCosts,
    ),
    colorCost: BALANCE.houseColorChangeCost,
  };
}

function pay(ctx: SimContext, cost: number): CommandResult {
  if (ctx.state.world.coins < cost) return { ok: false, reason: 'Not enough coins!' };
  addCoins(ctx, -cost);
  return { ok: true };
}

const isColor = (id: string) => HOUSE_COLORS.some((c) => c.id === id);

/**
 * Moves to the next house tier (in order, DESIGN 12.1). Animals stay; the exterior color can
 * be re-picked for free right now. Items that don't fit the new house go to the inventory.
 */
export function upgradeHouse(ctx: SimContext, now: Ms, colorId?: string): CommandResult {
  const world = ctx.state.world;
  const next = realEstate(world).next;
  if (!next) return { ok: false, reason: 'You have the biggest house already!' };
  if (colorId !== undefined && !isColor(colorId)) return { ok: false, reason: 'Pick a color.' };
  const paid = pay(ctx, next.cost);
  if (!paid.ok) return paid;
  world.house.tierId = next.id;
  if (colorId !== undefined) world.house.exteriorColor = colorId;
  fitItems(ctx);
  ctx.emit('houseUpgraded', { tierId: next.id });
  // More room: anyone waiting at the gate can come in.
  admitVisitors(ctx, now);
  return { ok: true };
}

/** +1 total capacity, up to the tier's limit (DESIGN 12.5). */
export function buyRoomExpansion(ctx: SimContext, now: Ms): CommandResult {
  const world = ctx.state.world;
  const { rooms } = realEstate(world);
  if (rooms.nextCost === null) {
    return { ok: false, reason: 'No more room to add. Upgrade your house for more!' };
  }
  const paid = pay(ctx, rooms.nextCost);
  if (!paid.ok) return paid;
  world.house.roomExpansions += 1;
  ctx.emit('realEstateBought', { kind: 'room' });
  admitVisitors(ctx, now);
  return { ok: true };
}

export function buyPetSlot(ctx: SimContext): CommandResult {
  const world = ctx.state.world;
  const { petSlots } = realEstate(world);
  if (petSlots.nextCost === null) return { ok: false, reason: 'You have every Pet Slot!' };
  const paid = pay(ctx, petSlots.nextCost);
  if (!paid.ok) return paid;
  world.house.petSlotsPurchased += 1;
  ctx.emit('realEstateBought', { kind: 'petSlot' });
  return { ok: true };
}

export function buyStorageExpansion(ctx: SimContext): CommandResult {
  const world = ctx.state.world;
  const { storage } = realEstate(world);
  if (storage.nextCost === null) return { ok: false, reason: 'Pet Storage is as big as it gets!' };
  const paid = pay(ctx, storage.nextCost);
  if (!paid.ok) return paid;
  world.house.storageExpansions += 1;
  ctx.emit('realEstateBought', { kind: 'storage' });
  return { ok: true };
}

/** Repaint the outside of the house (DESIGN 12.1: 50 coins, free when upgrading). */
export function changeHouseColor(ctx: SimContext, colorId: string): CommandResult {
  const world = ctx.state.world;
  if (!isColor(colorId)) return { ok: false, reason: 'Pick a color.' };
  if (world.house.exteriorColor === colorId)
    return { ok: false, reason: 'It’s already that color!' };
  const paid = pay(ctx, BALANCE.houseColorChangeCost);
  if (!paid.ok) return paid;
  world.house.exteriorColor = colorId;
  ctx.emit('realEstateBought', { kind: 'color' });
  return { ok: true };
}

/**
 * Re-checks every placed item against the current house (DESIGN 12.1: furniture that doesn't
 * fit moves to the inventory). Items keep their spots when they still fit. The last food bowl
 * is never packed away: if no bowl fits, one goes on the first free yard tile.
 */
export function fitItems(ctx: SimContext): void {
  const world = ctx.state.world;
  const all = world.placedItems;
  world.placedItems = [];
  const packed: PlacedItem[] = [];
  for (const item of all) {
    if (canPlace(world, item.itemId, item.zone, item.tile, item.rotation).ok) {
      world.placedItems.push(item);
    } else {
      packed.push(item);
    }
  }
  const isBowl = (p: PlacedItem) => getItem(p.itemId)?.category === 'bowl';
  if (!world.placedItems.some(isBowl)) {
    const bowl = packed.find(isBowl);
    if (bowl && placeOnFirstFreeYardTile(world, bowl)) packed.splice(packed.indexOf(bowl), 1);
  }
  for (const item of packed) {
    world.inventory[item.itemId] = (world.inventory[item.itemId] ?? 0) + 1;
    ctx.emit('itemStored', { item });
  }
  evictExtraIndoors(ctx);
}

function placeOnFirstFreeYardTile(world: WorldState, item: PlacedItem): boolean {
  for (let y = 0; y < YARD_GRID.rows; y++) {
    for (let x = 0; x < YARD_GRID.cols; x++) {
      if (canPlace(world, item.itemId, 'yard', { x, y }, 0).ok) {
        world.placedItems.push({ ...item, zone: 'yard', tile: { x, y }, rotation: 0 });
        return true;
      }
    }
  }
  return false;
}
