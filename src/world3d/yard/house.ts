import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Shape,
  SphereGeometry,
  TorusGeometry,
  type BufferGeometry,
  type Mesh,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { COLORS } from '../../game/constants';
import { sceneryMesh, part } from '../art/toon';
import { HOUSE_BOX, HOUSE_HEIGHT, HOUSE_WALL_HEIGHT, toUnits, worldToGround } from '../coords';

/** Tier index: 0 Cottage, 1 Bungalow, 2 Farmhouse, 3 Manor (like the original's drawHouse). */
export type HouseTier = 0 | 1 | 2 | 3;

const TOWER_ROOF = 0x8a6fc7;
const FLAG = 0xff6f9a;
const TRIM = 0xfff8ec;
const STONE = 0xc9bfae;
const PLANTER = 0x9b6a45;
const BLOOMS = [0xff9fc4, 0xffe066, 0xb69bff];

/** Sizes in ground units, measured from the house's own center (front = +z). */
const W = toUnits(HOUSE_BOX.w);
const D = toUnits(HOUSE_BOX.h);
const WALL_H = HOUSE_WALL_HEIGHT;
const OVERHANG = 0.2;
const RISE = HOUSE_HEIGHT - WALL_H;
const FRONT = D / 2;

/** Where the house's center sits on the ground. */
export function houseCenter() {
  return worldToGround({ x: HOUSE_BOX.x + HOUSE_BOX.w / 2, y: HOUSE_BOX.y + HOUSE_BOX.h / 2 });
}

/** A window facing +z at (x, y) on a wall whose surface is at z, turned by `ry`. */
function windowParts(
  x: number,
  y: number,
  z: number,
  ry = 0,
  size = { w: 0.58, h: 0.5 },
): BufferGeometry[] {
  // Build facing +z at the origin, then turn and move it onto its wall.
  const place = (g: BufferGeometry) => {
    g.rotateY(ry);
    const c = Math.cos(ry);
    const s = Math.sin(ry);
    g.translate(x * c + z * s, y, -x * s + z * c);
    return g;
  };
  return [
    place(part(new RoundedBoxGeometry(size.w + 0.12, size.h + 0.12, 0.06, 2, 0.03), TRIM)),
    place(part(new BoxGeometry(size.w, size.h, 0.08), COLORS.window)),
    place(part(new BoxGeometry(0.04, size.h, 0.1), COLORS.outline)),
    place(part(new BoxGeometry(size.w, 0.04, 0.1), COLORS.outline)),
  ];
}

/** A flower box under a front window (Bungalow and up). */
function flowerBox(x: number, y: number): BufferGeometry[] {
  const parts = [
    part(new RoundedBoxGeometry(0.7, 0.12, 0.16, 2, 0.03), PLANTER, { x, y, z: FRONT + 0.1 }),
  ];
  for (let i = 0; i < 5; i++) {
    parts.push(
      part(new SphereGeometry(0.065, 8, 6), BLOOMS[i % 3]!, {
        x: x - 0.26 + i * 0.13,
        y: y + 0.09,
        z: FRONT + 0.1,
      }),
    );
  }
  return parts;
}

/** A round tower with a pointy roof (Manor). */
function tower(x: number, z: number, wallColor: string): BufferGeometry[] {
  const height = WALL_H + 0.55;
  return [
    part(new CylinderGeometry(0.34, 0.36, height, 20), wallColor, { x, y: height / 2, z }),
    part(new ConeGeometry(0.46, 0.95, 20), TOWER_ROOF, { x, y: height + 0.47, z }),
    ...windowParts(x, height - 0.45, z + 0.33, 0, { w: 0.22, h: 0.3 }),
  ];
}

/**
 * The house exterior for a wall color and tier, as one outlined toon mesh (plus its outline).
 * Rebuilt when the color or tier changes, which is rare.
 */
export function buildHouse(wallColor: string, tier: HouseTier): Mesh {
  const parts: BufferGeometry[] = [];
  const wall = (g: BufferGeometry) => parts.push(g);

  // Walls, and the gable under the roof.
  wall(part(new RoundedBoxGeometry(W, WALL_H, D, 3, 0.07), wallColor, { y: WALL_H / 2 }));
  const gableRise = RISE * (W / 2 / (W / 2 + OVERHANG));
  const gable = new Shape();
  gable.moveTo(-W / 2, 0);
  gable.lineTo(W / 2, 0);
  gable.lineTo(0, gableRise);
  gable.closePath();
  wall(
    part(new ExtrudeGeometry(gable, { depth: D - 0.02, bevelEnabled: false }), wallColor, {
      y: WALL_H - 0.02,
      z: -D / 2 + 0.01,
    }),
  );

  // Roof: two slabs meeting at the ridge (front to back), overhanging the walls.
  const run = W / 2 + OVERHANG;
  const drop = RISE + 0.08;
  const slope = Math.atan2(drop, run);
  const slab = Math.hypot(run, drop) + 0.08;
  for (const side of [-1, 1]) {
    parts.push(
      part(new RoundedBoxGeometry(slab, 0.14, D + 2 * OVERHANG, 2, 0.05), COLORS.roof, {
        x: (side * run) / 2,
        y: WALL_H - 0.08 + drop / 2 + 0.07,
        rz: -side * slope,
      }),
    );
  }
  // Chimney, poking out of the right slope toward the back.
  parts.push(
    part(new RoundedBoxGeometry(0.3, 0.9, 0.3, 2, 0.04), COLORS.roofEdge, {
      x: W / 4,
      y: WALL_H + RISE * 0.55,
      z: -D / 4,
    }),
  );

  // Arched door in the middle of the front, a gold knob, and a stone step.
  const doorW = 0.62;
  const doorH = 0.92;
  parts.push(
    part(new BoxGeometry(doorW, doorH - doorW / 2, 0.08), COLORS.door, {
      y: (doorH - doorW / 2) / 2,
      z: FRONT + 0.02,
    }),
    part(
      new CylinderGeometry(doorW / 2, doorW / 2, 0.08, 20, 1, false, -Math.PI / 2, Math.PI),
      COLORS.door,
      {
        rx: Math.PI / 2,
        y: doorH - doorW / 2,
        z: FRONT + 0.02,
      },
    ),
    part(new SphereGeometry(0.045, 10, 8), 0xffd76a, {
      x: doorW / 2 - 0.12,
      y: 0.42,
      z: FRONT + 0.08,
    }),
    part(new RoundedBoxGeometry(0.95, 0.08, 0.36, 2, 0.03), STONE, { y: 0.04, z: FRONT + 0.2 }),
  );

  // Windows: two on the front (like the original), one on each side and the back.
  const winY = WALL_H * 0.56;
  for (const x of [-W / 2 + 0.62, W / 2 - 0.62]) parts.push(...windowParts(x, winY, FRONT + 0.005));
  parts.push(...windowParts(0, winY, W / 2 + 0.005, Math.PI / 2));
  parts.push(...windowParts(0, winY, W / 2 + 0.005, -Math.PI / 2));
  parts.push(...windowParts(0, winY, D / 2 + 0.005, Math.PI));

  // Bungalow and up: a porch roof over the door, and flower boxes.
  if (tier >= 1) {
    parts.push(
      part(new RoundedBoxGeometry(1.1, 0.1, 0.5, 2, 0.04), COLORS.roof, {
        y: doorH + 0.14,
        z: FRONT + 0.22,
        rx: 0.18,
      }),
    );
    for (const x of [-W / 2 + 0.62, W / 2 - 0.62]) parts.push(...flowerBox(x, winY - 0.34));
  }

  // Farmhouse and up: a round attic window in the front gable.
  if (tier >= 2) {
    const y = WALL_H + gableRise * 0.42;
    parts.push(
      part(new TorusGeometry(0.2, 0.045, 8, 24), TRIM, { y, z: FRONT + 0.03 }),
      part(new CylinderGeometry(0.19, 0.19, 0.06, 24), COLORS.window, {
        rx: Math.PI / 2,
        y,
        z: FRONT + 0.01,
      }),
      part(new BoxGeometry(0.38, 0.035, 0.08), COLORS.outline, { y, z: FRONT + 0.03 }),
    );
  }

  // Manor: towers at the back corners, and a flag on the left one.
  if (tier >= 3) {
    const towerZ = -D / 2 + 0.15;
    for (const side of [-1, 1]) parts.push(...tower(side * (W / 2 + 0.12), towerZ, wallColor));
    const top = WALL_H + 0.55 + 0.95;
    const poleX = -(W / 2 + 0.12);
    parts.push(
      part(new CylinderGeometry(0.025, 0.025, 0.55, 8), COLORS.outline, {
        x: poleX,
        y: top + 0.2,
        z: towerZ,
      }),
    );
    const flag = new Shape();
    flag.moveTo(0, 0);
    flag.lineTo(0.38, 0.1);
    flag.lineTo(0, 0.22);
    flag.closePath();
    parts.push(
      part(new ExtrudeGeometry(flag, { depth: 0.03, bevelEnabled: false }), FLAG, {
        x: poleX + 0.02,
        y: top + 0.25,
        z: towerZ,
      }),
    );
  }

  const mesh = sceneryMesh(parts);
  const c = houseCenter();
  mesh.position.set(c.x, 0, c.z);
  mesh.name = 'house';
  return mesh;
}
