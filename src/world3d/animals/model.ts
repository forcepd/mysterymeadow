import {
  CatmullRomCurve3,
  ConeGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Matrix4,
  Quaternion,
  Shape,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
  type BufferGeometry,
} from 'three';
import { paintFor } from '../../art/animalSvg';
import { darken, lighten, mix } from '../../art/svg';
import {
  getSpecies,
  type ExtraKind,
  type PatternKind,
  type SpeciesArt,
} from '../../config/species';
import { merge, outlineGeometry, part, seededRandom } from '../art/toon';

/**
 * Parametric 3D animals (DESIGN-3D "Art"; DESIGN 16.2 in 3D). Every species is built from shared
 * 3D parts picked by its `art` recipe in config/species.ts (body shape, ears, tail, nose, eyes,
 * markings, extras) and colored from its variant's color slots, like the original's SVG parts.
 * Chunky, front-facing, chibi proportions; the model faces +z with its feet on y = 0.
 *
 * Each look is merged into one mesh (plus an outline hull) and cached, so every animal with the
 * same species, color and Sparkle shares its geometry.
 */

/** Sprite px (the original's art space) to ground units. */
const S = 0.01;
const EYE = '#2e2420';
const BLUSH = '#ffa3c0';
const SILHOUETTE = '#4b4560';
const HIGHLIGHT = '#ffffff';

type Paint = ReturnType<typeof paintFor>;
type V3 = [number, number, number];

export interface AnimalModel {
  geometry: BufferGeometry;
  /** The outline hull's geometry. */
  outline: BufferGeometry;
  /** Top of the model (ears and horns included). */
  height: number;
  /** Roughly how far it reaches from its center on the ground (for tap volumes and shadows). */
  radius: number;
  /** Where things are on this animal (symptoms, and outfits later), in model space. */
  anchors: AnimalAnchors;
}

export interface AnimalAnchors {
  /** The head's center, its size, and its own radii (wide heads are wider). */
  head: { center: V3; radius: number; radii: V3 };
  body: { center: V3; radii: V3 };
  /** Left and right eye: the front of each eye (where glasses sit). */
  eyes: [V3, V3];
  /** How big an eye is (for fitting glasses). */
  eyeRadius: number;
  /**
   * The neckline: a ring around where the head meets the body (for scarves, bandanas and
   * collars). Chibi heads sit down into the body, so it wraps both. Ponies have a real neck.
   */
  neck: { center: V3; rx: number; rz: number; up: V3 };
  /** The waist: a ring around the body a little below its middle (for tutus). */
  waist: { center: V3; rx: number; rz: number };
  /** Long and pony bodies stretch out behind the head (capes drape over their backs). */
  longBody: boolean;
  nose: V3;
  /** Left and right cheek. */
  cheeks: [V3, V3];
  /** The front-right paw, on the ground. */
  paw: V3;
  /** Which way the face looks (unit vector). */
  facing: V3;
}

// ---- Placing parts ------------------------------------------------------------------------------

const UP = new Vector3(0, 1, 0);
const FORWARD = new Vector3(0, 0, 1);

/** A transform that moves `from` (unit) onto `dir`, then to `at`. */
function aligned(at: V3, dir: V3, from = UP): Matrix4 {
  const d = new Vector3(...dir).normalize();
  const q = new Quaternion().setFromUnitVectors(from, d);
  return new Matrix4().compose(new Vector3(...at), q, new Vector3(1, 1, 1));
}

class Parts {
  readonly list: BufferGeometry[] = [];

  /** An ellipsoid (radii r) at c, optionally turned. */
  ball(
    color: string,
    c: V3,
    r: V3,
    { seg = [12, 9] as [number, number], rx = 0, ry = 0, rz = 0 } = {},
  ): void {
    this.list.push(
      part(new SphereGeometry(1, seg[0], seg[1]), color, {
        s: r,
        x: c[0],
        y: c[1],
        z: c[2],
        rx,
        ry,
        rz,
      }),
    );
  }

  /** A flattened ellipsoid lying on a surface: its thin axis (r[2]) along `normal`. */
  patch(color: string, at: V3, normal: V3, r: V3, seg: [number, number] = [10, 7]): void {
    this.list.push(
      part(new SphereGeometry(1, seg[0], seg[1]), color, {
        s: r,
        matrix: aligned(at, normal, FORWARD),
      }),
    );
  }

  /** A cone standing on `base`, pointing along `dir`. */
  cone(color: string, base: V3, dir: V3, radius: number, height: number, seg = 10): void {
    const g = new ConeGeometry(radius, height, seg);
    g.translate(0, height / 2, 0);
    this.list.push(part(g, color, { matrix: aligned(base, dir) }));
  }

  /** A rod from `a` to `b`. */
  rod(color: string, a: V3, b: V3, radius: number, seg = 8): void {
    const va = new Vector3(...a);
    const vb = new Vector3(...b);
    const length = va.distanceTo(vb);
    const g = new CylinderGeometry(radius, radius, length, seg);
    g.translate(0, length / 2, 0);
    const dir = vb.sub(va);
    this.list.push(part(g, color, { matrix: aligned(a, [dir.x, dir.y, dir.z]) }));
  }

  /** A smooth tube through points. */
  tube(color: string, points: V3[], radius: number): void {
    const curve = new CatmullRomCurve3(points.map((p) => new Vector3(...p)));
    this.list.push(part(new TubeGeometry(curve, 16, radius, 7, false), color));
    // Round ends.
    const end = (p: V3) => this.ball(color, p, [radius, radius, radius], { seg: [7, 5] });
    end(points[0]!);
    end(points[points.length - 1]!);
  }

  /** A torus arc (smiles, curly tails, moon marks) facing `normal`. */
  arc(color: string, at: V3, normal: V3, radius: number, tube: number, arc: number, spin: number) {
    const g = new TorusGeometry(radius, tube, 6, 16, arc);
    g.rotateZ(spin);
    this.list.push(part(g, color, { matrix: aligned(at, normal, FORWARD) }));
  }
}

// ---- The animal's frame -------------------------------------------------------------------------

interface Frame {
  art: SpeciesArt;
  body: { c: V3; r: V3 };
  head: { c: V3; r: V3 };
  /** Head radius (for sizing face parts). */
  hr: number;
  patterns: Set<PatternKind>;
  has: (e: ExtraKind) => boolean;
  /** Overall size relative to a standard 72-wide body (for tails and feet). */
  k: number;
}

function frameFor(art: SpeciesArt, patterns: readonly PatternKind[]): Frame {
  const bw = art.body.w * S;
  const bh = art.body.h * S;
  const shape = art.body.shape;
  const lift = shape === 'pony' ? 0.2 : shape === 'bird' ? 0.035 : 0.025;
  const r: Record<typeof shape, V3> = {
    round: [bw * 0.5, bh * 0.52, bw * 0.43],
    long: [bw * 0.37, bh * 0.52, bw * 0.56],
    bird: [bw * 0.48, bh * 0.54, bw * 0.43],
    tall: [bw * 0.48, bh * 0.52, bw * 0.42],
    pony: [bw * 0.31, bh * 0.56, bw * 0.52],
  };
  const br = r[shape];
  const bodyC: V3 = [0, lift + br[1], 0];
  // Heads a touch bigger than the original's, for a chunky chibi look in 3D.
  const hr = art.head.r * S * 1.08;
  const hw = art.head.wide ?? 1;
  // The original's head height (sprite y, feet at +24), pushed up a little so the face clears
  // a round body seen from the 3/4 camera.
  let hy = (24 - art.head.y) * S + 0.03;
  let hz = br[2] * 0.3;
  if (shape === 'long') hz = br[2] * 0.62;
  if (shape === 'tall') hz = br[2] * 0.15;
  if (shape === 'pony') {
    hy = bodyC[1] + br[1] + hr * 0.75;
    hz = br[2] * 0.85;
  }
  const has = (e: ExtraKind) => art.extras.includes(e);
  return {
    art,
    body: { c: bodyC, r: br },
    head: { c: [0, hy, hz], r: [hr * hw, hr * 0.96, hr * 0.92] },
    hr,
    patterns: new Set(patterns),
    has,
    k: bw / 0.72,
  };
}

/**
 * Faces tilt up a little, as if looking up at the player: the camera looks down on the yard, so
 * an upright face would be squashed from above.
 */
const FACE_TILT = 0.32;
const tilt = new Matrix4().makeRotationX(-FACE_TILT);

/** A point on the face (u, v in -1..1 across the head's front), lifted off by `lift`. */
function face(f: Frame, u: number, v: number, lift = 0): { at: V3; n: V3 } {
  const [a, b, c] = f.head.r;
  const w = Math.sqrt(Math.max(0, 1 - u * u - v * v));
  const local = new Vector3(u * a, v * b, w * c);
  const n = new Vector3(local.x / (a * a), local.y / (b * b), local.z / (c * c)).normalize();
  local.applyMatrix4(tilt);
  n.applyMatrix4(tilt);
  const at = local.add(new Vector3(...f.head.c)).addScaledVector(n, lift);
  return { at: [at.x, at.y, at.z], n: [n.x, n.y, n.z] };
}

/** A point on the body surface in a direction from its center. */
function onBody(f: Frame, dir: Vector3): { at: V3; n: V3 } {
  const [a, b, c] = f.body.r;
  const d = dir.clone().normalize();
  const t = 1 / Math.sqrt((d.x / a) ** 2 + (d.y / b) ** 2 + (d.z / c) ** 2);
  const local = d.multiplyScalar(t);
  const n = new Vector3(local.x / (a * a), local.y / (b * b), local.z / (c * c)).normalize();
  const at = local.add(new Vector3(...f.body.c));
  return { at: [at.x, at.y, at.z], n: [n.x, n.y, n.z] };
}

/** Evenly spread directions over a sphere (Fibonacci), filtered. */
function spread(count: number, keep: (d: Vector3) => boolean): Vector3[] {
  const out: Vector3[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const d = new Vector3(Math.cos(i * golden) * r, y, Math.sin(i * golden) * r);
    if (keep(d)) out.push(d);
  }
  return out;
}

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/** A shade of a color, except for silhouettes (one flat color). */
function tone(p: Paint, color: string, change: (c: string) => string): string {
  return p.details ? change(color) : color;
}

// ---- Body ---------------------------------------------------------------------------------------

function body(P: Parts, f: Frame, p: Paint): void {
  const { c, r } = f.body;
  const shape = f.art.body.shape;
  if (shape === 'bird') {
    // An egg: narrower toward the top.
    const g = new SphereGeometry(1, 14, 10);
    const pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const taper = 1 - 0.16 * Math.max(0, y);
      pos.setXYZ(i, pos.getX(i) * taper, y, pos.getZ(i) * taper);
    }
    g.computeVertexNormals();
    P.list.push(part(g, p.main, { s: r, x: c[0], y: c[1], z: c[2] }));
  } else {
    P.ball(p.main, c, r, { seg: [14, 10] });
  }

  // Feet and legs.
  // Paws a shade darker than the body (a silhouette stays one flat color).
  const foot = !p.details ? p.main : f.patterns.has('socks') ? p.dark : darken(p.main, 0.06);
  if (shape === 'pony') {
    const hoof = p.dark;
    for (const x of [-1, 1]) {
      for (const z of [-1, 1]) {
        const at: V3 = [x * r[0] * 0.55, 0, c[2] + z * r[2] * 0.55];
        P.rod(foot, add(at, [0, 0.05, 0]), add(at, [0, c[1] - r[1] * 0.3, 0]), 0.055);
        P.ball(hoof, add(at, [0, 0.035, 0]), [0.065, 0.04, 0.065], { seg: [8, 5] });
      }
    }
  } else if (f.has('webbedFeet')) {
    for (const x of [-1, 1]) {
      P.ball(
        p.accent,
        [x * r[0] * 0.38, 0.02, c[2] + r[2] * 0.72],
        [0.075 * f.k, 0.025, 0.1 * f.k],
        {
          seg: [8, 5],
        },
      );
    }
  } else if (shape === 'bird') {
    for (const x of [-1, 1]) {
      P.ball(p.accent, [x * r[0] * 0.32, 0.02, c[2] + r[2] * 0.62], [0.05, 0.022, 0.07], {
        seg: [8, 5],
      });
    }
  } else {
    // Four little paws peeking out under the body.
    const front = shape === 'long' ? 0.72 : 0.62;
    for (const x of [-1, 1]) {
      P.ball(foot, [x * r[0] * 0.48, 0.045, c[2] + r[2] * front], [0.085 * f.k, 0.055, 0.1 * f.k], {
        seg: [9, 6],
      });
      P.ball(foot, [x * r[0] * 0.52, 0.045, c[2] - r[2] * 0.5], [0.08 * f.k, 0.05, 0.09 * f.k], {
        seg: [8, 5],
      });
    }
  }

  // A pony's neck up to its head.
  if (shape === 'pony') {
    const top: V3 = [0, c[1] + r[1] * 0.5, c[2] + r[2] * 0.62];
    P.rod(p.main, top, add(f.head.c, [0, -f.hr * 0.4, -f.hr * 0.2]), f.hr * 0.45, 10);
  }
}

// ---- Markings -----------------------------------------------------------------------------------

function markings(P: Parts, f: Frame, p: Paint, seed: number): void {
  const { c, r } = f.body;
  const pat = f.patterns;
  const rand = seededRandom(seed);
  if (pat.has('belly') || pat.has('tuxedo')) {
    const big = pat.has('tuxedo');
    const s = big ? 0.8 : 0.66;
    P.ball(
      p.light,
      [0, c[1] - r[1] * (big ? 0.02 : 0.12), c[2] + r[2] * (1.05 - s)],
      [r[0] * s, r[1] * (big ? 0.9 : 0.7), r[2] * s],
      { seg: [12, 9] },
    );
  }
  if (pat.has('tuxedo')) {
    // A white face under the eyes, like a penguin's.
    const { at, n } = face(f, 0, -0.2, -f.hr * 0.3);
    P.patch(p.light, at, n, [f.hr * 0.72, f.hr * 0.55, f.hr * 0.42]);
  }
  if (pat.has('bands')) {
    for (let i = 0; i < 3; i++) {
      const { at, n } = onBody(f, new Vector3(0, -0.35 + i * 0.28, 1));
      P.patch(darken(p.light, 0.18), at, n, [r[0] * 0.42, 0.014, 0.02], [10, 4]);
    }
  }
  if (pat.has('spots') || pat.has('patches')) {
    const big = pat.has('patches');
    const count = big ? 4 : 7;
    const dirs = spread(40, (d) => d.y > -0.35 && (big || d.z < 0.7));
    for (let i = 0; i < count; i++) {
      const d = dirs[Math.floor(rand() * dirs.length)]!;
      const { at, n } = onBody(f, d);
      const s = (big ? 0.34 : 0.16) * (0.8 + rand() * 0.4);
      P.patch(p.dark, at, n, [r[0] * s, r[1] * s * 0.85, 0.02]);
    }
    // One on the head too.
    const { at, n } = face(f, big ? 0.45 : -0.4, big ? 0.55 : 0.5);
    P.patch(p.dark, at, n, [f.hr * (big ? 0.35 : 0.18), f.hr * (big ? 0.3 : 0.15), 0.02]);
  }
  if (pat.has('stripes')) {
    // Tabby stripes over the back.
    for (let i = 0; i < 4; i++) {
      const a = -0.9 + i * 0.5;
      const { at, n } = onBody(f, new Vector3(0, Math.cos(a), -Math.sin(a) - 0.3));
      P.patch(p.dark, at, n, [r[0] * 0.55, 0.025, 0.02], [10, 4]);
    }
  }
  if (pat.has('muzzle') && f.art.nose !== 'snout') {
    const { at, n } = face(f, 0, -0.38, -f.hr * 0.12);
    P.patch(p.light, at, n, [f.head.r[0] * 0.42, f.hr * 0.3, f.hr * 0.28]);
  }
  if (pat.has('mask')) {
    const { at, n } = face(f, 0, 0.12, -f.hr * 0.22);
    P.patch(p.dark, at, n, [f.head.r[0] * 0.86, f.hr * 0.27, f.hr * 0.33]);
  }
  if (pat.has('faceDisc')) {
    const { at, n } = face(f, 0, 0.02, -f.hr * 0.32);
    P.patch(p.light, at, n, [f.head.r[0] * 0.84, f.hr * 0.66, f.hr * 0.42]);
  }
  if (pat.has('cheekMarks')) {
    for (const u of [-1, 1]) {
      const cheek = face(f, u * 0.56, -0.12, -0.01);
      P.patch(p.light, cheek.at, cheek.n, [f.hr * 0.24, f.hr * 0.18, 0.03]);
      const brow = face(f, u * 0.36, 0.44, -0.005);
      P.patch(p.light, brow.at, brow.n, [f.hr * 0.12, f.hr * 0.07, 0.02]);
    }
  }
}

// ---- Head and face ------------------------------------------------------------------------------

function head(P: Parts, f: Frame, p: Paint): void {
  P.ball(p.main, f.head.c, f.head.r, { seg: [14, 10] });
}

function eyes(P: Parts, f: Frame): void {
  const hr = f.hr;
  if (f.art.eyes === 'owl') {
    for (const u of [-1, 1]) {
      const { at, n } = face(f, u * 0.4, 0.14, 0.005);
      P.patch('#f5b93a', at, n, [hr * 0.34, hr * 0.34, 0.03]);
      const white = face(f, u * 0.4, 0.14, 0.02);
      P.patch('#ffffff', white.at, white.n, [hr * 0.27, hr * 0.27, 0.03]);
      const pupil = face(f, u * 0.4, 0.12, 0.04);
      P.patch(EYE, pupil.at, pupil.n, [hr * 0.15, hr * 0.16, 0.03]);
      const shine = face(f, u * 0.4 + 0.06, 0.2, 0.055);
      P.patch(HIGHLIGHT, shine.at, shine.n, [hr * 0.05, hr * 0.05, 0.015], [6, 4]);
    }
    return;
  }
  for (const u of [-1, 1]) {
    const { at, n } = face(f, u * 0.36, 0.1, 0.006);
    P.patch(EYE, at, n, [hr * 0.15, hr * 0.19, 0.035]);
    const shine = face(f, u * 0.36 + 0.07, 0.19, 0.035);
    P.patch(HIGHLIGHT, shine.at, shine.n, [hr * 0.055, hr * 0.055, 0.015], [6, 4]);
  }
  for (const u of [-1, 1]) {
    const { at, n } = face(f, u * 0.6, -0.22, 0.004);
    P.patch(BLUSH, at, n, [hr * 0.13, hr * 0.08, 0.015], [8, 5]);
  }
}

function nose(P: Parts, f: Frame, p: Paint): void {
  const hr = f.hr;
  switch (f.art.nose) {
    case 'button': {
      const { at, n } = face(f, 0, -0.16, 0.01);
      P.patch(p.accent, at, n, [hr * 0.1, hr * 0.075, 0.035], [8, 6]);
      break;
    }
    case 'snout': {
      const { at, n } = face(f, 0, -0.34, -hr * 0.1);
      P.patch(p.light, at, n, [f.head.r[0] * 0.4, hr * 0.28, hr * 0.32]);
      const tip = face(f, 0, -0.2, hr * 0.2);
      P.patch(
        p.accent === p.light ? EYE : p.accent,
        tip.at,
        tip.n,
        [hr * 0.11, hr * 0.08, 0.04],
        [8, 6],
      );
      break;
    }
    case 'bigNose': {
      const { at, n } = face(f, 0, -0.2, 0.02);
      P.patch(p.accent, at, n, [hr * 0.2, hr * 0.25, hr * 0.14]);
      break;
    }
    case 'pig': {
      const { at, n } = face(f, 0, -0.24, hr * 0.04);
      const g = new CylinderGeometry(hr * 0.22, hr * 0.24, hr * 0.16, 16);
      g.rotateX(Math.PI / 2);
      P.list.push(part(g, p.accent, { matrix: aligned(at, n, FORWARD) }));
      for (const u of [-1, 1]) {
        const hole = face(f, u * 0.09, -0.24, hr * 0.13);
        P.patch(darken(p.accent, 0.4), hole.at, hole.n, [hr * 0.045, hr * 0.07, 0.015], [6, 4]);
      }
      break;
    }
    case 'beak': {
      const { at } = face(f, 0, -0.1, -0.01);
      P.cone(p.accent, at, [0, -0.25, 1], hr * 0.15, hr * 0.32, 8);
      break;
    }
    case 'bill': {
      const { at } = face(f, 0, -0.3, -hr * 0.05);
      P.ball(p.accent, add(at, [0, 0, hr * 0.12]), [hr * 0.36, hr * 0.1, hr * 0.3], {
        seg: [12, 6],
      });
      break;
    }
    case 'smile': {
      const { at, n } = face(f, 0, -0.3, 0.004);
      P.arc(EYE, at, n, hr * 0.16, hr * 0.025, Math.PI, Math.PI);
      break;
    }
  }
}

// ---- Ears ---------------------------------------------------------------------------------------

/** A point on top of the head at `deg` from straight up (+ = to the animal's left, +x). */
function earBase(f: Frame, side: number, deg: number): V3 {
  const a = (deg * Math.PI) / 180;
  const [rx, ry] = f.head.r;
  const c = f.head.c;
  return [c[0] + side * Math.sin(a) * rx * 0.9, c[1] + Math.cos(a) * ry * 0.9, c[2] - f.hr * 0.08];
}

function outward(side: number, deg: number, forward = 0): V3 {
  const a = (deg * Math.PI) / 180;
  return [side * Math.sin(a), Math.cos(a), forward];
}

function ears(P: Parts, f: Frame, p: Paint): void {
  const k = f.art.earSize ?? 1;
  const hr = f.hr;
  const tip = f.patterns.has('tipEars');
  for (const side of [-1, 1]) {
    switch (f.art.ears) {
      case 'long': {
        const base = earBase(f, side, 22);
        const dir = outward(side, 12);
        const len = hr * 0.62 * k;
        const c = add(base, [dir[0] * len, dir[1] * len, 0]);
        P.patch(p.main, c, [0, 0, 1], [hr * 0.17, len, hr * 0.11], [10, 8]);
        P.patch(
          p.accent,
          add(c, [0, -len * 0.05, hr * 0.07]),
          [0, 0, 1],
          [hr * 0.08, len * 0.72, 0.02],
          [8, 6],
        );
        break;
      }
      case 'pointy': {
        const base = earBase(f, side, 36);
        const dir = outward(side, 22);
        P.cone(p.main, base, dir, hr * 0.3 * k, hr * 0.6 * k);
        P.cone(
          tip ? p.light : p.accent,
          add(base, [0, 0.01, hr * 0.09]),
          dir,
          hr * 0.17 * k,
          hr * 0.42 * k,
          8,
        );
        if (tip) {
          const up = hr * 0.38 * k;
          P.cone(
            p.dark,
            add(base, [dir[0] * up, dir[1] * up, 0]),
            dir,
            hr * 0.13 * k,
            hr * 0.23 * k,
            8,
          );
        }
        break;
      }
      case 'floppy': {
        const color = mix(p.main, p.dark, 0.5);
        const c: V3 = add(f.head.c, [side * f.head.r[0] * 0.92, -hr * 0.05, -hr * 0.05]);
        P.ball(color, c, [hr * 0.18, hr * 0.46 * k, hr * 0.28], { rz: side * 0.35, seg: [10, 8] });
        break;
      }
      case 'round': {
        const base = earBase(f, side, 44);
        P.patch(p.main, base, [0, 0, 1], [hr * 0.25 * k, hr * 0.25 * k, hr * 0.12]);
        P.patch(
          p.accent,
          add(base, [0, 0, hr * 0.08]),
          [0, 0, 1],
          [hr * 0.13 * k, hr * 0.13 * k, 0.02],
        );
        break;
      }
      case 'fluffy': {
        const base = earBase(f, side, 62);
        P.patch(p.main, base, [side * 0.3, 0, 1], [hr * 0.38, hr * 0.36, hr * 0.16]);
        P.patch(
          p.light,
          add(base, [0, 0, hr * 0.1]),
          [side * 0.3, 0, 1],
          [hr * 0.24, hr * 0.23, 0.03],
        );
        break;
      }
      case 'tufts': {
        const base = earBase(f, side, 38);
        P.cone(
          tone(p, p.main, (c) => darken(c, 0.1)),
          base,
          outward(side, 34),
          hr * 0.15 * k,
          hr * 0.38 * k,
          8,
        );
        break;
      }
      case 'pig': {
        const base = earBase(f, side, 42);
        P.cone(p.main, base, outward(side, 30, 0.7), hr * 0.2 * k, hr * 0.34 * k, 8);
        break;
      }
      case 'gills': {
        for (const [dy, deg] of [
          [0.3, 40],
          [0, 75],
          [-0.3, 110],
        ] as const) {
          const from: V3 = add(f.head.c, [side * f.head.r[0] * 0.85, dy * hr, -hr * 0.1]);
          const to = add(from, [
            side * Math.sin((deg * Math.PI) / 180) * hr * 0.42,
            Math.cos((deg * Math.PI) / 180) * hr * 0.42,
            0,
          ]);
          P.rod(p.accent, from, to, hr * 0.06, 6);
          P.ball(p.accent, to, [hr * 0.08, hr * 0.08, hr * 0.08], { seg: [7, 5] });
        }
        break;
      }
      case 'none':
        return;
    }
  }
}

// ---- Tails --------------------------------------------------------------------------------------

function tail(P: Parts, f: Frame, p: Paint): void {
  const { c, r } = f.body;
  const k = f.k;
  const base: V3 = [0, c[1] - r[1] * 0.25, c[2] - r[2] * 0.92];
  const at = (x: number, y: number, z: number): V3 => add(base, [x * k, y * k, -z * k]);
  switch (f.art.tail) {
    case 'puff':
      P.ball(p.light, at(0, 0.02, 0.02), [0.1 * k, 0.1 * k, 0.1 * k], { seg: [9, 7] });
      break;
    case 'thin':
      P.tube(
        p.main,
        [at(0, 0, 0), at(0.02, 0.12, 0.12), at(0.08, 0.3, 0.14), at(0.14, 0.38, 0.06)],
        0.028 * k,
      );
      break;
    case 'wag':
      P.tube(p.main, [at(0, 0, 0), at(0, 0.12, 0.1), at(0.03, 0.26, 0.12)], 0.04 * k);
      break;
    case 'bushy':
    case 'ringed': {
      const ringed = f.art.tail === 'ringed';
      const pts: [number, number, number, number][] = [
        [0, 0.02, 0.04, 0.07],
        [0.02, 0.1, 0.14, 0.095],
        [0.05, 0.2, 0.2, 0.11],
        [0.08, 0.31, 0.2, 0.105],
        [0.1, 0.4, 0.15, 0.085],
      ];
      pts.forEach(([x, y, z, rad], i) => {
        const tipLight = !ringed && i === pts.length - 1;
        const color = ringed ? (i % 2 ? p.dark : p.main) : tipLight ? p.light : p.main;
        P.ball(color, at(x, y, z), [rad * k, rad * k, rad * k], { seg: [9, 7] });
      });
      break;
    }
    case 'curl':
      P.arc(p.main, at(0, 0.06, 0.03), [0, 0, -1], 0.05 * k, 0.017 * k, Math.PI * 1.6, 0.4);
      break;
    case 'feather':
      for (const x of [-1, 0, 1]) {
        P.ball(
          tone(p, p.main, (c) => darken(c, 0.08)),
          at(x * 0.05, 0.1, 0.06),
          [0.035 * k, 0.1 * k, 0.03 * k],
          {
            rz: -x * 0.4,
            rx: -0.5,
            seg: [8, 6],
          },
        );
      }
      break;
    case 'flat':
      P.ball(
        tone(p, p.main, (c) => darken(c, 0.12)),
        add(base, [0, -r[1] * 0.35, -0.16 * k]),
        [0.08 * k, 0.03 * k, 0.2 * k],
        {
          seg: [10, 6],
        },
      );
      break;
    case 'fin':
      P.ball(p.light, add(base, [0, 0.02, -0.14 * k]), [0.02 * k, 0.11 * k, 0.22 * k], {
        seg: [10, 7],
      });
      break;
    case 'flowing': {
      const colors = [p.accent, p.dark, tone(p, p.accent, (c) => lighten(c, 0.4))];
      colors.forEach((color, i) => {
        const x = (i - 1) * 0.04;
        P.tube(
          color,
          [at(x, 0.05, 0), at(x, 0.08, 0.12), at(x * 1.5, -0.05, 0.22), at(x * 2, -0.2, 0.24)],
          0.03 * k,
        );
      });
      break;
    }
    case 'dragon': {
      const pts: [number, number, number, number][] = [
        [0, 0, 0.04, 0.09],
        [0, 0.02, 0.15, 0.075],
        [0.02, 0.08, 0.25, 0.06],
        [0.05, 0.16, 0.32, 0.045],
      ];
      for (const [x, y, z, rad] of pts)
        P.ball(p.main, at(x, y, z), [rad * k, rad * k, rad * k], { seg: [9, 7] });
      // A spade tip.
      P.ball(p.accent, at(0.07, 0.24, 0.36), [0.075 * k, 0.075 * k, 0.02 * k], {
        rx: -0.6,
        seg: [4, 4],
      });
      break;
    }
    case 'none':
      break;
  }
}

// ---- Extras -------------------------------------------------------------------------------------

function extras(P: Parts, f: Frame, p: Paint): void {
  const { c, r } = f.body;
  const hr = f.hr;
  const k = f.k;
  // A silhouette is one flat color: no face details, no shading.
  const shade = (c: string, k: number) => (p.details ? darken(c, k) : c);
  for (const extra of f.art.extras) {
    if (!p.details && (extra === 'whiskers' || extra === 'moonMark')) continue;
    switch (extra) {
      case 'whiskers':
        for (const side of [-1, 1]) {
          for (const tilt of [-0.12, 0.12]) {
            const { at } = face(f, side * 0.42, -0.26, 0.01);
            P.rod(
              shade(p.main, 0.5),
              at,
              add(at, [side * hr * 0.42, tilt * hr, hr * 0.05]),
              0.005,
              4,
            );
          }
        }
        break;
      case 'pouches':
        for (const side of [-1, 1]) {
          const { at, n } = face(f, side * 0.66, -0.36, -hr * 0.12);
          P.patch(p.light, at, n, [hr * 0.3, hr * 0.26, hr * 0.26]);
        }
        break;
      case 'featherWings':
        for (const side of [-1, 1]) {
          P.ball(
            shade(p.main, 0.1),
            [side * r[0] * 0.97, c[1] + r[1] * 0.02, c[2] - r[2] * 0.08],
            [0.045, r[1] * 0.58, r[2] * 0.62],
            {
              rz: side * 0.22,
            },
          );
        }
        break;
      case 'flippers':
        for (const side of [-1, 1]) {
          P.ball(
            p.main,
            [side * r[0] * 0.98, c[1] - r[1] * 0.05, c[2]],
            [0.04, r[1] * 0.52, r[2] * 0.38],
            {
              rz: side * 0.38,
            },
          );
        }
        break;
      case 'batWings': {
        const wing = new Shape();
        // A bat-like wing: a strong top edge to a point, and a scalloped bottom edge.
        wing.moveTo(0, 0);
        wing.lineTo(0.12, 0.2);
        wing.lineTo(0.36, 0.3);
        wing.quadraticCurveTo(0.33, 0.14, 0.27, 0.07);
        wing.quadraticCurveTo(0.22, 0.12, 0.17, 0.01);
        wing.quadraticCurveTo(0.11, 0.05, 0.06, -0.06);
        wing.closePath();
        for (const side of [-1, 1]) {
          const g = new ExtrudeGeometry(wing, {
            depth: 0.02,
            bevelEnabled: false,
            curveSegments: 4,
          });
          // Spread out to the sides and swept back, so they show from above.
          g.scale(side * k * 1.35, k * 1.35, 1);
          g.rotateX(-0.9);
          g.rotateY(side * 0.35);
          P.list.push(
            part(g, p.dark, {
              x: side * r[0] * 0.35,
              y: c[1] + r[1] * 0.45,
              z: c[2] - r[2] * 0.55,
            }),
          );
        }
        break;
      }
      case 'spines': {
        const dirs = spread(90, (d) => d.z < 0.35 && d.y > -0.2);
        for (const d of dirs) {
          const { at, n } = onBody(f, d);
          P.cone(p.dark, at, add(n, [0, 0.25, -0.35]), 0.034 * k, 0.12 * k, 5);
        }
        // Over the back of the head too.
        for (const d of spread(30, (d) => d.z < -0.2 && d.y > -0.1)) {
          const at = add(f.head.c, [d.x * f.head.r[0], d.y * f.head.r[1], d.z * f.head.r[2]]);
          P.cone(p.dark, at, [d.x, d.y + 0.3, d.z], 0.03 * k, 0.1 * k, 5);
        }
        break;
      }
      case 'wool': {
        const wool = p.main;
        // Not on the upper front, where the face looks out.
        for (const d of spread(34, (d) => d.y > -0.55 && !(d.z > 0.25 && d.y > 0.1))) {
          const { at } = onBody(f, d);
          P.ball(wool, at, [r[0] * 0.28, r[0] * 0.26, r[0] * 0.28], { seg: [8, 6] });
        }
        // A woolly fringe on top of the head.
        for (const u of [-0.35, 0, 0.35]) {
          const { at } = face(f, u, 0.72, -hr * 0.1);
          P.ball(wool, at, [hr * 0.26, hr * 0.22, hr * 0.24], { seg: [8, 6] });
        }
        break;
      }
      case 'horn': {
        const { at } = face(f, 0, 0.7, -hr * 0.05);
        const dir: V3 = [0, 1, 0.2];
        P.cone(p.dark, at, dir, hr * 0.13, hr * 1.0, 10);
        for (const t of [0.15, 0.32]) {
          const d = new Vector3(...dir).normalize().multiplyScalar(hr * 1.0 * t);
          P.arc(
            shade(p.dark, 0.15),
            add(at, [d.x, d.y, d.z]),
            dir,
            hr * 0.12 * (1 - t) * 0.95,
            hr * 0.02,
            Math.PI * 2,
            0,
          );
        }
        break;
      }
      case 'horns':
        for (const side of [-1, 1]) {
          const base = earBase(f, side, 30);
          P.cone(p.accent, base, outward(side, 18, -0.5), hr * 0.1, hr * 0.36, 8);
        }
        break;
      case 'mane': {
        const colors = [p.accent, p.dark, tone(p, p.accent, (c) => lighten(c, 0.35))];
        for (let i = 0; i < 7; i++) {
          const a = 0.45 + i * 0.3;
          const at = add(f.head.c, [
            0,
            Math.cos(a) * f.head.r[1] * 1.02,
            -Math.sin(a) * f.head.r[2] * 1.02 - hr * 0.05,
          ]);
          P.ball(colors[i % 3]!, at, [hr * 0.2, hr * 0.2, hr * 0.2], { seg: [8, 6] });
        }
        break;
      }
      case 'tuft':
        for (const side of [-1, 0, 1]) {
          const base = earBase(f, side, side === 0 ? 0 : 12);
          P.cone(p.main, base, outward(side || 0, side * 18, 0.1), hr * 0.07, hr * 0.28, 6);
        }
        break;
      case 'moonMark': {
        const { at, n } = face(f, 0, 0.52, 0.006);
        P.arc(p.dark, at, n, hr * 0.13, hr * 0.04, Math.PI * 1.2, -Math.PI * 0.1);
        break;
      }
      case 'webbedFeet':
        // Drawn with the feet.
        break;
    }
  }
}

// ---- Public -------------------------------------------------------------------------------------

const cache = new Map<string, AnimalModel>();

function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Half-widths of an ellipsoid's slice at height y (0 when y misses it). */
function slice(center: V3, radii: V3, y: number): { rx: number; rz: number } {
  const t = (y - center[1]) / radii[1];
  const s = Math.sqrt(Math.max(0, 1 - t * t));
  return { rx: radii[0] * s, rz: radii[2] * s };
}

function neckFor(f: Frame): AnimalAnchors['neck'] {
  const { c, r } = f.body;
  const hc = f.head.c;
  const hr = f.head.r;
  if (f.art.body.shape === 'pony') {
    // Around the middle of the pony's neck, tipped along it.
    const a = new Vector3(0, c[1] + r[1] * 0.5, c[2] + r[2] * 0.62);
    const b = new Vector3(...add(hc, [0, -f.hr * 0.4, -f.hr * 0.2]));
    const mid = a.clone().lerp(b, 0.45);
    const up = b.sub(a).normalize();
    const radius = f.hr * 0.45 * 1.2;
    return { center: [mid.x, mid.y, mid.z], rx: radius, rz: radius, up: [up.x, up.y, up.z] };
  }
  if (f.art.body.shape === 'long') {
    // The head sits at the front of a long body: hug the bottom of the head (the body carries
    // on behind it), rather than going around the whole body.
    const y = hc[1] - hr[1] * 0.7;
    const hs = slice(hc, hr, y);
    return { center: [hc[0], y, hc[2]], rx: hs.rx * 1.06, rz: hs.rz * 1.06, up: [0, 1, 0] };
  }
  // Where the bottom of the head meets the body, wrapping both.
  const y = Math.min(c[1] + r[1] * 0.95, Math.max(c[1], hc[1] - hr[1] * 0.75));
  const hs = slice(hc, hr, y);
  const bs = slice(c, r, y);
  const rx = Math.max(hs.rx, bs.rx);
  const zMin = Math.min(hc[2] - hs.rz, c[2] - bs.rz);
  const zMax = Math.max(hc[2] + hs.rz, c[2] + bs.rz);
  return {
    center: [0, y, (zMin + zMax) / 2],
    rx: rx * 1.03,
    rz: ((zMax - zMin) / 2) * 1.03,
    up: [0, 1, 0],
  };
}

function anchorsFor(f: Frame): AnimalAnchors {
  const { c, r } = f.body;
  const front = f.art.body.shape === 'long' ? 0.72 : 0.62;
  const middle = face(f, 0, 0);
  // The front of the eyes: owl eyes are big discs that stand out further.
  const owl = f.art.eyes === 'owl';
  const eye = (u: number) =>
    face(f, u * (owl ? 0.4 : 0.36), owl ? 0.14 : 0.1, owl ? 0.075 : 0.045).at;
  const waistY = c[1] - r[1] * 0.15;
  const waist = slice(c, r, waistY);
  return {
    head: { center: f.head.c, radius: f.hr, radii: f.head.r },
    body: { center: c, radii: r },
    eyes: [eye(-1), eye(1)],
    eyeRadius: f.hr * (owl ? 0.36 : 0.21),
    neck: neckFor(f),
    waist: { center: [c[0], waistY, c[2]], rx: waist.rx, rz: waist.rz },
    longBody: f.art.body.shape === 'long' || f.art.body.shape === 'pony',
    nose: face(f, 0, -0.16, 0.02).at,
    cheeks: [face(f, -0.6, -0.22).at, face(f, 0.6, -0.22).at],
    paw: [r[0] * 0.48, 0.05, c[2] + r[2] * front],
    facing: middle.n,
  };
}

function finish(P: Parts, f: Frame): AnimalModel {
  const geometry = merge(P.list);
  const box = geometry.boundingBox!;
  return {
    geometry,
    outline: outlineGeometry(geometry),
    height: box.max.y,
    radius: Math.max(box.max.x, -box.min.x, box.max.z, -box.min.z),
    anchors: anchorsFor(f),
  };
}

/** The 3D model for a look (cached). Unknown species fall back to the bunny. */
export function animalModel(speciesId: string, variantId: string, sparkle = false): AnimalModel {
  return build(speciesId, variantId, sparkle, false);
}

/** An undiscovered species in the Dex: its shape in one dark color, no face or markings. */
export function silhouetteModel(speciesId: string): AnimalModel {
  return build(speciesId, '', false, true);
}

function build(
  speciesId: string,
  variantId: string,
  sparkle: boolean,
  silhouette: boolean,
): AnimalModel {
  const key = `${speciesId}|${variantId}|${sparkle}|${silhouette}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const species = getSpecies(speciesId) ?? getSpecies('bunny')!;
  const variant = species.variants.find((v) => v.id === variantId) ?? species.variants[0]!;
  const p = paintFor(variant.colors, sparkle, silhouette);
  const f = frameFor(
    species.art,
    silhouette ? [] : [...species.art.patterns, ...(variant.patterns ?? [])],
  );
  const P = new Parts();
  body(P, f, p);
  head(P, f, p);
  tail(P, f, p);
  ears(P, f, p);
  if (!silhouette) {
    markings(P, f, p, hashSeed(key));
    nose(P, f, p);
    eyes(P, f);
  }
  extras(P, f, p);
  const model = finish(P, f);
  cache.set(key, model);
  return model;
}

let mystery: AnimalModel | null = null;

/** The mystery visitor: a plain dark silhouette (no face), the same for every visitor. */
export function mysteryModel(): AnimalModel {
  if (mystery) return mystery;
  const flat = { main: SILHOUETTE, light: SILHOUETTE, accent: SILHOUETTE, dark: SILHOUETTE };
  const p = { ...flat, outline: SILHOUETTE, details: false } as Paint;
  const art: SpeciesArt = {
    body: { shape: 'round', w: 72, h: 52 },
    head: { y: -32, r: 27 },
    ears: 'round',
    tail: 'puff',
    nose: 'button',
    patterns: [],
    extras: [],
  };
  const f = frameFor(art, []);
  const P = new Parts();
  body(P, f, p);
  head(P, f, p);
  tail(P, f, p);
  ears(P, f, p);
  mystery = finish(P, f);
  return mystery;
}
