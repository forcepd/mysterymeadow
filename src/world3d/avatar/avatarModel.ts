import {
  CapsuleGeometry,
  CatmullRomCurve3,
  ConeGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Mesh,
  Shape,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
  type BufferGeometry,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { avatarKey } from '../../art/avatarSvg';
import { darken, lighten } from '../../art/svg';
import { getAvatarItem, type AvatarItemDef, type AvatarSlot } from '../../config/avatarItems';
import type { AvatarLoadout } from '../../profile/avatar';
import { sceneryMesh, part } from '../art/toon';

/**
 * The player's avatar in 3D (DESIGN 13.3), built from the same loadout as the original's layered
 * SVG: body shape and skin, face (eyes, brows, mouth, makeup), hair, clothes, shoes and
 * accessories. A chunky chibi kid about twice an animal's height, facing +z, feet on y = 0.
 */

type V3 = [number, number, number];
type Parts = BufferGeometry[];
const INK = '#3b2a24';

/** Everything the parts need to know about the body. */
interface Body {
  skin: string;
  /** Torso half-width and half-depth. */
  tw: number;
  td: number;
  hipY: number;
  shoulderY: number;
  legX: number;
  legR: number;
  armR: number;
  head: V3;
  hr: number;
}

function item(loadout: AvatarLoadout, slot: AvatarSlot): AvatarItemDef | undefined {
  if (slot === 'blush' || slot === 'eyeshadow' || slot === 'lips' || slot === 'face') {
    const id = loadout.makeup[slot];
    return id ? getAvatarItem(id) : undefined;
  }
  if (slot === 'hat' || slot === 'glasses' || slot === 'bag' || slot === 'earrings') {
    return loadout.accessories.map(getAvatarItem).find((a) => a?.slot === slot);
  }
  const id = (loadout as unknown as Record<string, string | undefined>)[slot];
  return id ? getAvatarItem(id) : undefined;
}

/**
 * The face tilts up a little, as if looking up at the player (the camera looks down on the
 * world), like the animals' faces.
 */
const FACE_TILT = 0.34;

/** A point on the face (u, v across the front of the head), pushed out by `lift`. */
function face(b: Body, u: number, v: number, lift = 0): V3 {
  const w = Math.sqrt(Math.max(0, 1 - u * u - v * v));
  const r = b.hr + lift;
  const y = v * b.hr;
  const z = w * r;
  const c = Math.cos(FACE_TILT);
  const s = Math.sin(FACE_TILT);
  return [b.head[0] + u * b.hr, b.head[1] + y * c + z * s, b.head[2] - y * s + z * c];
}

function ball(P: Parts, color: string, at: V3, r: V3 | number, seg = 12) {
  const s: V3 = typeof r === 'number' ? [r, r, r] : r;
  P.push(
    part(new SphereGeometry(1, seg, Math.max(6, seg - 3)), color, {
      x: at[0],
      y: at[1],
      z: at[2],
      s,
    }),
  );
}

function heart(size: number): Shape {
  const s = new Shape();
  s.moveTo(0, -size);
  s.bezierCurveTo(-size * 1.3, -size * 0.1, -size * 0.8, size * 0.9, 0, size * 0.35);
  s.bezierCurveTo(size * 0.8, size * 0.9, size * 1.3, -size * 0.1, 0, -size);
  return s;
}

function star(r: number): Shape {
  const s = new Shape();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.45 : r;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    if (i === 0) s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  s.closePath();
  return s;
}

/** A flat shape stuck on the front of something at `at`. */
function decal(P: Parts, shape: Shape, color: string, at: V3, rx = 0) {
  P.push(
    part(new ExtrudeGeometry(shape, { depth: 0.01, bevelEnabled: false }), color, {
      x: at[0],
      y: at[1],
      z: at[2],
      rx,
    }),
  );
}

function arc(
  P: Parts,
  color: string,
  at: V3,
  r: number,
  tube: number,
  angle: number,
  spin: number,
) {
  const g = new TorusGeometry(r, tube, 5, 12, angle);
  g.rotateZ(spin);
  P.push(part(g, color, { x: at[0], y: at[1], z: at[2] }));
}

// ---- Body ---------------------------------------------------------------------------------------

function bodyFor(loadout: AvatarLoadout): Body {
  const kind = item(loadout, 'bodyShape')?.kind ?? 'regular';
  const tw = kind === 'slim' ? 0.15 : kind === 'round' ? 0.23 : 0.19;
  const hipY = 0.4;
  const shoulderY = 0.8;
  const hr = 0.32;
  return {
    skin: item(loadout, 'skinTone')?.color ?? '#e8b48a',
    tw,
    td: tw * 0.75,
    hipY,
    shoulderY,
    legX: tw * 0.5,
    legR: kind === 'round' ? 0.07 : 0.06,
    armR: kind === 'round' ? 0.06 : 0.05,
    head: [0, shoulderY + hr * 0.95, 0.02],
    hr,
  };
}

function skinParts(P: Parts, b: Body) {
  // Legs, arms (hanging a little out), hands, neck, head, ears.
  for (const side of [-1, 1]) {
    P.push(
      part(new CapsuleGeometry(b.legR, b.hipY - 0.08, 4, 10), b.skin, {
        x: side * b.legX,
        y: b.hipY / 2 + 0.02,
      }),
    );
    P.push(
      part(new CapsuleGeometry(b.armR, 0.28, 4, 10), b.skin, {
        x: side * (b.tw + b.armR * 0.9),
        y: b.shoulderY - 0.17,
        rz: side * 0.18,
      }),
    );
    ball(P, b.skin, [side * (b.tw + b.armR * 2.2), b.shoulderY - 0.36, 0.01], b.armR * 1.15, 10);
    ball(P, b.skin, [side * b.hr * 0.98, b.head[1] - 0.02, b.head[2]], [0.05, 0.07, 0.04], 8);
  }
  P.push(part(new CylinderGeometry(0.06, 0.07, 0.1, 10), b.skin, { y: b.shoulderY + 0.03 }));
  ball(P, b.skin, b.head, [b.hr, b.hr * 0.96, b.hr * 0.94], 16);
}

/** The torso in a color (a top, or the dress's bodice). */
function torso(P: Parts, b: Body, color: string, sleeves = true) {
  const h = b.shoulderY - b.hipY + 0.04;
  P.push(
    part(new RoundedBoxGeometry(b.tw * 2, h, b.td * 2, 3, 0.07), color, {
      y: b.hipY + h / 2 - 0.02,
    }),
  );
  if (!sleeves) return;
  for (const side of [-1, 1]) {
    P.push(
      part(new CapsuleGeometry(b.armR * 1.35, 0.08, 4, 10), color, {
        x: side * (b.tw + b.armR * 0.7),
        y: b.shoulderY - 0.07,
        rz: side * 0.18,
      }),
    );
  }
}

// ---- Clothes ------------------------------------------------------------------------------------

function top(P: Parts, b: Body, t: AvatarItemDef | undefined) {
  const c = t?.color ?? '#ffffff';
  const c2 = t?.color2 ?? lighten(c, 0.5);
  torso(P, b, c);
  const front = b.td + 0.004;
  const mid = (b.hipY + b.shoulderY) / 2;
  switch (t?.kind) {
    case 'stripes':
      for (const y of [mid - 0.1, mid, mid + 0.1]) {
        P.push(
          part(new RoundedBoxGeometry(b.tw * 2 + 0.01, 0.035, b.td * 2 + 0.01, 1, 0.012), c2, {
            y,
          }),
        );
      }
      break;
    case 'hoodie':
      P.push(
        part(new TorusGeometry(0.13, 0.05, 6, 16), darken(c, 0.1), {
          y: b.shoulderY + 0.02,
          z: -0.04,
          rx: Math.PI / 2 + 0.3,
        }),
      );
      P.push(
        part(new RoundedBoxGeometry(b.tw * 1.2, 0.09, 0.02, 1, 0.01), darken(c, 0.1), {
          y: b.hipY + 0.1,
          z: front,
        }),
      );
      break;
    case 'heart':
      decal(P, heart(0.07), c2, [0, mid, front]);
      break;
    case 'star':
      decal(P, star(0.08), c2, [0, mid, front]);
      break;
    case 'rainbow':
      ['#ff6f6f', '#ffd84d', '#7cc46a', '#6fa8ef'].forEach((color, i) => {
        P.push(
          part(new RoundedBoxGeometry(b.tw * 2 + 0.01, 0.06, b.td * 2 + 0.01, 1, 0.02), color, {
            y: b.shoulderY - 0.08 - i * 0.075,
          }),
        );
      });
      break;
  }
}

function bottom(P: Parts, b: Body, t: AvatarItemDef | undefined) {
  if (!t) return;
  const c = t.color;
  switch (t.kind) {
    case 'pants':
      for (const side of [-1, 1]) {
        P.push(
          part(new CapsuleGeometry(b.legR * 1.25, b.hipY - 0.12, 4, 10), c, {
            x: side * b.legX,
            y: b.hipY / 2 + 0.05,
          }),
        );
      }
      P.push(
        part(new RoundedBoxGeometry(b.tw * 2 + 0.02, 0.1, b.td * 2 + 0.02, 2, 0.04), c, {
          y: b.hipY,
        }),
      );
      break;
    case 'shorts':
      for (const side of [-1, 1]) {
        P.push(
          part(new CylinderGeometry(b.legR * 1.5, b.legR * 1.6, 0.13, 12), c, {
            x: side * b.legX,
            y: b.hipY - 0.07,
          }),
        );
      }
      P.push(
        part(new RoundedBoxGeometry(b.tw * 2 + 0.02, 0.1, b.td * 2 + 0.02, 2, 0.04), c, {
          y: b.hipY,
        }),
      );
      break;
    case 'tutu':
      P.push(
        part(new CylinderGeometry(b.tw * 1.05, b.tw * 1.9, 0.14, 20, 1, true), c, {
          y: b.hipY - 0.03,
        }),
      );
      P.push(
        part(new CylinderGeometry(b.tw * 1.05, b.tw * 1.6, 0.1, 20, 1, true), lighten(c, 0.3), {
          y: b.hipY - 0.07,
        }),
      );
      break;
    default: // skirt
      P.push(
        part(new CylinderGeometry(b.tw * 1.05, b.tw * 1.55, 0.2, 20), c, { y: b.hipY - 0.06 }),
      );
      if (t.color2)
        P.push(
          part(new CylinderGeometry(b.tw * 1.43, b.tw * 1.47, 0.03, 20), t.color2, {
            y: b.hipY - 0.12,
          }),
        );
  }
}

function onePiece(P: Parts, b: Body, t: AvatarItemDef) {
  const c = t.color;
  const c2 = t.color2 ?? lighten(c, 0.5);
  switch (t.kind) {
    case 'overalls':
      torso(P, b, c2);
      bottom(P, b, { ...t, kind: 'pants' });
      P.push(
        part(new RoundedBoxGeometry(b.tw * 1.3, 0.2, 0.02, 1, 0.02), c, {
          y: b.hipY + 0.14,
          z: b.td + 0.005,
        }),
      );
      for (const side of [-1, 1]) {
        P.push(
          part(new RoundedBoxGeometry(0.035, 0.26, 0.02, 1, 0.01), c, {
            x: side * b.tw * 0.5,
            y: b.shoulderY - 0.12,
            z: b.td + 0.006,
          }),
        );
        ball(P, '#ffd84d', [side * b.tw * 0.5, b.hipY + 0.22, b.td + 0.02], 0.018, 6);
      }
      break;
    case 'gown':
      torso(P, b, c, false);
      P.push(
        part(new CylinderGeometry(b.tw * 1.05, b.tw * 2.2, b.hipY + 0.02, 22), c, {
          y: (b.hipY + 0.02) / 2 + 0.03,
        }),
      );
      for (const [x, y] of [
        [-0.12, 0.25],
        [0.1, 0.15],
        [0.02, 0.33],
      ] as const) {
        decal(P, star(0.035), c2, [x, y, b.tw * 1.55], -0.35);
      }
      break;
    default: // dress
      torso(P, b, c, false);
      P.push(
        part(new CylinderGeometry(b.tw * 1.05, b.tw * 1.8, 0.26, 22), c, { y: b.hipY - 0.08 }),
      );
      if (t.color2)
        P.push(
          part(new CylinderGeometry(b.tw * 1.72, b.tw * 1.8, 0.04, 22), t.color2, {
            y: b.hipY - 0.2,
          }),
        );
  }
}

function shoes(P: Parts, b: Body, t: AvatarItemDef | undefined) {
  const c = t?.color ?? '#ffffff';
  for (const side of [-1, 1]) {
    const x = side * b.legX;
    switch (t?.kind) {
      case 'boots':
        P.push(
          part(new RoundedBoxGeometry(b.legR * 2.6, 0.2, 0.17, 2, 0.04), c, { x, y: 0.1, z: 0.02 }),
        );
        break;
      case 'sandals':
        P.push(
          part(new RoundedBoxGeometry(b.legR * 2.4, 0.03, 0.18, 1, 0.012), c, {
            x,
            y: 0.015,
            z: 0.03,
          }),
        );
        P.push(
          part(new TorusGeometry(b.legR * 1.1, 0.012, 4, 12), c, {
            x,
            y: 0.06,
            z: 0.03,
            rx: Math.PI / 2,
          }),
        );
        break;
      case 'slippers':
        P.push(
          part(new RoundedBoxGeometry(b.legR * 2.8, 0.09, 0.2, 2, 0.04), c, {
            x,
            y: 0.045,
            z: 0.03,
          }),
        );
        for (const e of [-1, 1]) {
          P.push(
            part(new CapsuleGeometry(0.014, 0.05, 3, 6), t?.color2 ?? '#ff9fc4', {
              x: x + e * 0.025,
              y: 0.12,
              z: 0.08,
              rx: -0.3,
            }),
          );
        }
        break;
      default: // sneakers
        P.push(
          part(new RoundedBoxGeometry(b.legR * 2.5, 0.09, 0.19, 2, 0.04), c, {
            x,
            y: 0.045,
            z: 0.03,
          }),
        );
        P.push(
          part(new RoundedBoxGeometry(b.legR * 2.55, 0.025, 0.2, 1, 0.01), t?.color2 ?? '#dddddd', {
            x,
            y: 0.012,
            z: 0.03,
          }),
        );
    }
  }
}

// ---- Head ---------------------------------------------------------------------------------------

function hair(P: Parts, b: Body, kind: string, c: string) {
  const [hx, hy, hz] = b.head;
  const hr = b.hr;
  // A cap of hair over the top and back of the head, with a fringe.
  // Tipped back so its front edge (the fringe) sits high on the forehead.
  const cap = new SphereGeometry(1, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.5);
  P.push(
    part(cap, c, {
      x: hx,
      y: hy + 0.01,
      z: hz - 0.015,
      s: [hr * 1.07, hr * 1.07, hr * 1.07],
      rx: -0.75,
    }),
  );
  const at = (x: number, y: number, z: number): V3 => [hx + x * hr, hy + y * hr, hz + z * hr];
  switch (kind) {
    case 'bob':
      for (const side of [-1, 1])
        ball(P, c, at(side * 0.82, -0.25, -0.1), [hr * 0.3, hr * 0.5, hr * 0.55]);
      ball(P, c, at(0, -0.1, -0.55), [hr * 0.85, hr * 0.7, hr * 0.5]);
      break;
    case 'ponytail': {
      const curve = new CatmullRomCurve3([
        new Vector3(...at(0, 0.3, -0.9)),
        new Vector3(...at(0, 0.1, -1.3)),
        new Vector3(...at(0, -0.5, -1.25)),
        new Vector3(...at(0, -0.9, -1.05)),
      ]);
      P.push(part(new TubeGeometry(curve, 12, hr * 0.18, 8, false), c));
      ball(P, darken(c, 0.15), at(0, 0.3, -0.95), hr * 0.14, 8);
      break;
    }
    case 'long':
      ball(P, c, at(0, -0.6, -0.5), [hr * 1.0, hr * 1.1, hr * 0.5]);
      for (const side of [-1, 1])
        ball(P, c, at(side * 0.85, -0.55, -0.1), [hr * 0.25, hr * 0.75, hr * 0.45]);
      break;
    case 'curly':
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        ball(
          P,
          c,
          at(Math.cos(a) * 0.95, 0.35 + Math.sin(a * 2) * 0.1, Math.sin(a) * 0.8 - 0.2),
          hr * 0.26,
          8,
        );
      }
      break;
    case 'buns':
      for (const side of [-1, 1]) ball(P, c, at(side * 0.55, 0.85, -0.2), hr * 0.32);
      break;
    case 'spiky':
      for (let i = 0; i < 7; i++) {
        const a = -0.9 + (i / 6) * 1.8;
        P.push(
          part(new ConeGeometry(hr * 0.16, hr * 0.45, 6), c, {
            x: hx + Math.sin(a) * hr * 0.75,
            y: hy + Math.cos(a) * hr * 0.9,
            z: hz - hr * 0.15,
            rz: -a * 0.9,
          }),
        );
      }
      break;
    default: // short
      break;
  }
}

function eyes(P: Parts, b: Body, kind: string, color: string) {
  const hr = b.hr;
  for (const side of [-1, 1]) {
    const at = face(b, side * 0.36, 0.02, 0.005);
    const wink = kind === 'wink' && side > 0;
    if (kind === 'happy' || wink) {
      arc(P, color, at, hr * 0.1, hr * 0.022, Math.PI, 0);
      continue;
    }
    const big = kind === 'wide' ? 1.25 : 1;
    ball(P, color, at, [hr * 0.09 * big, hr * 0.13 * big, hr * 0.04], 10);
    ball(P, '#ffffff', [at[0] + hr * 0.035, at[1] + hr * 0.05, at[2] + hr * 0.03], hr * 0.03, 6);
    if (kind === 'sparkle')
      decal(P, star(hr * 0.045), '#ffffff', [
        at[0] - hr * 0.03,
        at[1] - hr * 0.04,
        at[2] + hr * 0.03,
      ]);
  }
}

function brows(P: Parts, b: Body, kind: string, color: string) {
  const hr = b.hr;
  for (const side of [-1, 1]) {
    const at = face(b, side * 0.36, 0.3, 0.01);
    const thick = kind === 'bold' ? 0.035 : 0.022;
    const tilt = kind === 'arched' ? -side * 0.35 : -side * 0.1;
    P.push(
      part(new RoundedBoxGeometry(hr * 0.24, hr * thick * 1.5, 0.015, 1, 0.006), color, {
        x: at[0],
        y: at[1],
        z: at[2],
        rz: tilt,
      }),
    );
  }
}

function mouth(P: Parts, b: Body, kind: string, color: string) {
  const hr = b.hr;
  const at = face(b, 0, -0.35, 0.005);
  switch (kind) {
    case 'grin':
      P.push(
        part(new SphereGeometry(1, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), color, {
          x: at[0],
          y: at[1] + hr * 0.02,
          z: at[2],
          s: [hr * 0.16, hr * 0.12, hr * 0.03],
        }),
      );
      break;
    case 'o':
      P.push(
        part(new TorusGeometry(hr * 0.06, hr * 0.022, 6, 14), color, {
          x: at[0],
          y: at[1],
          z: at[2],
        }),
      );
      break;
    case 'tongue':
      arc(P, color, at, hr * 0.12, hr * 0.022, Math.PI, Math.PI);
      ball(
        P,
        '#ff8fa3',
        [at[0] + hr * 0.04, at[1] - hr * 0.1, at[2]],
        [hr * 0.05, hr * 0.06, hr * 0.02],
        8,
      );
      break;
    default: // smile
      arc(P, color, at, hr * 0.12, hr * 0.022, Math.PI, Math.PI);
  }
}

function makeup(P: Parts, b: Body, loadout: AvatarLoadout) {
  const hr = b.hr;
  const blush = item(loadout, 'blush');
  if (blush) {
    for (const side of [-1, 1]) {
      const at = face(b, side * 0.58, -0.2, 0.004);
      if (blush.kind === 'heart') decal(P, heart(hr * 0.07), blush.color, at);
      else ball(P, blush.color, at, [hr * 0.12, hr * 0.07, 0.012], 8);
    }
  }
  const shadow = item(loadout, 'eyeshadow');
  if (shadow) {
    for (const side of [-1, 1])
      ball(P, shadow.color, face(b, side * 0.36, 0.14, 0.001), [hr * 0.13, hr * 0.07, 0.015], 8);
  }
  const paint = item(loadout, 'face');
  if (paint) {
    if (paint.kind === 'whiskers') {
      for (const side of [-1, 1]) {
        for (const dy of [-0.05, 0.05]) {
          const at = face(b, side * 0.62, -0.28 + dy, 0.004);
          P.push(
            part(new RoundedBoxGeometry(hr * 0.22, 0.006, 0.006, 1, 0.002), paint.color, {
              x: at[0],
              y: at[1],
              z: at[2],
              rz: side * dy * 3,
            }),
          );
        }
      }
    } else if (paint.kind === 'heart') {
      decal(P, heart(hr * 0.06), paint.color, face(b, 0.5, 0.25, 0.004));
    } else {
      for (const [u, v] of [
        [-0.5, 0.2],
        [0.55, 0.15],
        [-0.45, -0.05],
        [0.4, -0.1],
        [0.6, 0.35],
      ] as const) {
        ball(P, paint.color, face(b, u, v, 0.004), hr * 0.018, 6);
      }
    }
  }
}

function accessories(P: Parts, b: Body, loadout: AvatarLoadout) {
  const hr = b.hr;
  const [hx, hy, hz] = b.head;
  const hat = item(loadout, 'hat');
  if (hat) {
    switch (hat.kind) {
      case 'cap':
        P.push(
          part(new SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), hat.color, {
            x: hx,
            y: hy + hr * 0.25,
            z: hz,
            s: [hr * 1.1, hr * 0.8, hr * 1.1],
          }),
        );
        P.push(
          part(
            new CylinderGeometry(hr * 0.55, hr * 0.55, 0.02, 16, 1, false, -Math.PI / 2, Math.PI),
            darken(hat.color, 0.1),
            { x: hx, y: hy + hr * 0.3, z: hz + hr * 0.75, s: [1, 1, 0.8] },
          ),
        );
        break;
      case 'crown':
        P.push(
          part(new CylinderGeometry(hr * 0.4, hr * 0.44, hr * 0.2, 18, 1, true), hat.color, {
            x: hx,
            y: hy + hr * 1.02,
            z: hz,
          }),
        );
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          P.push(
            part(new ConeGeometry(hr * 0.08, hr * 0.18, 6), hat.color, {
              x: hx + Math.cos(a) * hr * 0.4,
              y: hy + hr * 1.2,
              z: hz + Math.sin(a) * hr * 0.4,
            }),
          );
        }
        break;
      case 'ears':
        for (const side of [-1, 1]) {
          P.push(
            part(new CapsuleGeometry(hr * 0.12, hr * 0.5, 4, 10), hat.color, {
              x: hx + side * hr * 0.35,
              y: hy + hr * 1.25,
              z: hz - hr * 0.1,
              rz: -side * 0.2,
            }),
          );
          P.push(
            part(new CapsuleGeometry(hr * 0.06, hr * 0.35, 4, 8), hat.color2 ?? '#ff9fc4', {
              x: hx + side * hr * 0.35,
              y: hy + hr * 1.25,
              z: hz - hr * 0.02,
              rz: -side * 0.2,
              s: [1, 1, 0.5],
            }),
          );
        }
        break;
      default: // flower crown
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2;
          ball(
            P,
            i % 2 ? (hat.color2 ?? '#ff9fc4') : '#ffd84d',
            [hx + Math.cos(a) * hr * 0.85, hy + hr * 0.55, hz + Math.sin(a) * hr * 0.85],
            hr * 0.1,
            8,
          );
        }
        P.push(
          part(new TorusGeometry(hr * 0.85, hr * 0.04, 6, 24), hat.color, {
            x: hx,
            y: hy + hr * 0.52,
            z: hz,
            rx: Math.PI / 2,
          }),
        );
    }
  }
  const glasses = item(loadout, 'glasses');
  if (glasses) {
    for (const side of [-1, 1]) {
      const at = face(b, side * 0.36, 0.02, 0.05);
      if (glasses.kind === 'star') decal(P, star(hr * 0.17), glasses.color, at);
      else if (glasses.kind === 'sun') ball(P, glasses.color, at, [hr * 0.17, hr * 0.13, 0.02], 12);
      else
        P.push(
          part(new TorusGeometry(hr * 0.15, hr * 0.025, 6, 18), glasses.color, {
            x: at[0],
            y: at[1],
            z: at[2],
          }),
        );
    }
    const bridge = face(b, 0, 0.05, 0.06);
    P.push(
      part(new RoundedBoxGeometry(hr * 0.2, hr * 0.03, 0.01, 1, 0.005), glasses.color, {
        x: bridge[0],
        y: bridge[1],
        z: bridge[2],
      }),
    );
  }
  const earrings = item(loadout, 'earrings');
  if (earrings) {
    for (const side of [-1, 1]) {
      const at: V3 = [side * hr * 1.0, b.head[1] - 0.08, b.head[2] + 0.02];
      if (earrings.kind === 'hoops')
        P.push(
          part(new TorusGeometry(0.035, 0.008, 5, 14), earrings.color, {
            x: at[0],
            y: at[1],
            z: at[2],
            ry: Math.PI / 2,
          }),
        );
      else if (earrings.kind === 'hearts')
        decal(P, heart(0.025), earrings.color, [at[0], at[1], at[2] + 0.02]);
      else ball(P, earrings.color, at, 0.02, 8);
    }
  }
  const bag = item(loadout, 'bag');
  if (bag) {
    if (bag.kind === 'backpack') {
      P.push(
        part(new RoundedBoxGeometry(b.tw * 1.8, 0.3, 0.14, 2, 0.05), bag.color, {
          y: b.hipY + 0.22,
          z: -b.td - 0.07,
        }),
      );
      for (const side of [-1, 1])
        P.push(
          part(new RoundedBoxGeometry(0.03, 0.3, 0.02, 1, 0.01), darken(bag.color, 0.15), {
            x: side * b.tw * 0.55,
            y: b.shoulderY - 0.13,
            z: b.td + 0.005,
          }),
        );
    } else {
      P.push(
        part(new RoundedBoxGeometry(0.14, 0.11, 0.06, 2, 0.03), bag.color, {
          x: b.tw + 0.1,
          y: b.hipY - 0.02,
          z: 0.03,
        }),
      );
      P.push(
        part(new TorusGeometry(0.18, 0.008, 4, 20, Math.PI), darken(bag.color, 0.15), {
          x: b.tw * 0.4,
          y: b.hipY + 0.12,
          z: 0.03,
          rz: -0.9,
        }),
      );
    }
  }
}

const cache = new Map<string, Mesh>();

/** The avatar for a loadout (cached per look): one outlined toon mesh. */
export function avatarMesh(loadout: AvatarLoadout): Mesh {
  const key = avatarKey(loadout);
  const hit = cache.get(key);
  if (hit) return hit.clone();
  const b = bodyFor(loadout);
  const P: Parts = [];
  skinParts(P, b);
  const dress = item(loadout, 'onePiece');
  if (dress) onePiece(P, b, dress);
  else {
    top(P, b, item(loadout, 'top'));
    bottom(P, b, item(loadout, 'bottom'));
  }
  shoes(P, b, item(loadout, 'shoes'));
  const hairColor = item(loadout, 'hairColor')?.color ?? '#6b4226';
  hair(P, b, item(loadout, 'hairStyle')?.kind ?? 'short', hairColor);
  makeup(P, b, loadout);
  eyes(P, b, item(loadout, 'eyes')?.kind ?? 'round', item(loadout, 'eyes')?.color ?? INK);
  brows(P, b, item(loadout, 'brows')?.kind ?? 'soft', darken(hairColor, 0.2));
  const lips = item(loadout, 'lips')?.color;
  mouth(
    P,
    b,
    item(loadout, 'mouth')?.kind ?? 'smile',
    lips ?? item(loadout, 'mouth')?.color ?? '#8a3b3b',
  );
  accessories(P, b, loadout);
  const mesh = sceneryMesh(P, { outline: 0.013, fade: false, shadows: false });
  mesh.name = 'avatar';
  cache.set(key, mesh);
  return mesh.clone();
}

/** How tall the avatar is (hats and hair included, roughly). */
export const AVATAR_HEIGHT = 1.55;
