import type { Vec2 } from '../sim/types';
import { deepFreeze } from './deepFreeze';

/**
 * The yard is a tile grid (DESIGN 6.5: lures are placed on a yard grid). Placed yard items
 * store tiles; animals use normalized 0..1 positions over the same area.
 */
export const YARD_GRID = deepFreeze({ cols: 12, rows: 5 });

/** Center of a tile, in the same 0..1 zone coordinates animals use. */
export function tileCenter(tile: { x: number; y: number }): Vec2 {
  return { x: (tile.x + 0.5) / YARD_GRID.cols, y: (tile.y + 0.5) / YARD_GRID.rows };
}

/** Items every new game starts with (a food bowl, so nobody is ever stuck with hungry pets). */
export const STARTING_ITEMS = deepFreeze([
  { itemId: 'food_bowl', zone: 'yard', tile: { x: 1, y: 0 } },
] as const);
