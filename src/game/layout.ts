import { tileCenter } from '../config/yard';
import type { Vec2 } from '../sim/types';
import { WORLD_HEIGHT, WORLD_WIDTH } from './constants';

/**
 * Yard layout in world pixels (1280x800). No Phaser imports, so e2e tests can use it to find
 * things on screen.
 */
export const LAYOUT = {
  house: { x: 70, y: 70, width: 330, height: 250 },
  /** The fence along the top of the yard, with the gate gap near the right. */
  fenceY: 340,
  gate: { x: 1090, width: 130 },
  /** Where mystery visitors wait, just outside the gate (queue goes up the path). */
  gateQueue: { x: 1155, y: 280, stepX: -95, stepY: -40 },
  /**
   * Normalized animal positions (0..1) map into this rectangle. The bottom stays above the HUD
   * menu, which covers the world from about y = 698 on the widest screens (and iPad Safari with
   * its toolbars), so poops, finds, and animals there can always be tapped.
   */
  yard: { left: 110, top: 430, right: 1170, bottom: 665 },
} as const;

/** Where the HUD's coin counter sits over the world (coins from a sale fly here). */
export const HUD_COINS: Vec2 = { x: 150, y: 28 };

export function yardToWorld(p: Vec2): Vec2 {
  const { left, top, right, bottom } = LAYOUT.yard;
  return { x: left + p.x * (right - left), y: top + p.y * (bottom - top) };
}

/** World position of a yard tile's center (bowls, and lures in Phase 6). */
export function tileToWorld(tile: { x: number; y: number }): Vec2 {
  return yardToWorld(tileCenter(tile));
}

export function gateSlot(index: number): Vec2 {
  const q = LAYOUT.gateQueue;
  return { x: q.x + index * q.stepX, y: q.y + index * q.stepY };
}

/** In front of the house door (pets back from Storage come out here). */
export const HOUSE_DOOR: Vec2 = {
  x: LAYOUT.house.x + LAYOUT.house.width / 2,
  y: LAYOUT.house.y + LAYOUT.house.height + 60,
};

/** Where visitors step into the yard. */
export const GATE_ENTRY: Vec2 = { x: LAYOUT.gate.x + LAYOUT.gate.width / 2, y: LAYOUT.fenceY + 40 };

export { WORLD_HEIGHT, WORLD_WIDTH };

/** Drop an animal this close to a door to send it through (drag-to-door, DESIGN 12.4). */
export const DOOR_RADIUS = 110;

/**
 * House interior (world pixels). The wall strip (for wall art) runs across the top; the floor
 * grid fills the rest. Tile sizes depend on the tier's interior grid.
 */
export const ROOM = {
  left: 150,
  right: 1130,
  wallTop: 96,
  wallBottom: 222,
  floorBottom: 650,
} as const;

/** The doormat inside the house (drop an animal here to send it out). */
/** Kept above the HUD's menu buttons, which cover the bottom of the screen. */
export const INSIDE_DOOR: Vec2 = { x: 640, y: 690 };

export interface Grid {
  cols: number;
  rows: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Zone = 'yard' | 'house';

/** The world rectangle a zone's tile grid covers (the house wall strip is separate). */
export function gridArea(zone: Zone, wall = false): Rect {
  if (zone === 'yard') {
    const { left, top, right, bottom } = LAYOUT.yard;
    return { x: left, y: top, w: right - left, h: bottom - top };
  }
  return wall
    ? {
        x: ROOM.left,
        y: ROOM.wallTop,
        w: ROOM.right - ROOM.left,
        h: ROOM.wallBottom - ROOM.wallTop,
      }
    : {
        x: ROOM.left,
        y: ROOM.wallBottom,
        w: ROOM.right - ROOM.left,
        h: ROOM.floorBottom - ROOM.wallBottom,
      };
}

/** World rectangle covered by a footprint at `tile`. */
export function tileRect(
  zone: Zone,
  grid: Grid,
  tile: { x: number; y: number },
  size: { w: number; h: number },
  wall = false,
): Rect {
  const area = gridArea(zone, wall);
  const tw = area.w / grid.cols;
  const th = area.h / grid.rows;
  return { x: area.x + tile.x * tw, y: area.y + tile.y * th, w: size.w * tw, h: size.h * th };
}

/**
 * The tile to anchor a footprint of `size` so it's centered under world point `p`, or null
 * if the point is outside the grid area.
 */
export function tileAt(
  zone: Zone,
  grid: Grid,
  p: Vec2,
  size: { w: number; h: number },
  wall = false,
): { x: number; y: number } | null {
  const area = gridArea(zone, wall);
  const pad = 40;
  if (p.x < area.x - pad || p.x > area.x + area.w + pad) return null;
  if (p.y < area.y - pad || p.y > area.y + area.h + pad) return null;
  const tw = area.w / grid.cols;
  const th = area.h / grid.rows;
  return {
    x: Math.round((p.x - area.x) / tw - size.w / 2),
    y: Math.round((p.y - area.y) / th - size.h / 2),
  };
}

/** Where an animal's normalized position (0..1) is in the world, per zone. */
export function zoneToWorld(zone: Zone, p: Vec2): Vec2 {
  if (zone === 'yard') return yardToWorld(p);
  const inset = 50;
  const area = gridArea('house');
  return {
    x: area.x + inset + p.x * (area.w - 2 * inset),
    y: area.y + inset + p.y * (area.h - 2 * inset),
  };
}

/** Center of a floor tile in world pixels. */
export function tileCenterWorld(zone: Zone, grid: Grid, tile: { x: number; y: number }): Vec2 {
  const r = tileRect(zone, grid, tile, { w: 1, h: 1 });
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/** The door an animal uses to leave a zone. */
export function doorOf(zone: Zone): Vec2 {
  return zone === 'yard' ? HOUSE_DOOR : INSIDE_DOOR;
}

/**
 * Vet Clinic scene layout (world pixels). Everything stays left of x = 760: the clinic panel
 * (cabinet and clues) covers the right side of the screen.
 */
export const VET_LAYOUT = {
  table: { x: 150, y: 500, width: 520, height: 44 },
  /** Where the patient stands on the table (its feet touch the tabletop). */
  patient: { x: 410, y: 452 },
  patientScale: 1.8,
  /** Drop a tool within this distance of the patient to use it. */
  dropRadius: 190,
  /** Exam tool buttons along the bottom, in EXAM_TOOLS order. */
  tools: { y: 668, xs: [210, 410, 610], width: 150, height: 138 },
} as const;

export function vetToolPoint(index: number): Vec2 {
  return { x: VET_LAYOUT.tools.xs[index] ?? 0, y: VET_LAYOUT.tools.y };
}
