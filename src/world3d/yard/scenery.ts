import {
  BackSide,
  BufferAttribute,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Mesh,
  Object3D,
  PlaneGeometry,
  ShaderMaterial,
  SphereGeometry,
  type BufferGeometry,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { COLORS } from '../../game/constants';
import { LAYOUT } from '../../game/layout';
import { merge, part, sceneryMesh, seededRandom, toonMaterial } from '../art/toon';
import { toUnits, worldToGround } from '../coords';
import { terrainHeight } from './terrain';

/**
 * The yard's scenery (Phase 3D-1): rolling grass, the path to the gate, a picket fence around
 * the yard with the open gate, trees, bushes, flowers, grass tufts, and a sky with clouds.
 * Static: built once. Nothing tall stands in the yard or along the gate queue (a unit test
 * checks), so every animal and visitor stays visible and tappable.
 */

export const SKY_TOP = 0x8fd0f5;
export const SKY_HORIZON = 0xe3f4ff;

const TRUNK = 0x9b6a45;
const LEAVES = [0x7cc46a, 0x6bb85e, 0x8fd177];
const PINE = [0x4f9f63, 0x5aab6c];
const BUSH = [0x6fbd62, 0x7fc86f];
const FLOWER_COLORS = [0xff9fc4, 0xffe066, 0xb69bff, 0xffffff];
const FLOWER_MIDDLE = 0xffc93c;

/** The fence goes around the yard at these lines (world px). */
export const FENCE = {
  left: -60,
  right: 1340,
  front: 900,
  /** The house's front stands in for the fence between these x (the door opens onto the yard). */
  houseGap: { from: 90, to: 380 },
} as const;

const PATH_X = LAYOUT.gate.x + LAYOUT.gate.width / 2;

export interface YardScenery {
  group: Group;
  /** Everything solid near the yard (fence, gate, trees, bushes), merged; for tests. */
  solid: Mesh;
  flowers: Mesh;
}

export function buildYardScenery(): YardScenery {
  const group = new Group();
  group.name = 'yard-scenery';
  group.add(ground(), path(), sky(), clouds(), tufts());
  const { near, far } = trees();
  const solid = sceneryMesh([...fence(), ...gate(), ...near, ...bushes()]);
  solid.name = 'yard-solid';
  // Far trees are past the sun's shadow area: no shadows to cast.
  const distant = sceneryMesh(far, { shadows: false });
  distant.name = 'far-trees';
  group.add(distant);
  // Flowers are tiny: a thinner outline keeps them from looking like blobs up close.
  const blooms = sceneryMesh(flowers(), { outline: 0.012, shadows: false });
  blooms.name = 'flowers';
  group.add(solid, blooms);
  return { group, solid, flowers: blooms };
}

// ---- Ground ------------------------------------------------------------------------------------

function ground(): Mesh {
  const size = 140;
  const geo = new PlaneGeometry(size, size, 96, 96);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const base = new Color(COLORS.grass);
  const light = new Color(0xcdeeb6);
  const dark = new Color(0xa9dc92);
  const c = new Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = terrainHeight(x, z);
    pos.setY(i, h);
    // Soft patches of lighter and darker grass; hilltops a touch lighter.
    const n = Math.sin(x * 0.7 + z * 0.3) * Math.cos(z * 0.9 - x * 0.2);
    c.copy(base).lerp(n > 0 ? light : dark, Math.abs(n) * 0.5 + Math.min(h / 8, 0.2));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new BufferAttribute(colors, 3));
  geo.deleteAttribute('uv');
  geo.computeVertexNormals();
  const mesh = new Mesh(geo, toonMaterial());
  mesh.receiveShadow = true;
  mesh.name = 'ground';
  return mesh;
}

/** The sandy path from the gate out over the hills (following the ground). */
function path(): Mesh {
  const start = worldToGround({ x: PATH_X, y: LAYOUT.fenceY + 40 });
  const length = 40;
  const strip = (width: number, color: number, lift: number) => {
    const geo = new PlaneGeometry(width, length, 6, 80);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      // A gentle wiggle once it's past the queue.
      const z = start.z - length / 2 + pos.getZ(i);
      const out = Math.max(0, start.z - 4 - z);
      const x = start.x + pos.getX(i) + Math.sin(out * 0.25) * Math.min(out, 3) * 0.6;
      pos.setXYZ(i, x, terrainHeight(x, z) + lift, z);
    }
    geo.computeVertexNormals();
    return part(geo, color);
  };
  // The path is flat on the ground: no outline, just a darker edge.
  const mesh = new Mesh(
    merge([strip(toUnits(124), COLORS.pathEdge, 0.01), strip(toUnits(108), COLORS.path, 0.02)]),
    toonMaterial(),
  );
  mesh.receiveShadow = true;
  mesh.name = 'path';
  // Round the end at the gate.
  const cap = (r: number, color: number, lift: number) =>
    part(new CylinderGeometry(r, r, 0.001, 24), color, { x: start.x, y: lift, z: start.z });
  mesh.geometry = merge([
    mesh.geometry,
    cap(toUnits(62), COLORS.pathEdge, 0.01),
    cap(toUnits(54), COLORS.path, 0.02),
  ]);
  return mesh;
}

// ---- Fence and gate ----------------------------------------------------------------------------

const POST_H = 0.52;
const RAIL_YS = [0.2, 0.38];

function fenceRun(from: { x: number; y: number }, to: { x: number; y: number }): BufferGeometry[] {
  const a = worldToGround(from);
  const b = worldToGround(to);
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  const angle = Math.atan2(b.x - a.x, b.z - a.z);
  const parts: BufferGeometry[] = [];
  const posts = Math.max(1, Math.round(length / toUnits(48)));
  for (let i = 0; i <= posts; i++) {
    const t = i / posts;
    parts.push(
      part(new RoundedBoxGeometry(0.15, POST_H, 0.1, 1, 0.04), COLORS.fence, {
        x: a.x + (b.x - a.x) * t,
        y: POST_H / 2,
        z: a.z + (b.z - a.z) * t,
        ry: angle + Math.PI / 2,
      }),
    );
    // A pointed top on each picket.
    parts.push(
      part(new ConeGeometry(0.075, 0.1, 4), COLORS.fence, {
        x: a.x + (b.x - a.x) * t,
        y: POST_H + 0.04,
        z: a.z + (b.z - a.z) * t,
        ry: angle + Math.PI / 4,
      }),
    );
  }
  for (const y of RAIL_YS) {
    parts.push(
      part(new RoundedBoxGeometry(0.07, 0.07, length, 1, 0.02), COLORS.fence, {
        x: (a.x + b.x) / 2,
        y,
        z: (a.z + b.z) / 2 - 0.02 * Math.cos(angle),
        ry: angle,
      }),
    );
  }
  return parts;
}

function fence(): BufferGeometry[] {
  const y = LAYOUT.fenceY;
  const { left, right, front, houseGap } = FENCE;
  const { gate } = LAYOUT;
  return [
    ...fenceRun({ x: left, y }, { x: houseGap.from, y }),
    ...fenceRun({ x: houseGap.to, y }, { x: gate.x, y }),
    ...fenceRun({ x: gate.x + gate.width, y }, { x: right, y }),
    ...fenceRun({ x: left, y }, { x: left, y: front }),
    ...fenceRun({ x: right, y }, { x: right, y: front }),
    ...fenceRun({ x: left, y: front }, { x: right, y: front }),
  ];
}

/** Two tall gate posts with round caps, and the gate panel swung open outward. */
function gate(): BufferGeometry[] {
  const { gate } = LAYOUT;
  const parts: BufferGeometry[] = [];
  for (const x of [gate.x, gate.x + gate.width]) {
    const p = worldToGround({ x, y: LAYOUT.fenceY });
    parts.push(
      part(new RoundedBoxGeometry(0.22, 0.85, 0.22, 2, 0.05), COLORS.fence, {
        x: p.x,
        y: 0.425,
        z: p.z,
      }),
      part(new SphereGeometry(0.11, 14, 10), COLORS.roof, { x: p.x, y: 0.93, z: p.z }),
    );
  }
  // The open panel hangs from the right post, swung out (away from the yard).
  const hinge = worldToGround({ x: gate.x + gate.width + 14, y: LAYOUT.fenceY });
  const width = toUnits(gate.width) - 0.1;
  for (const y of RAIL_YS) {
    parts.push(
      part(new RoundedBoxGeometry(0.06, 0.06, width, 1, 0.02), COLORS.fence, {
        x: hinge.x,
        y,
        z: hinge.z - width / 2,
      }),
    );
  }
  for (let i = 1; i <= 3; i++) {
    parts.push(
      part(new RoundedBoxGeometry(0.06, 0.44, 0.12, 1, 0.02), COLORS.fence, {
        x: hinge.x,
        y: 0.26,
        z: hinge.z - (width * i) / 4,
      }),
    );
  }
  return parts;
}

// ---- Trees, bushes, flowers --------------------------------------------------------------------

function roundTree(
  x: number,
  z: number,
  s: number,
  rand: () => number,
  detail: number,
): BufferGeometry[] {
  const y = terrainHeight(x, z);
  const leaf = () => LEAVES[Math.floor(rand() * LEAVES.length)]!;
  const parts = [
    part(new CylinderGeometry(0.1, 0.16, 1.1, 8), TRUNK, { x, y: y + 0.55 * s, z, s }),
    part(new IcosahedronGeometry(0.7, detail), leaf(), { x, y: y + 1.55 * s, z, s }),
  ];
  // Two smaller puffs for a lumpy, cartoon canopy.
  for (let i = 0; i < 2; i++) {
    const a = rand() * Math.PI * 2;
    parts.push(
      part(new IcosahedronGeometry(0.45, Math.max(1, detail - 1)), leaf(), {
        x: x + Math.cos(a) * 0.45 * s,
        y: y + (1.35 + rand() * 0.4) * s,
        z: z + Math.sin(a) * 0.45 * s,
        s,
      }),
    );
  }
  return parts;
}

function pineTree(x: number, z: number, s: number, rand: () => number): BufferGeometry[] {
  const y = terrainHeight(x, z);
  const green = PINE[Math.floor(rand() * PINE.length)]!;
  return [
    part(new CylinderGeometry(0.08, 0.12, 0.6, 8), TRUNK, { x, y: y + 0.3 * s, z, s }),
    part(new ConeGeometry(0.75, 1.0, 10), green, { x, y: y + 0.95 * s, z, s }),
    part(new ConeGeometry(0.58, 0.85, 10), green, { x, y: y + 1.45 * s, z, s }),
    part(new ConeGeometry(0.4, 0.7, 10), green, { x, y: y + 1.9 * s, z, s }),
  ];
}

/** True where scenery taller than a flower would get in the way (world px). */
export function keepClear(p: { x: number; y: number }, margin = 60): boolean {
  // The fenced yard (animals, bowls, lures, finds).
  if (
    p.x > FENCE.left - margin &&
    p.x < FENCE.right + margin &&
    p.y > LAYOUT.fenceY - margin &&
    p.y < FENCE.front + margin
  )
    return true;
  // The path and gate queue: a corridor from the gate up and to the left (gateSlot's steps).
  const { gateQueue } = LAYOUT;
  for (let i = 0; i < 8; i++) {
    const s = { x: gateQueue.x + i * gateQueue.stepX, y: gateQueue.y + i * gateQueue.stepY };
    if (Math.hypot(p.x - s.x, p.y - s.y) < 110 + margin) return true;
  }
  if (Math.abs(p.x - PATH_X) < 90 + margin && p.y < LAYOUT.fenceY) return true;
  // The house.
  if (p.x > FENCE.houseGap.from - 80 && p.x < FENCE.houseGap.to + 80 && p.y > 100) return true;
  return false;
}

/** Trees around the yard (casting shadows) and a looser, simpler ring over the hills. */
function trees(): { near: BufferGeometry[]; far: BufferGeometry[] } {
  const rand = seededRandom(7);
  const near: BufferGeometry[] = [];
  const far: BufferGeometry[] = [];
  const pathX = worldToGround({ x: PATH_X, y: 0 }).x;
  const plant = (to: BufferGeometry[], wx: number, wy: number, scale: number, detail: number) => {
    if (keepClear({ x: wx, y: wy })) return;
    const g = worldToGround({ x: wx, y: wy });
    // Keep the path clear out in the hills too.
    if (Math.abs(g.x - pathX) < 2.2 && g.z < 0) return;
    const s = scale * (0.85 + rand() * 0.35);
    to.push(...(rand() < 0.6 ? roundTree(g.x, g.z, s, rand, detail) : pineTree(g.x, g.z, s, rand)));
  };
  // Near: a back row behind the queue, and trees down both sides and across the front.
  for (let x = -700; x <= 2000; x += 130)
    plant(near, x + rand() * 60, -150 - rand() * 180, 1.15, 2);
  for (let y = -100; y <= 1250; y += 140) {
    plant(near, -260 - rand() * 200, y + rand() * 60, 1.1, 2);
    plant(near, 1540 + rand() * 200, y + rand() * 60, 1.1, 2);
  }
  for (let x = -600; x <= 1900; x += 150) plant(near, x + rand() * 60, 1140 + rand() * 180, 1.1, 2);
  // Far: a loose ring over the hills.
  for (let i = 0; i < 70; i++) {
    const a = rand() * Math.PI * 2;
    const r = 18 + rand() * 20;
    plant(far, Math.cos(a) * r * 100 + 640, Math.sin(a) * r * 85 + 400, 1.4, 1);
  }
  return { near, far };
}

function bush(wx: number, wy: number, rand: () => number): BufferGeometry[] {
  const g = worldToGround({ x: wx, y: wy });
  const color = BUSH[Math.floor(rand() * BUSH.length)]!;
  return [
    part(new IcosahedronGeometry(0.28, 1), color, { x: g.x, y: 0.2, z: g.z, s: [1.2, 0.9, 1] }),
    part(new IcosahedronGeometry(0.2, 1), color, { x: g.x - 0.26, y: 0.14, z: g.z + 0.05 }),
    part(new IcosahedronGeometry(0.2, 1), color, { x: g.x + 0.26, y: 0.14, z: g.z + 0.03 }),
  ];
}

function bushes(): BufferGeometry[] {
  const rand = seededRandom(11);
  const parts: BufferGeometry[] = [];
  // Behind the fence between the house and the queue, and hugging the fence outside.
  for (let x = 450; x <= 880; x += 105) parts.push(...bush(x + rand() * 30, 292, rand));
  for (let y = 420; y <= 780; y += 120) {
    parts.push(...bush(FENCE.left - 70, y + rand() * 40, rand));
    parts.push(...bush(FENCE.right + 70, y + rand() * 40, rand));
  }
  return parts;
}

/** A little flower: stem, five round petals, a yellow middle. Short enough for anywhere. */
export const FLOWER_HEIGHT = 0.2;

function flower(wx: number, wy: number, color: number): BufferGeometry[] {
  const g = worldToGround({ x: wx, y: wy });
  const y = terrainHeight(g.x, g.z);
  const parts = [
    part(new CylinderGeometry(0.012, 0.012, 0.16, 4, 1, true), 0x5aa84f, {
      x: g.x,
      y: y + 0.08,
      z: g.z,
    }),
    part(new SphereGeometry(0.035, 6, 4), FLOWER_MIDDLE, { x: g.x, y: y + 0.17, z: g.z }),
  ];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    parts.push(
      part(new SphereGeometry(0.04, 6, 4), color, {
        x: g.x + Math.cos(a) * 0.055,
        y: y + 0.165,
        z: g.z + Math.sin(a) * 0.055,
        s: [1, 0.55, 1],
      }),
    );
  }
  return parts;
}

function flowers(): BufferGeometry[] {
  const rand = seededRandom(3);
  const pick = () => FLOWER_COLORS[Math.floor(rand() * FLOWER_COLORS.length)]!;
  // The original's flowers, where it drew them.
  const spots: [number, number, number][] = [
    [480, 390, 0xff9fc4],
    [620, 760, 0xffe066],
    [150, 770, 0xb69bff],
    [980, 420, 0xff9fc4],
    [1230, 700, 0xffe066],
    [520, 120, 0xffffff],
    [760, 210, 0xff9fc4],
    [900, 90, 0xffe066],
  ];
  // More along the inside of the fence and by the house, in little clumps.
  for (let i = 0; i < 12; i++) spots.push([420 + rand() * 640, 365 + rand() * 45, pick()]);
  for (let i = 0; i < 16; i++) spots.push([-20 + rand() * 1320, 695 + rand() * 100, pick()]);
  for (const x of [60, 400])
    for (let i = 0; i < 3; i++) spots.push([x + rand() * 30, 345 + rand() * 30, pick()]);
  const parts: BufferGeometry[] = [];
  for (const [x, y, color] of spots) parts.push(...flower(x, y, color));
  return parts;
}

/** Hundreds of little grass tufts: one instanced mesh, no outline, no shadows. */
function tufts(): InstancedMesh {
  const rand = seededRandom(5);
  const blade = (rz: number, ry: number) =>
    part(new ConeGeometry(0.03, 0.16, 3, 1, true), 0xffffff, { y: 0.07, rz, ry });
  const geo = merge([blade(0, 0), blade(0.35, 1), blade(-0.35, 2), blade(0.2, 4)]);
  const count = 900;
  const mesh = new InstancedMesh(geo, toonMaterial(COLORS.grassDark), count);
  const dummy = new Object3D();
  let n = 0;
  const pathX = worldToGround({ x: PATH_X, y: 0 }).x;
  while (n < count) {
    const x = -22 + rand() * 44;
    const z = -20 + rand() * 34;
    if (Math.abs(x - pathX) < 0.8 && z < 0) continue;
    dummy.position.set(x, terrainHeight(x, z), z);
    dummy.rotation.y = rand() * Math.PI;
    dummy.scale.setScalar(0.7 + rand() * 0.7);
    dummy.updateMatrix();
    mesh.setMatrixAt(n++, dummy.matrix);
  }
  mesh.receiveShadow = true;
  mesh.name = 'tufts';
  mesh.raycast = () => {};
  return mesh;
}

// ---- Sky ---------------------------------------------------------------------------------------

/** A gradient dome: blue overhead, pale at the horizon (the fog color). */
function sky(): Mesh {
  const material = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new Color(SKY_TOP) },
      horizon: { value: new Color(SKY_HORIZON) },
    },
    vertexShader: /* glsl */ `
      varying float vHeight;
      void main() {
        vHeight = normalize(position).y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 top;
      uniform vec3 horizon;
      varying float vHeight;
      void main() {
        gl_FragColor = vec4(mix(horizon, top, smoothstep(0.0, 0.45, vHeight)), 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new Mesh(new SphereGeometry(160, 24, 12), material);
  mesh.name = 'sky';
  mesh.renderOrder = -1;
  mesh.raycast = () => {};
  return mesh;
}

/** Puffy clouds far off, above the hills (seen when the camera is low). */
function clouds(): Mesh {
  const rand = seededRandom(13);
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const a = rand() * Math.PI * 2;
    const r = 70 + rand() * 30;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const y = 16 + rand() * 12;
    for (let j = 0; j < 4; j++) {
      parts.push(
        part(new DodecahedronGeometry(2.4 + rand() * 1.6, 1), 0xffffff, {
          x: x + (j - 1.5) * 3 + rand(),
          y: y + rand() * 1.5,
          z: z + rand() * 2,
          s: [1.3, 0.8, 1],
        }),
      );
    }
  }
  const material = toonMaterial();
  material.fog = false;
  const mesh = new Mesh(merge(parts), material);
  mesh.name = 'clouds';
  mesh.raycast = () => {};
  return mesh;
}
