import {
  CatmullRomCurve3,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  IcosahedronGeometry,
  LatheGeometry,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  type BufferGeometry,
  type Mesh,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { darken, lighten } from '../../art/svg';
import { getItem, isPlaceable, layerOf } from '../../config/items';
import { part, sceneryMesh, seededRandom } from '../art/toon';

/**
 * Placed items in 3D (DESIGN 6.5 lures, 12.3 furniture, 12.4 beds), following the original's
 * drawings in art/itemSvg.ts. Each model fills a footprint box `w` x `d` (units, local x and z,
 * front = +z) and scales its heights by `s` (the tile size, which shrinks in bigger houses, like
 * the original's tiles). Wall items are flat pictures `w` wide and `d` tall, facing +z.
 * Models are cached per item and size.
 */

const OUTLINE = 0.014;
const WOOD = '#b98a5e';
const SOIL = '#8b5a33';
const LEAF = '#6cc05a';
const WATER = '#8fd3f0';
const STONE = '#c9c4b5';
const RAINBOW = ['#ff6f6f', '#ffa54a', '#ffd84d', '#7cc46a', '#6fa8ef', '#b69bff'];

type Parts = BufferGeometry[];

/** A rounded box standing on the floor (y = bottom), centered at x, z. */
function block(
  P: Parts,
  color: string,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  r = 0.04,
) {
  const radius = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
  P.push(
    part(new RoundedBoxGeometry(w, h, d, 2, Math.max(0.002, radius)), color, {
      x,
      y: y + h / 2,
      z,
    }),
  );
}

function ball(
  P: Parts,
  color: string,
  x: number,
  y: number,
  z: number,
  r: number | [number, number, number],
  seg = 10,
) {
  P.push(
    part(new SphereGeometry(1, seg, Math.max(6, seg - 3)), color, {
      x,
      y,
      z,
      s: typeof r === 'number' ? [r, r, r] : r,
    }),
  );
}

function rod(
  P: Parts,
  color: string,
  x: number,
  y: number,
  z: number,
  radius: number,
  h: number,
  seg = 10,
  top = radius,
) {
  P.push(part(new CylinderGeometry(top, radius, h, seg), color, { x, y: y + h / 2, z }));
}

function flower(
  P: Parts,
  x: number,
  y: number,
  z: number,
  r: number,
  petal: string,
  middle = '#ffd84d',
) {
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    ball(P, petal, x + Math.cos(a) * r, y, z + Math.sin(a) * r, [r * 0.75, r * 0.4, r * 0.75], 8);
  }
  ball(P, middle, x, y + r * 0.2, z, r * 0.6, 8);
}

/** A tube through points (stems, strings, bamboo leaves). */
function tube(P: Parts, color: string, points: [number, number, number][], radius: number) {
  const curve = new CatmullRomCurve3(points.map((p) => new Vector3(...p)));
  P.push(part(new TubeGeometry(curve, 12, radius, 6, false), color));
}

type Build = (P: Parts, w: number, d: number, s: number, color: string) => void;

const MODELS: Record<string, Build> = {
  // ---- Yard lures ------------------------------------------------------------------------------
  carrot_patch: (P, w, d, s) => {
    ball(P, SOIL, 0, 0.02, 0, [w * 0.44, 0.08 * s, d * 0.44], 14);
    for (const x of [-0.25, 0, 0.25]) {
      const cx = x * w;
      P.push(
        part(new ConeGeometry(0.06 * s, 0.14 * s, 10), '#f28c38', {
          x: cx,
          y: 0.12 * s,
          z: 0,
          rx: Math.PI,
        }),
      );
      for (const a of [-0.4, 0, 0.4])
        tube(
          P,
          LEAF,
          [
            [cx, 0.18 * s, 0],
            [cx + a * 0.08 * s, 0.3 * s, 0.02],
            [cx + a * 0.16 * s, 0.38 * s, 0.04],
          ],
          0.015 * s,
        );
    }
  },
  bird_bath: (P, w, d, s) => {
    const r = Math.min(w, d) * 0.45;
    rod(P, STONE, 0, 0, 0, r * 0.35, 0.08 * s, 16);
    rod(P, STONE, 0, 0.08 * s, 0, r * 0.14, 0.4 * s, 12);
    const bowl = [
      [0.02, 0],
      [r * 0.5, 0.02],
      [r, 0.1],
      [r * 0.96, 0.14],
      [r * 0.85, 0.1],
      [0.02, 0.06],
    ].map(([x, y]) => new Vector2(x!, y! * s));
    P.push(part(new LatheGeometry(bowl, 20), STONE, { y: 0.46 * s }));
    rod(P, WATER, 0, 0.53 * s, 0, r * 0.82, 0.01, 20);
    // A little blue bird on the rim.
    ball(P, '#6fa8ef', r * 0.8, 0.63 * s, 0, 0.06 * s, 10);
    ball(P, '#6fa8ef', r * 0.8, 0.71 * s, 0.03 * s, 0.04 * s, 8);
    P.push(
      part(new ConeGeometry(0.015 * s, 0.04 * s, 6), '#ffa54a', {
        x: r * 0.8,
        y: 0.71 * s,
        z: 0.08 * s,
        rx: Math.PI / 2,
      }),
    );
  },
  toy_basket: (P, w, d, s, c) => {
    const r = Math.min(w, d) * 0.42;
    rod(P, c, 0, 0, 0, r * 0.85, 0.24 * s, 18, r);
    P.push(
      part(new TorusGeometry(r * 0.98, 0.025 * s, 6, 24), darken(c, 0.2), {
        y: 0.24 * s,
        rx: Math.PI / 2,
      }),
    );
    ball(P, '#ff6f6f', -r * 0.3, 0.28 * s, 0, 0.1 * s, 12);
    ball(P, '#6fa8ef', r * 0.35, 0.27 * s, r * 0.1, 0.09 * s, 12);
    // A handle.
    P.push(
      part(new TorusGeometry(r * 0.8, 0.02 * s, 6, 20, Math.PI), darken(c, 0.2), { y: 0.24 * s }),
    );
  },
  flower_garden: (P, w, d, s) => {
    ball(P, SOIL, 0, 0.02, 0, [w * 0.44, 0.06 * s, d * 0.44], 14);
    const rand = seededRandom(4);
    const petals = ['#ff9fc4', '#ffd84d', '#b69bff', '#ffffff', '#ff6f9a'];
    for (let i = 0; i < 6; i++) {
      const x = (rand() - 0.5) * w * 0.65;
      const z = (rand() - 0.5) * d * 0.55;
      const h = (0.22 + rand() * 0.12) * s;
      tube(
        P,
        LEAF,
        [
          [x, 0.04, z],
          [x + 0.01, h * 0.5, z],
          [x, h, z],
        ],
        0.012 * s,
      );
      flower(P, x, h, z, 0.05 * s, petals[i % petals.length]!);
    }
  },
  little_pond: (P, w, d, s) => {
    ball(P, WATER, 0, 0.0, 0, [w * 0.42, 0.03, d * 0.4], 20);
    const rand = seededRandom(9);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      ball(
        P,
        i % 2 ? STONE : darken(STONE, 0.12),
        Math.cos(a) * w * 0.44,
        0.03,
        Math.sin(a) * d * 0.42,
        [0.07 * s + rand() * 0.02, 0.05 * s, 0.07 * s],
        8,
      );
    }
    ball(P, '#7cc46a', w * 0.12, 0.035, d * 0.05, [0.09 * s, 0.01, 0.09 * s], 10);
    flower(P, w * 0.12, 0.05, d * 0.05, 0.025 * s, '#ff9fc4');
  },
  bamboo_grove: (P, w, d, s) => {
    const rand = seededRandom(2);
    for (let i = 0; i < 5; i++) {
      const x = (rand() - 0.5) * w * 0.6;
      const z = (rand() - 0.5) * d * 0.5;
      const h = (0.9 + rand() * 0.5) * s;
      for (let y = 0; y < h; y += 0.22 * s) {
        rod(P, i % 2 ? '#8fd177' : '#7cc46a', x, y, z, 0.035 * s, 0.2 * s, 8);
        P.push(
          part(new TorusGeometry(0.036 * s, 0.01 * s, 4, 10), '#5aa04a', {
            x,
            y: y + 0.2 * s,
            z,
            rx: Math.PI / 2,
          }),
        );
      }
      for (const a of [-1, 1])
        ball(P, LEAF, x + a * 0.08 * s, h * 0.85, z, [0.1 * s, 0.025 * s, 0.04 * s], 8);
    }
  },
  eucalyptus_tree: (P, _w, _d, s) => {
    rod(P, '#c9b8a0', 0, 0, 0, 0.07 * s, 0.9 * s, 10, 0.05 * s);
    for (const [x, y, z, r] of [
      [0, 1.05, 0, 0.32],
      [0.18, 0.9, 0.05, 0.22],
      [-0.18, 0.92, -0.04, 0.22],
      [0, 1.3, 0, 0.2],
    ] as const) {
      P.push(part(new IcosahedronGeometry(r * s, 1), '#6aa88a', { x: x * s, y: y * s, z: z * s }));
    }
  },
  warm_rock: (P, w, d, s, c) => {
    P.push(part(new DodecahedronGeometry(1, 1), c, { y: 0.2 * s, s: [w * 0.4, 0.2 * s, d * 0.4] }));
    ball(P, '#ffb36b', 0, 0.38 * s, 0, [0.12 * s, 0.02, 0.1 * s], 10);
    // Warm wisps.
    for (const x of [-0.08, 0.08])
      tube(
        P,
        '#ffd1a8',
        [
          [x * s, 0.42 * s, 0],
          [x * s + 0.03, 0.53 * s, 0],
          [x * s - 0.02, 0.64 * s, 0],
        ],
        0.012 * s,
      );
  },
  rainbow_fountain: (P, w, d, s) => {
    const r = Math.min(w * 0.45, d * 0.9);
    const basin = [
      [0.02, 0],
      [r, 0],
      [r, 0.16],
      [r * 0.9, 0.16],
      [r * 0.9, 0.06],
      [0.02, 0.06],
    ].map(([x, y]) => new Vector2(x!, y! * s));
    P.push(part(new LatheGeometry(basin, 24), STONE, { s: [(w * 0.45) / r, 1, (d * 0.42) / r] }));
    ball(P, WATER, 0, 0.11 * s, 0, [w * 0.4, 0.02, d * 0.36], 18);
    rod(P, STONE, 0, 0.06 * s, 0, 0.06 * s, 0.35 * s, 12);
    RAINBOW.forEach((color, i) => {
      P.push(
        part(new TorusGeometry((0.34 - i * 0.04) * w, 0.018 * s, 6, 24, Math.PI), color, {
          y: 0.14 * s,
        }),
      );
    });
  },
  moon_lantern: (P, _w, _d, s, c) => {
    rod(P, '#5d6170', 0, 0, 0, 0.05 * s, 0.9 * s, 8);
    block(P, '#5d6170', 0, 0.88 * s, 0, 0.22 * s, 0.03 * s, 0.22 * s, 0.01);
    ball(P, c, 0, 1.03 * s, 0, [0.1 * s, 0.13 * s, 0.1 * s], 14);
    for (const [x, z] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const)
      rod(P, '#5d6170', x * 0.09 * s, 0.9 * s, z * 0.09 * s, 0.01 * s, 0.26 * s, 5);
    block(P, '#5d6170', 0, 1.16 * s, 0, 0.24 * s, 0.03 * s, 0.24 * s, 0.01);
    P.push(
      part(new TorusGeometry(0.08 * s, 0.025 * s, 6, 16, Math.PI * 1.2), '#ffe38a', {
        y: 1.3 * s,
        rz: -0.9,
      }),
    );
  },
  food_bowl: () => {},

  // ---- Furniture ------------------------------------------------------------------------------
  armchair: (P, w, d, s, c) => chair(P, w, d, s, c, 1),
  sofa: (P, w, d, s, c) => chair(P, w, d, s, c, 2),
  side_table: (P, w, d, s, c) => {
    const r = Math.min(w, d) * 0.4;
    rod(P, darken(c, 0.15), 0, 0, 0, r * 0.3, 0.04 * s, 12);
    rod(P, darken(c, 0.1), 0, 0.04 * s, 0, 0.04 * s, 0.4 * s, 8);
    rod(P, c, 0, 0.44 * s, 0, r, 0.06 * s, 20);
    ball(P, '#ff9fc4', r * 0.3, 0.53 * s, 0, 0.05 * s, 10);
  },
  dining_table: (P, w, d, s, c) => {
    block(P, c, 0, 0.38 * s, 0, w * 0.8, 0.06 * s, d * 0.5, 0.02);
    for (const x of [-1, 1])
      for (const z of [-1, 1])
        block(
          P,
          darken(c, 0.15),
          x * w * 0.34,
          0,
          z * d * 0.17,
          0.06 * s,
          0.38 * s,
          0.06 * s,
          0.01,
        );
    for (const z of [-1, 1])
      block(P, darken(c, 0.08), 0, 0.2 * s, z * d * 0.38, w * 0.75, 0.05 * s, d * 0.16, 0.02);
    // A checked cloth and a fruit bowl.
    block(P, '#ff9fb5', 0, 0.44 * s, 0, w * 0.4, 0.008, d * 0.46, 0.004);
    ball(P, '#ff6f6f', 0, 0.5 * s, 0, 0.05 * s, 10);
  },
  tv: (P, w, d, s, c) => {
    block(P, WOOD, 0, 0, 0, w * 0.75, 0.3 * s, d * 0.6, 0.03);
    block(P, c, 0, 0.3 * s, 0, w * 0.7, 0.5 * s, d * 0.3, 0.05);
    block(P, '#8fd6ff', 0, 0.35 * s, d * 0.15 + 0.005, w * 0.56, 0.38 * s, 0.01, 0.01);
    ball(P, '#ffd84d', -w * 0.1, 0.56 * s, d * 0.16 + 0.005, [0.05 * s, 0.05 * s, 0.01], 10);
    for (const a of [-0.4, 0.4])
      tube(
        P,
        '#5a5f73',
        [
          [0, 0.8 * s, 0],
          [a * 0.12, 0.93 * s, 0],
          [a * 0.22, 1.02 * s, 0],
        ],
        0.008 * s,
      );
  },
  sun_picture: (P, w, d, _s, c) => {
    frame(P, w, d, '#fff6d6');
    const r = Math.min(w, d) * 0.2;
    P.push(part(new SphereGeometry(r, 16, 8), c, { z: 0.02, s: [1, 1, 0.25] }));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      P.push(
        part(new ConeGeometry(r * 0.25, r * 0.6, 6), c, {
          x: Math.cos(a) * r * 1.45,
          y: Math.sin(a) * r * 1.45,
          z: 0.02,
          rz: a - Math.PI / 2,
        }),
      );
    }
  },
  paw_poster: (P, w, d, _s, c) => {
    frame(P, w, d, c);
    for (const [x, rot] of [
      [-0.25, 0.3],
      [0.2, -0.2],
    ] as const) {
      const cx = x * w;
      ball(P, '#ffffff', cx, -d * 0.08, 0.02, [d * 0.13, d * 0.11, 0.01], 10);
      for (let i = 0; i < 4; i++) {
        const a = rot + (i - 1.5) * 0.45;
        ball(
          P,
          '#ffffff',
          cx + Math.sin(a) * d * 0.2,
          -d * 0.08 + Math.cos(a) * d * 0.2,
          0.02,
          [d * 0.055, d * 0.065, 0.01],
          8,
        );
      }
    }
  },
  round_rug: (P, w, d, _s, c) => {
    P.push(part(new CylinderGeometry(1, 1, 0.02, 40), c, { y: 0.01, s: [w * 0.47, 1, d * 0.47] }));
    P.push(
      part(new TorusGeometry(1, 0.03, 4, 40), lighten(c, 0.35), {
        y: 0.02,
        rx: Math.PI / 2,
        s: [w * 0.32, d * 0.32, 1],
      }),
    );
  },
  rainbow_rug: (P, w, d) => {
    RAINBOW.forEach((color, i) => {
      const band = (d * 0.9) / RAINBOW.length;
      block(P, color, 0, 0, -d * 0.45 + band * (i + 0.5), w * 0.9, 0.02, band, 0.008);
    });
  },
  floor_lamp: (P, _w, _d, s, c) => {
    rod(P, '#5d6170', 0, 0, 0, 0.12 * s, 0.03 * s, 16);
    rod(P, '#5d6170', 0, 0.03 * s, 0, 0.02 * s, 1.1 * s, 8);
    rod(P, c, 0, 1.05 * s, 0, 0.22 * s, 0.3 * s, 18, 0.12 * s);
    ball(P, '#fff6c2', 0, 1.08 * s, 0, 0.08 * s, 10);
  },
  fairy_lights: (P, w, d) => {
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      pts.push([(t - 0.5) * w * 0.9, d * 0.25 - Math.sin(t * Math.PI) * d * 0.35, 0.02]);
    }
    tube(P, '#5aa04a', pts, 0.008);
    pts.forEach(([x, y], i) =>
      ball(P, RAINBOW[i % RAINBOW.length]!, x, y - 0.04, 0.03, [0.03, 0.045, 0.03], 8),
    );
  },
  potted_plant: (P, _w, _d, s) => {
    pot(P, s);
    for (const [x, y, z, r] of [
      [0, 0.5, 0, 0.16],
      [0.1, 0.42, 0.06, 0.12],
      [-0.1, 0.44, -0.04, 0.12],
      [0.02, 0.62, 0, 0.1],
    ] as const) {
      P.push(part(new IcosahedronGeometry(r * s, 1), LEAF, { x: x * s, y: y * s, z: z * s }));
    }
  },
  flower_pot: (P, _w, _d, s, c) => {
    pot(P, s);
    tube(
      P,
      LEAF,
      [
        [0, 0.3 * s, 0],
        [0.02, 0.5 * s, 0],
        [0, 0.72 * s, 0.02],
      ],
      0.02 * s,
    );
    ball(P, LEAF, 0.07 * s, 0.48 * s, 0, [0.07 * s, 0.02 * s, 0.04 * s], 8);
    // A big sunflower, facing out.
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      P.push(
        part(new SphereGeometry(1, 8, 6), c, {
          x: Math.cos(a) * 0.1 * s,
          y: 0.76 * s + Math.sin(a) * 0.1 * s,
          z: 0.04 * s,
          s: [0.05 * s, 0.05 * s, 0.015 * s],
        }),
      );
    }
    ball(P, '#8b5a33', 0, 0.76 * s, 0.05 * s, [0.07 * s, 0.07 * s, 0.025 * s], 12);
  },
  bookshelf: (P, w, d, s, c) => {
    const h = 1.2 * s;
    const W = w * 0.9;
    const D = d * 0.55;
    block(P, c, 0, 0, -d * 0.15, W, h, D, 0.03);
    const books = ['#ef6f6f', '#6fa8ef', '#ffd84d', '#7cc46a', '#b69bff', '#ff9fc4'];
    const rand = seededRandom(5);
    for (let shelf = 0; shelf < 3; shelf++) {
      const y = 0.08 * s + (shelf * (h - 0.1 * s)) / 3;
      block(
        P,
        darken(c, 0.25),
        0,
        y,
        -d * 0.15 + D * 0.5 - 0.01,
        W * 0.86,
        (h / 3) * 0.78,
        0.02,
        0.005,
      );
      let x = -W * 0.4;
      while (x < W * 0.38) {
        const bw = (0.05 + rand() * 0.05) * s;
        const bh = (h / 3) * (0.55 + rand() * 0.2);
        block(
          P,
          books[Math.floor(rand() * books.length)]!,
          x + bw / 2,
          y,
          -d * 0.15 + D * 0.5 + 0.005,
          bw * 0.9,
          bh,
          0.03,
          0.006,
        );
        x += bw;
      }
    }
  },
  toy_shelf: (P, w, d, s, c) => {
    block(P, c, 0, 0, -d * 0.1, w * 0.8, 0.55 * s, d * 0.5, 0.03);
    block(P, darken(c, 0.2), 0, 0.28 * s, -d * 0.1 + d * 0.25, w * 0.72, 0.02 * s, 0.02, 0.005);
    // A teddy on top, a ball and a block.
    const y = 0.55 * s;
    ball(P, '#c98a4b', -w * 0.15, y + 0.1 * s, 0, 0.1 * s, 12);
    ball(P, '#c98a4b', -w * 0.15, y + 0.25 * s, 0, 0.07 * s, 12);
    for (const x of [-1, 1])
      ball(P, '#c98a4b', -w * 0.15 + x * 0.05 * s, y + 0.31 * s, 0, 0.025 * s, 8);
    ball(P, '#ff6f6f', w * 0.15, y + 0.07 * s, 0, 0.07 * s, 12);
    block(P, '#6fa8ef', w * 0.05, 0.3 * s, d * 0.12, 0.1 * s, 0.1 * s, 0.1 * s, 0.01);
  },

  // ---- Pet beds -------------------------------------------------------------------------------
  bed_basic: (P, w, d, s, c) => bed(P, w, d, s, c, false, false),
  bed_fluffy: (P, w, d, s, c) => bed(P, w, d, s, c, true, false),
  bed_royal: (P, w, d, s, c) => bed(P, w, d, s, c, true, true),
};

/** Armchair (1 seat) or sofa (2): a seat, a back, two arms, and cushions. */
function chair(P: Parts, w: number, d: number, s: number, c: string, seats: number) {
  const W = w * 0.9;
  const D = d * 0.8;
  const dark = darken(c, 0.12);
  block(P, dark, 0, 0, 0, W, 0.28 * s, D, 0.05);
  block(P, dark, 0, 0.1 * s, -D * 0.38, W, 0.6 * s, D * 0.26, 0.06);
  for (const x of [-1, 1])
    block(P, c, x * (W / 2 - W * 0.07), 0.1 * s, 0, W * 0.14, 0.34 * s, D, 0.06);
  const cushion = (W * 0.72) / seats;
  for (let i = 0; i < seats; i++) {
    block(
      P,
      lighten(c, 0.15),
      -W * 0.36 + cushion * (i + 0.5),
      0.28 * s,
      D * 0.08,
      cushion * 0.96,
      0.09 * s,
      D * 0.72,
      0.04,
    );
  }
}

/** A round pet bed: a soft rim around a cushion (fluffy: a puffy rim; royal: gold and a crown). */
function bed(
  P: Parts,
  w: number,
  d: number,
  s: number,
  c: string,
  fluffy: boolean,
  royal: boolean,
) {
  const rx = w * 0.44;
  const rz = d * 0.44;
  ball(P, lighten(c, 0.35), 0, 0.05 * s, 0, [rx * 0.8, 0.06 * s, rz * 0.8], 16);
  if (fluffy) {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      ball(P, c, Math.cos(a) * rx * 0.9, 0.1 * s, Math.sin(a) * rz * 0.9, 0.09 * s, 9);
    }
  } else {
    P.push(
      part(new TorusGeometry(1, 0.13, 8, 32), c, {
        y: 0.09 * s,
        rx: Math.PI / 2,
        s: [rx * 0.9, rz * 0.9, 0.8 * s],
      }),
    );
  }
  if (royal) {
    P.push(
      part(new TorusGeometry(1, 0.03, 6, 32), '#ffd84d', {
        y: 0.2 * s,
        rx: Math.PI / 2,
        s: [rx * 0.95, rz * 0.95, s],
      }),
    );
    const y = 0.2 * s;
    block(P, '#ffd84d', 0, y, rz * 0.95, 0.16 * s, 0.07 * s, 0.03, 0.01);
    for (const x of [-1, 0, 1])
      P.push(
        part(new ConeGeometry(0.025 * s, 0.07 * s, 5), '#ffd84d', {
          x: x * 0.06 * s,
          y: y + 0.1 * s,
          z: rz * 0.95,
        }),
      );
  }
}

/** A picture frame on the wall, `w` wide and `d` tall (wall items), with a colored canvas. */
function frame(P: Parts, w: number, d: number, canvas: string) {
  const W = w * 0.9;
  const H = d * 0.85;
  block(P, WOOD, 0, -H / 2, -0.01, W, H, 0.04, 0.02);
  block(P, canvas, 0, -H / 2 + 0.05, 0.005, W - 0.1, H - 0.1, 0.02, 0.01);
}

/** A terracotta pot. */
function pot(P: Parts, s: number) {
  const profile = [
    [0.02, 0],
    [0.12, 0],
    [0.16, 0.26],
    [0.18, 0.28],
    [0.18, 0.32],
    [0.15, 0.32],
    [0.14, 0.3],
    [0.02, 0.3],
  ].map(([x, y]) => new Vector2(x! * s, y! * s));
  P.push(part(new LatheGeometry(profile, 18), '#d9795a'));
  P.push(part(new CylinderGeometry(0.14 * s, 0.14 * s, 0.01, 16), SOIL, { y: 0.3 * s }));
}

/** Anything without its own recipe: a friendly rounded block in its color. */
const generic: Build = (P, w, d, s, c) => block(P, c, 0, 0, 0, w * 0.8, 0.4 * s, d * 0.8, 0.06);

const cache = new Map<string, Mesh>();

/**
 * The model for a placed item (cached per item and size). Floor items fill `w` x `d` on the
 * ground, standing on y = 0; wall items are `w` wide and `d` tall, centered on their spot.
 */
export function itemModel(itemId: string, w: number, d: number, s: number): Mesh {
  const key = `${itemId}|${w.toFixed(3)}|${d.toFixed(3)}|${s.toFixed(3)}`;
  const hit = cache.get(key);
  if (hit) return hit.clone();
  const def = getItem(itemId);
  const color = def?.color ?? '#c9a27a';
  const P: Parts = [];
  const build = MODELS[itemId] ?? generic;
  build(P, w, d, s, color);
  if (P.length === 0) generic(P, w, d, s, color);
  const wall = def && isPlaceable(def) && layerOf(def) === 'wall';
  const mesh = sceneryMesh(P, { outline: OUTLINE, fade: false, shadows: !wall });
  cache.set(key, mesh);
  return mesh.clone();
}

/** A flat outline Shape of a rounded rectangle (ghosts and selection). */
export function roundedRect(w: number, h: number, r: number): ShapeGeometry {
  const s = new Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return new ShapeGeometry(s, 6);
}
