import { INSIDE_DOOR, LAYOUT, ROOM, WORLD_HEIGHT, WORLD_WIDTH, type Rect } from '../game/layout';
import type { Vec2 } from '../sim/types';

/**
 * The 3D world lays the original 2D layout (1280x800 world pixels) flat on the ground, so every
 * spot the sim and layout.ts know about (gate queue, doors, yard, tiles) lines up with the
 * original. World x -> ground X, world y (down the screen, toward the viewer) -> ground Z.
 * Ground units are meters-ish; Y is up.
 */
export const PX_PER_UNIT = 100;

export interface GroundPoint {
  x: number;
  z: number;
}

export function worldToGround(p: Vec2): GroundPoint {
  return { x: (p.x - WORLD_WIDTH / 2) / PX_PER_UNIT, z: (p.y - WORLD_HEIGHT / 2) / PX_PER_UNIT };
}

export function groundToWorld(g: GroundPoint): Vec2 {
  return { x: g.x * PX_PER_UNIT + WORLD_WIDTH / 2, y: g.z * PX_PER_UNIT + WORLD_HEIGHT / 2 };
}

/** A world-pixel length in ground units. */
export const toUnits = (px: number): number => px / PX_PER_UNIT;

export type ViewZone = 'yard' | 'house';

/** Height of the house's back wall inside (the 2D wall strip stands up in 3D). */
export const WALL_HEIGHT = 2.4;
/** Height of the house in the yard, roof peak included. */
export const HOUSE_HEIGHT = 3;

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

function rectCorners(r: Rect, y = 0): Point3[] {
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x, y: r.y + r.h },
    { x: r.x + r.w, y: r.y + r.h },
  ].map((p) => ({ ...worldToGround(p), y }));
}

/**
 * The ground area of each zone (world pixels), like the original's 1280x800 screen: the house
 * and gate queue at the top, the yard down to just above the HUD menu; the room's floor.
 */
export const FRAME: Record<ViewZone, Rect> = {
  yard: { x: 40, y: 60, w: WORLD_WIDTH - 80, h: LAYOUT.yard.bottom + 40 - 60 },
  house: {
    x: ROOM.left - 30,
    y: ROOM.wallBottom,
    w: ROOM.right - ROOM.left + 60,
    h: INSIDE_DOOR.y + 30 - ROOM.wallBottom,
  },
};

/** Points the default camera must keep in view for a zone (ground corners and tall things). */
export function framePoints(zone: ViewZone): Point3[] {
  const ground = rectCorners(FRAME[zone]);
  if (zone === 'house') {
    const wall = { ...FRAME.house, h: 0 };
    return [...ground, ...rectCorners(wall, WALL_HEIGHT)];
  }
  const { x, y, width, height } = LAYOUT.house;
  return [...ground, ...rectCorners({ x, y, w: width, h: height }, HOUSE_HEIGHT)];
}
