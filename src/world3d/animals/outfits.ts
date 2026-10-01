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
 * Pet outfits in 3D (DESIGN 10.3), fitted to each animal's own shape (its model's anchors),
 * like the original's fitted outfits:
 *
 * - On the head: a party hat, a bow, a flower clip, a crown, sitting on the head's surface.
 * - On the body: a knitted sweater (a shell over the body from the neckline to a hem), a cape
 *   hanging down the back, a tutu flaring from the waist, a scarf around the neckline.
 * - On the face: glasses and star shades right on the eyes, a bandana at the neckline.
 *
 * Chibi heads sit down into their bodies, so "the neck" is a ring wrapping where the head meets
 * the body (the model works it out per species; ponies have a real neck). One merged mesh per
 * animal look and outfit, sharing the animals' materials (so it fades with them).
 */

type V3 = [number, number, number];
type Parts = BufferGeometry[];
const UP = new Vector3(0, 1, 0);
const FORWARD = new Vector3(0, 0, 1);

/** A transform that turns `from` to `dir`, then moves to `at`. */
function along(at: V3, dir: readonly number[], from = UP): Matrix4 {
  const q = new Quaternion().setFromUnitVectors(
    from,
    new Vector3(dir[0], dir[1], dir[2]).normalize(),
  );
  return new Matrix4().compose(new Vector3(...at), q, new Vector3(1, 1, 1));
}

const add = (a: readonly number[], b: readonly number[]): V3 => [
  a[0]! + b[0]!,
  a[1]! + b[1]!,
  a[2]! + b[2]!,
];
const scale = (v: readonly number[], k: number): V3 => [v[0]! * k, v[1]! * k, v[2]! * k];

/** A point on the head's surface at `deg` from the top toward the side (+ = right). */
function onHead(a: AnimalAnchors, deg: number, forward = 0.15, out = 0): V3 {
  const [hx, hy, hz] = a.head.center;
  const [rx, ry, rz] = a.head.radii;
  const t = (deg * Math.PI) / 180;
  const n = new Vector3(Math.sin(t), Math.cos(t), forward).normalize();
  return [hx + n.x * (rx + out), hy + n.y * (ry + out), hz + n.z * (rz + out)];
}

/** An oval ring (in the XZ plane) around the neckline or waist, tipped to `up`. */
function ring(
  P: Parts,
  color: string,
  center: V3,
  rx: number,
  rz: number,
  tube: number,
  up: readonly number[] = [0, 1, 0],
) {
  // A unit torus squashed to the oval, keeping the tube round-ish (tube is in units).
  const g = new TorusGeometry(1, tube / Math.max(rx, rz), 6, 20);
  g.rotateX(Math.PI / 2);
  g.scale(rx, Math.max(rx, rz), rz);
  P.push(part(g, color, { matrix: along(center, up) }));
}

function star(r: number): Shape {
  const s = new Shape();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.45 : r;
    const ang = (i / 10) * Math.PI * 2 + Math.PI / 2;
    if (i === 0) s.moveTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
    else s.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
  }
  s.closePath();
  return s;
}

/** The polar angle on the body's (scaled) shell at height y (0 = top). */
function thetaAt(a: AnimalAnchors, y: number, k: number): number {
  const by = a.body.center[1];
  const ry = a.body.radii[1] * k;
  return Math.acos(Math.min(1, Math.max(-1, (y - by) / ry)));
}

/** A band of the body's shell between two polar angles (sweaters, capes), just outside it. */
function shell(
  P: Parts,
  a: AnimalAnchors,
  color: string,
  t0: number,
  t1: number,
  k: number,
  phi: [number, number] = [0, Math.PI * 2],
) {
  const [bx, by, bz] = a.body.center;
  const [rx, ry, rz] = a.body.radii;
  const rows = Math.max(2, Math.round((t1 - t0) * 8));
  const g = new SphereGeometry(1, 18, rows, phi[0], phi[1], t0, t1 - t0);
  P.push(part(g, color, { x: bx, y: by, z: bz, s: [rx * k, ry * k, rz * k] }));
}

const BUILD: Record<string, (P: Parts, a: AnimalAnchors, c: string, c2: string) => void> = {
  // ---- Head ----
  party: (P, a, c, c2) => {
    const hr = a.head.radius;
    const base = onHead(a, 12, 0.1, -hr * 0.05);
    const tilt = [0.22, 1, 0.05];
    const h = hr * 1.0;
    const cone = new ConeGeometry(hr * 0.38, h, 14);
    cone.translate(0, h / 2, 0);
    P.push(part(cone, c, { matrix: along(base, tilt) }));
    for (const t of [0.22, 0.5]) {
      const r0 = hr * 0.385 * (1 - t);
      const band = new CylinderGeometry(r0 - hr * 0.038, r0, h * 0.1, 14, 1, true);
      band.translate(0, h * (t + 0.05), 0);
      P.push(part(band, c2, { matrix: along(base, tilt) }));
    }
    const d = new Vector3(tilt[0], tilt[1], tilt[2]).normalize();
    P.push(
      part(new SphereGeometry(hr * 0.14, 10, 8), c2, {
        x: base[0] + d.x * h,
        y: base[1] + d.y * h,
        z: base[2] + d.z * h,
      }),
    );
  },
  bow: (P, a, c) => {
    const hr = a.head.radius;
    // Standing up on the side of the head, facing forward.
    const at = onHead(a, 40, 0.35, hr * 0.06);
    for (const side of [-1, 1]) {
      P.push(
        part(new SphereGeometry(1, 10, 7), c, {
          x: at[0] + side * hr * 0.22,
          y: at[1] + hr * 0.02,
          z: at[2],
          s: [hr * 0.24, hr * 0.17, hr * 0.09],
          rz: side * 0.35,
        }),
      );
    }
    P.push(
      part(new SphereGeometry(hr * 0.1, 8, 6), darken(c, 0.15), {
        x: at[0],
        y: at[1],
        z: at[2] + hr * 0.03,
      }),
    );
  },
  flower: (P, a, c, c2) => {
    const hr = a.head.radius;
    const at = onHead(a, -40, 0.35, hr * 0.06);
    const [hx, hy, hz] = a.head.center;
    const out = new Vector3(at[0] - hx, at[1] - hy, at[2] - hz)
      .normalize()
      .add(new Vector3(0, 0, 0.8))
      .normalize();
    const dir = [out.x, out.y, out.z];
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2;
      const g = new SphereGeometry(1, 8, 6);
      g.scale(hr * 0.13, hr * 0.13, hr * 0.05);
      g.translate(Math.cos(ang) * hr * 0.15, Math.sin(ang) * hr * 0.15, 0);
      P.push(part(g, c2, { matrix: along(at, dir, FORWARD) }));
    }
    const mid = new SphereGeometry(hr * 0.09, 8, 6);
    mid.translate(0, 0, hr * 0.04);
    P.push(part(mid, c, { matrix: along(at, dir, FORWARD) }));
  },
  crown: (P, a, c) => {
    const hr = a.head.radius;
    const [hx, hy, hz] = a.head.center;
    const [rx, ry, rz] = a.head.radii;
    // A band sitting down on the head (just outside its surface), with points and gems.
    const y = hy + ry * 0.72;
    const s = Math.sqrt(1 - 0.72 * 0.72);
    const bx = rx * s * 1.06;
    const bz = rz * s * 1.06;
    const h = hr * 0.3;
    const band = new CylinderGeometry(1, 1, h, 20, 1, true);
    band.scale(bx, 1, bz);
    P.push(part(band, c, { x: hx, y: y + h / 2, z: hz }));
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2 + Math.PI / 2;
      const x = hx + Math.cos(ang) * bx;
      const z = hz + Math.sin(ang) * bz;
      P.push(part(new ConeGeometry(hr * 0.1, hr * 0.24, 6), c, { x, y: y + h + hr * 0.11, z }));
      P.push(
        part(new SphereGeometry(hr * 0.05, 8, 6), i % 2 ? '#ff6f9a' : '#6fa8ef', {
          x: hx + Math.cos(ang) * bx * 1.04,
          y: y + h * 0.5,
          z: hz + Math.sin(ang) * bz * 1.04,
        }),
      );
    }
  },

  // ---- Body ----
  sweater: (P, a, c, c2) => {
    // Knitted over the body from the neckline down to a hem: two flat stripes, a ribbed hem,
    // and a ribbed collar at the neckline.
    const k = 1.07;
    const t0 = thetaAt(a, a.neck.center[1], k);
    const t1 = Math.PI * 0.68;
    const span = t1 - t0;
    const band = (from: number, to: number, color: string, kk = k) =>
      shell(P, a, color, t0 + span * from, t0 + span * to, kk);
    band(0, 0.38, c);
    band(0.38, 0.46, c2, k + 0.004);
    band(0.46, 0.62, c);
    band(0.62, 0.7, c2, k + 0.004);
    band(0.7, 0.9, c);
    band(0.9, 1, darken(c, 0.12), k + 0.01);
    const n = a.neck;
    // A rolled turtleneck collar under the chin.
    ring(P, darken(c, 0.08), n.center, n.rx, n.rz, 0.055, n.up);
  },
  cape: (P, a, c, c2) => {
    const n = a.neck;
    if (a.longBody) {
      // Long bodies and ponies: draped over the back like a blanket, with a darker hem.
      shell(P, a, c, 0, Math.PI * 0.42, 1.1);
      shell(P, a, darken(c, 0.2), Math.PI * 0.42, Math.PI * 0.47, 1.115);
      ring(P, c, n.center, n.rx, n.rz, 0.035, n.up);
      return;
    }

    // A cloak hanging from the neckline down to the ground behind, flaring out, with a darker
    // lining (seen at its edges), a collar, and a gold clasp in front.
    const [, , bz] = a.body.center;
    const [rx, , rz] = a.body.radii;
    const y0 = n.center[1];
    const y1 = 0.03;
    const h = y0 - y1;
    const top = Math.max(n.rx, n.rz) * 1.04;
    const bottom = Math.min(Math.max(rx, rz) * 1.32, top * 1.5);
    const depth = rz / rx;
    // Around the back and a little way round the sides (cylinder angle 0 faces +z).
    const cloak = (k: number) => {
      const g = new CylinderGeometry(
        top * k,
        bottom * k,
        h,
        22,
        2,
        true,
        Math.PI * 0.38,
        Math.PI * 1.24,
      );
      g.scale(1, 1, depth);
      return g;
    };
    const at = { x: n.center[0], y: y1 + h / 2, z: (bz + n.center[2]) / 2 - 0.02 };
    P.push(part(cloak(1), c, at));
    P.push(inside(part(cloak(0.97), darken(c, 0.25), at)));
    ring(P, c, n.center, n.rx, n.rz, 0.04, n.up);
    P.push(
      part(new SphereGeometry(a.head.radius * 0.11, 10, 8), c2, {
        x: n.center[0],
        y: n.center[1],
        z: n.center[2] + n.rz + 0.01,
      }),
    );
  },
  tutu: (P, a, c) => {
    // Two ruffled layers flaring out from the waist.
    const w = a.waist;
    const ry = a.body.radii[1];
    for (const [k, color, drop] of [
      [1, c, 0],
      [0.75, lighten(c, 0.35), ry * 0.12],
    ] as const) {
      const h = ry * 0.42 * k;
      const skirt = new CylinderGeometry(1.03, 1.42 + 0.1 * k, h, 22, 1, true);
      skirt.scale(w.rx, 1, w.rz);
      P.push(part(skirt, color, { x: w.center[0], y: w.center[1] - h / 2 - drop, z: w.center[2] }));
    }
    ring(P, lighten(c, 0.2), w.center, w.rx * 1.04, w.rz * 1.04, 0.03);
  },
  scarf: (P, a, c, c2) => {
    // Wrapped around the neckline, with a stripe and an end hanging down the front.
    const n = a.neck;
    const hr = a.head.radius;
    const t = hr * 0.14;
    ring(P, c, n.center, n.rx + t * 0.4, n.rz + t * 0.4, t, n.up);
    ring(P, c2, add(n.center, scale(n.up, t * 0.6)), n.rx + t * 0.3, n.rz + t * 0.3, t * 0.4, n.up);
    const end: V3 = [n.center[0] + n.rx * 0.35, n.center[1] - hr * 0.3, n.center[2] + n.rz + t];
    P.push(
      part(new RoundedBoxGeometry(hr * 0.24, hr * 0.55, hr * 0.08, 2, hr * 0.03), c, {
        x: end[0],
        y: end[1],
        z: end[2],
        rz: 0.12,
        rx: -0.3,
      }),
    );
    P.push(
      part(new RoundedBoxGeometry(hr * 0.25, hr * 0.06, hr * 0.09, 1, hr * 0.02), c2, {
        x: end[0] - hr * 0.02,
        y: end[1] - hr * 0.2,
        z: end[2] + hr * 0.06,
        rz: 0.12,
        rx: -0.3,
      }),
    );
  },

  // ---- Face ----
  glasses: (P, a, c) => {
    const r = a.eyeRadius * 1.25;
    const [l, rt] = a.eyes;
    for (const e of [l, rt]) {
      const lens = new TorusGeometry(r, r * 0.16, 6, 20);
      P.push(part(lens, c, { matrix: along(add(e, scale(a.facing, 0.008)), a.facing, FORWARD) }));
    }
    bridge(P, c, l, rt, a.facing, r);
  },
  star: (P, a, c) => {
    const r = a.eyeRadius * 1.45;
    const [l, rt] = a.eyes;
    for (const e of [l, rt]) {
      const g = new ExtrudeGeometry(star(r), { depth: 0.015, bevelEnabled: false });
      P.push(part(g, c, { matrix: along(add(e, scale(a.facing, 0.004)), a.facing, FORWARD) }));
    }
    bridge(P, darken(c, 0.2), l, rt, a.facing, r * 0.75);
  },
  bandana: (P, a, c, c2) => {
    // Tied around the neckline, with a triangle of polka-dot cloth on the chest.
    const n = a.neck;
    const hr = a.head.radius;
    ring(P, c, n.center, n.rx + 0.01, n.rz + 0.01, 0.03, n.up);
    const front: V3 = [n.center[0], n.center[1] - 0.01, n.center[2] + n.rz + 0.025];
    const w = Math.min(n.rx * 1.1, hr * 0.9);
    const h = w * 0.75;
    const tri = new Shape();
    tri.moveTo(-w / 2, 0);
    tri.lineTo(w / 2, 0);
    tri.lineTo(0, -h);
    tri.closePath();
    // Hanging down the chest (only tipped back a little), so it shows below the chin.
    const lay = { x: front[0], y: front[1], z: front[2], rx: -0.2 };
    P.push(part(new ExtrudeGeometry(tri, { depth: 0.015, bevelEnabled: false }), c, lay));
    for (const [dx, dy] of [
      [-0.18, -0.18],
      [0.18, -0.18],
      [0, -0.48],
    ] as const) {
      const dot = new SphereGeometry(hr * 0.055, 6, 5);
      dot.scale(1, 1, 0.4);
      dot.translate(dx * w, dy * h, 0.02);
      P.push(part(dot, c2, lay));
    }
  },
};

/** A surface turned inside out (faces and normals flipped), for linings seen from inside. */
function inside(g: BufferGeometry): BufferGeometry {
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  for (let i = 0; i < pos.count; i += 3) {
    // Swap the 2nd and 3rd corner of each triangle.
    for (const attr of [pos, nor, g.getAttribute('color')]) {
      if (!attr) continue;
      const tmp = [attr.getX(i + 1), attr.getY(i + 1), attr.getZ(i + 1)];
      attr.setXYZ(i + 1, attr.getX(i + 2), attr.getY(i + 2), attr.getZ(i + 2));
      attr.setXYZ(i + 2, tmp[0]!, tmp[1]!, tmp[2]!);
    }
  }
  for (let i = 0; i < nor.count; i++) nor.setXYZ(i, -nor.getX(i), -nor.getY(i), -nor.getZ(i));
  return g;
}

/** The bridge between two lenses (just the gap between their inner edges). */
function bridge(
  P: Parts,
  color: string,
  l: readonly number[],
  r: readonly number[],
  facing: readonly number[],
  lens: number,
) {
  const a = new Vector3(l[0], l[1], l[2]);
  const b = new Vector3(r[0], r[1], r[2]);
  const mid = a
    .clone()
    .add(b)
    .multiplyScalar(0.5)
    .addScaledVector(new Vector3(facing[0], facing[1], facing[2]), 0.008);
  const len = Math.max(0.01, a.distanceTo(b) - lens * 2);
  const dir = b.sub(a);
  const g = new CylinderGeometry(lens * 0.13, lens * 0.13, len, 6);
  P.push(part(g, color, { matrix: along([mid.x, mid.y, mid.z], [dir.x, dir.y, dir.z]) }));
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
