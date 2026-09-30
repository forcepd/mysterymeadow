import {
  BoxGeometry,
  Group,
  Mesh,
  MeshLambertMaterial,
  PlaneGeometry,
  type ColorRepresentation,
} from 'three';
import { INSIDE_DOOR, ROOM } from '../game/layout';
import { toUnits, WALL_HEIGHT, worldToGround } from './coords';

/**
 * Placeholder room (from Phase 3D-0): plain blocks where the original draws the floor, back wall
 * and doormat, so the layout mapping and camera can be checked. Phase 3D-4 replaces it.
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
