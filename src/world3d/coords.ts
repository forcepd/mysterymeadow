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
/**
 * The house in the yard: its walls' footprint (world px) and heights (units). Centered on the
 * door spot (HOUSE_DOOR.x), with the front wall just behind the fence line, so the door opens
 * onto the yard like in the original.
 */
export const HOUSE_BOX = { x: 90, y: 160, w: 290, h: 170 } as const;
export const HOUSE_WALL_HEIGHT = 1.45;
/** Roof peak (towers and the flag of the Manor go a little higher). */
export const HOUSE_HEIGHT = 2.65;

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
  return [...ground, ...rectCorners(HOUSE_BOX, HOUSE_HEIGHT)];
}

// ---- The room's back wall -----------------------------------------------------------------------

/**
 * The original draws wall art on a strip above the floor (ROOM.wallTop..wallBottom). In 3D that
 * strip is the back wall standing up at the floor's back edge: its bottom edge maps to
 * WALL_ART.bottom and its top edge to WALL_ART.top (heights in units).
 */
export const WALL_ART = { bottom: 0.7, top: 2.15 } as const;

/** Where the back wall stands (ground z). */
export const BACK_WALL_Z = worldToGround({ x: 0, y: ROOM.wallBottom }).z;

/** A point on the back wall (x, height) for a world-pixel point on the original's wall strip. */
export function wallStripToWall(p: Vec2): { x: number; y: number; z: number } {
  const t = (ROOM.wallBottom - p.y) / (ROOM.wallBottom - ROOM.wallTop);
  return {
    x: worldToGround(p).x,
    y: WALL_ART.bottom + t * (WALL_ART.top - WALL_ART.bottom),
    z: BACK_WALL_Z,
  };
}

/** The world-pixel point on the wall strip for a point on the back wall (x, height). */
export function wallToWallStrip(x: number, height: number): Vec2 {
  const t = (height - WALL_ART.bottom) / (WALL_ART.top - WALL_ART.bottom);
  return {
    x: groundToWorld({ x, z: 0 }).x,
    y: ROOM.wallBottom - t * (ROOM.wallBottom - ROOM.wallTop),
  };
}

/** A world-pixel rectangle on the ground: its center and size in units. */
export function groundRect(r: Rect): { x: number; z: number; w: number; d: number } {
  const c = worldToGround({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
  return { x: c.x, z: c.z, w: toUnits(r.w), d: toUnits(r.h) };
}
