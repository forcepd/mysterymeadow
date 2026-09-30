import {
  BoxGeometry,
  ConeGeometry,
  Group,
  Mesh,
  MeshLambertMaterial,
  PlaneGeometry,
  type ColorRepresentation,
} from 'three';
import { COLORS } from '../game/constants';
import { HOUSE_DOOR, INSIDE_DOOR, LAYOUT, ROOM } from '../game/layout';
import { HOUSE_HEIGHT, toUnits, WALL_HEIGHT, worldToGround } from './coords';

/**
 * Phase 3D-0 placeholder scenery: plain blocks where the original draws the fence, gate, path,
 * house and room, so the layout mapping and camera can be checked. Phase 3D-1 replaces the yard
 * and 3D-4 the room.
 */

const mat = (color: ColorRepresentation) => new MeshLambertMaterial({ color });

/** A flat rectangle on the ground covering world-pixel rect (x, y, w, h), lifted by `lift`. */
function groundRect(
  x: number,
  y: number,
  w: number,
  h: number,
  color: ColorRepresentation,
  lift = 0,
) {
  const mesh = new Mesh(new PlaneGeometry(toUnits(w), toUnits(h)), mat(color));
  mesh.rotation.x = -Math.PI / 2;
  const c = worldToGround({ x: x + w / 2, y: y + h / 2 });
  mesh.position.set(c.x, lift, c.z);
  mesh.receiveShadow = true;
  return mesh;
}

/** A box standing on the ground over world-pixel rect (x, y, w, h), `height` units tall. */
function block(
  x: number,
  y: number,
  w: number,
  h: number,
  height: number,
  color: ColorRepresentation,
) {
  const mesh = new Mesh(new BoxGeometry(toUnits(w), height, toUnits(h)), mat(color));
  const c = worldToGround({ x: x + w / 2, y: y + h / 2 });
  mesh.position.set(c.x, height / 2, c.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export interface YardPlaceholder {
  group: Group;
  setHouseColor(color: string): void;
}

export function buildYardPlaceholder(): YardPlaceholder {
  const group = new Group();
  group.name = 'yard';
  // Grass well past the frame, so orbiting never shows an edge (fog hides the far side).
  group.add(groundRect(-4000, -4000, 9280, 8800, COLORS.grass));

  // The path from the gate up past the queue.
  const { gate, fenceY } = LAYOUT;
  group.add(groundRect(gate.x + 10, -400, gate.width - 20, fenceY + 440, COLORS.path, 0.005));

  // Fence along the top of the yard, with the gate gap.
  const postW = 16;
  for (let x = 20; x < 1280; x += 64) {
    if (x > gate.x - postW && x < gate.x + gate.width) continue;
    group.add(block(x - postW / 2, fenceY - postW / 2, postW, postW, 0.7, COLORS.fence));
  }
  for (const [from, to] of [
    [0, gate.x],
    [gate.x + gate.width, 1280],
  ] as const) {
    for (const railY of [0.3, 0.55]) {
      const rail = block(from, fenceY - 4, to - from, 8, 0.08, COLORS.fence);
      rail.position.y = railY;
      group.add(rail);
    }
  }
  // Gate posts.
  for (const x of [gate.x, gate.x + gate.width]) {
    group.add(block(x - 12, fenceY - 12, 24, 24, 1, COLORS.fenceEdge));
  }

  // The house: body, roof and door. The door faces the yard where HOUSE_DOOR is.
  const h = LAYOUT.house;
  const depth = 170;
  const top = h.y + h.height - depth;
  const wallHeight = HOUSE_HEIGHT * 0.6;
  const houseMat = mat(COLORS.fence);
  const body = block(h.x, top, h.width, depth, wallHeight, COLORS.fence);
  body.material = houseMat;
  group.add(body);
  const roof = new Mesh(new ConeGeometry(1, HOUSE_HEIGHT - wallHeight, 4, 1), mat(COLORS.roof));
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(toUnits(h.width) * 0.78, 1, toUnits(depth) * 0.78);
  const center = worldToGround({ x: h.x + h.width / 2, y: top + depth / 2 });
  roof.position.set(center.x, wallHeight + (HOUSE_HEIGHT - wallHeight) / 2, center.z);
  roof.castShadow = true;
  group.add(roof);
  const doorAt = worldToGround({ x: HOUSE_DOOR.x, y: h.y + h.height });
  const door = new Mesh(new BoxGeometry(0.5, 0.9, 0.06), mat(COLORS.door));
  door.position.set(doorAt.x, 0.45, doorAt.z);
  group.add(door);

  return {
    group,
    setHouseColor: (color) => houseMat.color.set(color),
  };
}

export function buildHousePlaceholder(): Group {
  const group = new Group();
  group.name = 'house';
  // Outside the room: a soft backdrop floor.
  group.add(groundRect(-4000, -4000, 9280, 8800, 0xe9dcc4));
  // The floor, from the back wall down to past the doormat.
  const floorBottom = INSIDE_DOOR.y + 40;
  group.add(
    groundRect(
      ROOM.left,
      ROOM.wallBottom,
      ROOM.right - ROOM.left,
      floorBottom - ROOM.wallBottom,
      0xd9b88a,
      0.005,
    ),
  );
  // Back wall (the 2D wall strip, standing up) and low side walls, so orbiting can see in.
  group.add(
    block(
      ROOM.left - 20,
      ROOM.wallBottom - 20,
      ROOM.right - ROOM.left + 40,
      20,
      WALL_HEIGHT,
      0xf6ead2,
    ),
  );
  for (const x of [ROOM.left - 20, ROOM.right]) {
    group.add(block(x, ROOM.wallBottom, 20, floorBottom - ROOM.wallBottom, 0.5, 0xf6ead2));
  }
  // The doormat (drop an animal here to send it out, from Phase 3D-3).
  group.add(groundRect(INSIDE_DOOR.x - 70, INSIDE_DOOR.y - 25, 140, 50, 0x9b6a45, 0.01));
  return group;
}
