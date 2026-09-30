import {
  ConeGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Matrix4,
  Mesh,
  Quaternion,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type BufferGeometry,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { darken, lighten } from '../../art/svg';
import { getItem, type PetOutfitItemDef } from '../../config/items';
import type { Animal } from '../../sim/types';
import { merge, outlineGeometry, part } from '../art/toon';
import { animalMaterials } from './materials';
import type { AnimalAnchors } from './model';

/**
 * Pet outfits in 3D (DESIGN 10.3), fitted to each animal's own head, neck, body and eyes (its
 * model's anchors), like the original's fitted outfits: hats and bows on the head; sweaters,
 * capes, tutus and scarves on the body; glasses, bandanas and shades on the face. One merged
 * mesh per animal look and outfit, sharing the animals' materials (so it fades with them).
 */

type V3 = [number, number, number];
type Parts = BufferGeometry[];
const UP = new Vector3(0, 1, 0);
const FORWARD = new Vector3(0, 0, 1);

function along(at: V3, dir: V3, from = UP): Matrix4 {
  const q = new Quaternion().setFromUnitVectors(from, new Vector3(...dir).normalize());
  return new Matrix4().compose(new Vector3(...at), q, new Vector3(1, 1, 1));
}

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/** Where the neck is: under the head, a little toward the front. */
function neck(a: AnimalAnchors): { at: V3; r: number } {
  const hr = a.head.radius;
  const [hx, hy, hz] = a.head.center;
  return { at: [hx, hy - hr * 0.8, hz * 0.6], r: hr * 0.66 };
}

function headTop(a: AnimalAnchors): V3 {
  const [x, y, z] = a.head.center;
  return [x, y + a.head.radius * 0.88, z - a.head.radius * 0.05];
}

function star(r: number): Shape {
  const s = new Shape();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.45 : r;
    const ang = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const x = Math.cos(ang) * rr;
    const y = Math.sin(ang) * rr;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  s.closePath();
  return s;
}

const BUILD: Record<string, (P: Parts, a: AnimalAnchors, c: string, c2: string) => void> = {
  // ---- Head ----
  party: (P, a, c, c2) => {
    const hr = a.head.radius;
    const base = headTop(a);
    const tilt: V3 = [0.25, 1, -0.1];
    const h = hr * 0.95;
    const cone = new ConeGeometry(hr * 0.4, h, 12);
    cone.translate(0, h / 2, 0);
    P.push(part(cone, c, { matrix: along(base, tilt) }));
    const d = new Vector3(...tilt).normalize();
    for (const t of [0.25, 0.55]) {
      const ring = new TorusGeometry(hr * 0.4 * (1 - t), hr * 0.035, 5, 16);
      ring.rotateX(Math.PI / 2);
      P.push(
        part(ring, c2, { matrix: along(add(base, [d.x * h * t, d.y * h * t, d.z * h * t]), tilt) }),
      );
    }
    P.push(
      part(new SphereGeometry(hr * 0.13, 10, 8), c2, {
        x: base[0] + d.x * h,
        y: base[1] + d.y * h,
        z: base[2] + d.z * h,
      }),
    );
  },
  bow: (P, a, c) => {
    const hr = a.head.radius;
    const at = add(headTop(a), [hr * 0.38, hr * 0.02, hr * 0.12]);
    for (const side of [-1, 1]) {
      P.push(
        part(new SphereGeometry(1, 12, 8), c, {
          x: at[0] + side * hr * 0.2,
          y: at[1],
          z: at[2],
          s: [hr * 0.2, hr * 0.14, hr * 0.08],
          rz: side * 0.3,
        }),
      );
    }
    P.push(
      part(new SphereGeometry(hr * 0.08, 8, 6), darken(c, 0.15), {
        x: at[0],
        y: at[1],
        z: at[2] + 0.01,
      }),
    );
  },
  flower: (P, a, c, c2) => {
    const hr = a.head.radius;
    const at = add(headTop(a), [-hr * 0.38, -hr * 0.08, hr * 0.2]);
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2;
      P.push(
        part(new SphereGeometry(1, 7, 5), c2, {
          x: at[0] + Math.cos(ang) * hr * 0.14,
          y: at[1] + Math.sin(ang) * hr * 0.14,
          z: at[2],
          s: [hr * 0.11, hr * 0.11, hr * 0.05],
        }),
      );
    }
    P.push(
      part(new SphereGeometry(hr * 0.09, 10, 7), c, { x: at[0], y: at[1], z: at[2] + hr * 0.03 }),
    );
  },
  crown: (P, a, c) => {
    const hr = a.head.radius;
    const base = add(headTop(a), [0, -hr * 0.05, 0]);
    const band = new CylinderGeometry(hr * 0.42, hr * 0.46, hr * 0.2, 14, 1, true);
    P.push(part(band, c, { x: base[0], y: base[1] + hr * 0.1, z: base[2] }));
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2 + Math.PI / 2;
      const x = base[0] + Math.cos(ang) * hr * 0.42;
      const z = base[2] + Math.sin(ang) * hr * 0.42;
      P.push(part(new ConeGeometry(hr * 0.09, hr * 0.2, 6), c, { x, y: base[1] + hr * 0.28, z }));
      P.push(
        part(new SphereGeometry(hr * 0.045, 8, 6), i % 2 ? '#ff6f9a' : '#6fa8ef', {
          x: x * 1.02,
          y: base[1] + hr * 0.12,
          z: z + (z > base[2] ? 0.01 : -0.01),
        }),
      );
    }
  },

  // ---- Body ----
  sweater: (P, a, c, c2) => {
    const [bx, by, bz] = a.body.center;
    const [rx, ry, rz] = a.body.radii;
    const s: V3 = [rx * 1.08, ry * 1.08, rz * 1.08];
    // Knitted over the top of the body, leaving the belly bottom and feet out.
    const shell = new SphereGeometry(1, 14, 9, 0, Math.PI * 2, 0, Math.PI * 0.64);
    P.push(part(shell, c, { x: bx, y: by, z: bz, s }));
    // Two stripes around it (at polar angles on the shell), and a ribbed hem at its edge.
    const ring = (theta: number, color: string, thick: number) => {
      const y = Math.cos(theta);
      const rr = Math.sin(theta) * 1.01;
      const g = new TorusGeometry(1, thick, 5, 16);
      g.rotateX(Math.PI / 2);
      P.push(
        part(g, color, { x: bx, y: by + y * s[1], z: bz, s: [rr * s[0], s[1] * 0.6, rr * s[2]] }),
      );
    };
    ring(Math.PI * 0.34, c2, 0.045);
    ring(Math.PI * 0.46, c2, 0.045);
    ring(Math.PI * 0.64, darken(c, 0.12), 0.06);
    const n = neck(a);
    const collar = new TorusGeometry(n.r, n.r * 0.2, 5, 16);
    collar.rotateX(Math.PI / 2);
    P.push(part(collar, lighten(c, 0.15), { x: n.at[0], y: n.at[1], z: n.at[2] }));
  },
  cape: (P, a, c, c2) => {
    const [bx, by, bz] = a.body.center;
    const [rx, ry, rz] = a.body.radii;
    const n = neck(a);
    // A cloak over the back, from the shoulders down.
    const cloak = new SphereGeometry(1, 12, 8, Math.PI, Math.PI, Math.PI * 0.18, Math.PI * 0.72);
    P.push(
      part(cloak, c, {
        x: bx,
        y: by + ry * 0.1,
        z: bz - rz * 0.05,
        s: [rx * 1.18, ry * 1.12, rz * 1.18],
      }),
    );
    const collar = new TorusGeometry(n.r * 1.05, n.r * 0.16, 5, 16);
    collar.rotateX(Math.PI / 2);
    P.push(part(collar, c, { x: n.at[0], y: n.at[1], z: n.at[2] }));
    P.push(
      part(new SphereGeometry(n.r * 0.2, 10, 8), c2, {
        x: n.at[0],
        y: n.at[1],
        z: n.at[2] + n.r * 1.02,
      }),
    );
  },
  tutu: (P, a, c) => {
    const [bx, by, bz] = a.body.center;
    const [rx, ry, rz] = a.body.radii;
    // Two ruffled layers flaring out from the waist, a little wider than the body.
    const w = Math.max(rx, rz);
    const y = by - ry * 0.05;
    for (const [k, color] of [
      [1, c],
      [0.75, lighten(c, 0.35)],
    ] as const) {
      const skirt = new CylinderGeometry(w * 1.0, w * (1.12 + 0.1 * k), ry * 0.42 * k, 16, 1, true);
      skirt.scale(1, 1, rz / w);
      P.push(part(skirt, color, { x: bx, y: y - ry * 0.2 * (1 - k), z: bz }));
    }
  },
  scarf: (P, a, c, c2) => {
    const n = neck(a);
    const wrap = new TorusGeometry(n.r, n.r * 0.3, 5, 16);
    wrap.rotateX(Math.PI / 2);
    P.push(part(wrap, c, { x: n.at[0], y: n.at[1], z: n.at[2] }));
    const stripe = new TorusGeometry(n.r * 1.01, n.r * 0.08, 5, 16);
    stripe.rotateX(Math.PI / 2);
    P.push(part(stripe, c2, { x: n.at[0], y: n.at[1] + n.r * 0.05, z: n.at[2] }));
    // The end hanging down the front, with a fringe.
    const endAt: V3 = [n.at[0] + n.r * 0.45, n.at[1] - n.r * 0.55, n.at[2] + n.r * 0.95];
    P.push(
      part(new RoundedBoxGeometry(n.r * 0.42, n.r * 0.9, n.r * 0.14, 2, n.r * 0.06), c, {
        x: endAt[0],
        y: endAt[1],
        z: endAt[2],
        rz: 0.15,
      }),
    );
    P.push(
      part(new RoundedBoxGeometry(n.r * 0.44, n.r * 0.1, n.r * 0.15, 1, n.r * 0.03), c2, {
        x: endAt[0] - n.r * 0.06,
        y: endAt[1] - n.r * 0.3,
        z: endAt[2],
        rz: 0.15,
      }),
    );
  },

  // ---- Face ----
  glasses: (P, a, c) => {
    const hr = a.head.radius;
    const [l, r] = a.eyes;
    for (const e of [l, r]) {
      P.push(
        part(new TorusGeometry(hr * 0.2, hr * 0.035, 5, 16), c, {
          matrix: along(add(e, scale(a.facing, hr * 0.2)), a.facing, FORWARD),
        }),
      );
    }
    rodBetween(
      P,
      c,
      add(l, scale(a.facing, hr * 0.2)),
      add(r, scale(a.facing, hr * 0.2)),
      hr * 0.03,
      hr * 0.4,
    );
  },
  star: (P, a, c) => {
    const hr = a.head.radius;
    const [l, r] = a.eyes;
    for (const e of [l, r]) {
      const g = new ExtrudeGeometry(star(hr * 0.24), { depth: hr * 0.05, bevelEnabled: false });
      P.push(part(g, c, { matrix: along(add(e, scale(a.facing, hr * 0.2)), a.facing, FORWARD) }));
    }
    rodBetween(
      P,
      darken(c, 0.2),
      add(l, scale(a.facing, hr * 0.2)),
      add(r, scale(a.facing, hr * 0.2)),
      hr * 0.03,
      hr * 0.4,
    );
  },
  bandana: (P, a, c, c2) => {
    const n = neck(a);
    const hr = a.head.radius;
    const [, by, bz] = a.body.center;
    const [, ry, rz] = a.body.radii;
    // Tied around the neck, with a triangle of cloth hanging on the chest (in front of the body,
    // tipped back a little so it shows from above), with polka dots.
    const wrap = new TorusGeometry(n.r * 0.98, n.r * 0.12, 5, 16);
    wrap.rotateX(Math.PI / 2);
    P.push(part(wrap, c, { x: n.at[0], y: n.at[1], z: n.at[2] }));
    const top = Math.min(n.at[1], by + ry * 0.75);
    const front = Math.max(n.at[2] + n.r, bz + rz * 0.92) + 0.01;
    const w = hr * 0.95;
    const h = hr * 0.75;
    const tri = new Shape();
    tri.moveTo(-w / 2, 0);
    tri.lineTo(w / 2, 0);
    tri.lineTo(0, -h);
    tri.closePath();
    const place = (g: BufferGeometry, color: string) =>
      P.push(part(g, color, { x: n.at[0], y: top, z: front, rx: -0.45 }));
    place(new ExtrudeGeometry(tri, { depth: 0.012, bevelEnabled: false }), c);
    for (const [dx, dy] of [
      [-0.2, -0.18],
      [0.2, -0.18],
      [0, -0.5],
    ] as const) {
      const dot = new SphereGeometry(hr * 0.06, 6, 5);
      dot.scale(1, 1, 0.4);
      dot.translate(dx * w, dy * h, 0.015);
      place(dot, c2);
    }
  },
};

function scale(v: readonly [number, number, number], k: number): V3 {
  return [v[0] * k, v[1] * k, v[2] * k];
}

/** The glasses' bridge: a short rod between the two lenses' inner edges. */
function rodBetween(P: Parts, color: string, a: V3, b: V3, radius: number, lensGap: number) {
  const va = new Vector3(...a);
  const vb = new Vector3(...b);
  const mid = va.clone().add(vb).multiplyScalar(0.5);
  const len = Math.max(0.001, va.distanceTo(vb) - lensGap);
  const g = new CylinderGeometry(radius, radius, len, 6);
  const dir = vb.sub(va);
  P.push(part(g, color, { matrix: along([mid.x, mid.y, mid.z], [dir.x, dir.y, dir.z]) }));
  // Arms back to the ears.
  for (const e of [a, b]) {
    const side = Math.sign(e[0]) || 1;
    const arm = new CylinderGeometry(radius * 0.8, radius * 0.8, lensGap * 0.9, 5);
    P.push(
      part(arm, color, {
        matrix: along([e[0] + side * lensGap * 0.5, e[1], e[2] - lensGap * 0.3], [0, 0, 1]),
      }),
    );
  }
}

const cache = new Map<string, Mesh>();

/** The worn outfits as one mesh (plus outline), or null when wearing nothing. */
export function outfitMesh(
  lookKey: string,
  anchors: AnimalAnchors,
  outfit: Animal['outfit'],
): Mesh | null {
  const ids = [outfit.head, outfit.body, outfit.face].filter((id): id is string => !!id);
  if (ids.length === 0) return null;
  const key = `${lookKey}|${ids.join(',')}`;
  const hit = cache.get(key);
  if (hit) return hit.clone();
  const P: Parts = [];
  for (const id of ids) {
    const def = getItem(id);
    if (!def || def.category !== 'petOutfit') continue;
    const d = def as PetOutfitItemDef;
    BUILD[d.kind]?.(P, anchors, d.color, d.color2 ?? lighten(d.color, 0.5));
  }
  if (P.length === 0) return null;
  const m = animalMaterials();
  const geometry = merge(P);
  const mesh = new Mesh(geometry, m.body);
  mesh.receiveShadow = true;
  const hull = new Mesh(outlineGeometry(geometry), m.outline);
  hull.raycast = () => {};
  mesh.add(hull);
  mesh.raycast = () => {};
  mesh.name = 'outfit';
  cache.set(key, mesh);
  return mesh.clone();
}

/** Every outfit kind that has a 3D recipe (for tests). */
export const OUTFIT_KINDS = Object.keys(BUILD);
