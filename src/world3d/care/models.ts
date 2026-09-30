import {
  CatmullRomCurve3,
  ConeGeometry,
  CylinderGeometry,
  Group,
  LatheGeometry,
  Mesh,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  type BufferGeometry,
  type Object3D,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { BALANCE } from '../../config/balance';
import { COLORS } from '../../game/constants';
import type { FindKind } from '../../sim/types';
import { merge, part, seededRandom, sceneryMesh, toonMaterial } from '../art/toon';

/**
 * Care things in 3D, like the original's sprites: food bowls (the food mound shrinks as it's
 * eaten), poop, finds (coin, lucky clover, butterfly) and Scoop Bot. Meshes are shared per look
 * (a bowl per fill level, one poop) and never fade near the camera: they're for tapping.
 */

const OUTLINE = 0.014;
const cache = new Map<string, Object3D>();

/** A look, built once; callers get their own copy sharing geometry and materials. */
function shared<T extends Object3D>(key: string, build: () => T): T {
  let obj = cache.get(key) as T | undefined;
  if (!obj) {
    obj = build();
    cache.set(key, obj);
  }
  return obj.clone();
}

// ---- Bowl ---------------------------------------------------------------------------------------

const BOWL = 0x7fb8e6;
const FOOD = 0xc98a4b;
const KIBBLE = 0xe0a868;

/** A food bowl with `servings` left (0..bowlServings). */
export function bowlMesh(servings: number): Mesh {
  const max = BALANCE.needs.bowlServings;
  const n = Math.max(0, Math.min(max, Math.round(servings)));
  return shared(`bowl|${n}`, () => {
    const fill = n / max;
    // A rounded bowl turned on a lathe: wide rim, sloping sides, flat foot.
    const profile = [
      [0.0, 0.0],
      [0.24, 0.0],
      [0.3, 0.03],
      [0.37, 0.15],
      [0.39, 0.19],
      [0.35, 0.19],
      [0.33, 0.16],
      [0.26, 0.06],
      [0.0, 0.06],
    ].map(([x, y]) => new Vector2(x, y));
    const parts: BufferGeometry[] = [part(new LatheGeometry(profile, 28), BOWL)];
    // A shiny spot on the side.
    parts.push(
      part(new SphereGeometry(0.05, 8, 6), 0xd9ecfa, {
        x: -0.2,
        y: 0.12,
        z: 0.27,
        s: [1, 0.5, 0.3],
      }),
    );
    if (fill > 0) {
      // The food mound, taller when fuller, and a few kibbles on top.
      parts.push(
        part(new SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), FOOD, {
          y: 0.06,
          s: [0.3, 0.03 + 0.12 * fill, 0.3],
        }),
      );
      const rand = seededRandom(n);
      for (let i = 0; i < Math.ceil(fill * 6); i++) {
        const a = (i / 6) * Math.PI * 2 + rand();
        const r = 0.08 + rand() * 0.1;
        parts.push(
          part(new SphereGeometry(0.035, 7, 5), KIBBLE, {
            x: Math.cos(a) * r,
            y: 0.06 + (0.03 + 0.12 * fill) * (1 - (r / 0.3) ** 2) ** 0.5,
            z: Math.sin(a) * r,
          }),
        );
      }
    }
    return sceneryMesh(parts, { outline: OUTLINE, fade: false, shadows: true });
  });
}

// ---- Poop ---------------------------------------------------------------------------------------

/** A little swirl of poop with two wavy stink lines. */
export function poopMesh(): Mesh {
  return shared('poop', () => {
    const brown = 0x8b5a33;
    const parts: BufferGeometry[] = [
      part(new SphereGeometry(1, 16, 10), brown, { y: 0.06, s: [0.2, 0.08, 0.2] }),
      part(new SphereGeometry(1, 14, 9), brown, { y: 0.14, s: [0.15, 0.07, 0.15] }),
      part(new SphereGeometry(1, 12, 8), brown, { y: 0.21, x: 0.01, s: [0.09, 0.06, 0.09] }),
      // A little curl on top.
      part(new ConeGeometry(0.05, 0.08, 10), brown, { x: 0.02, y: 0.28, rz: -0.4 }),
      part(new SphereGeometry(0.03, 8, 6), 0xc7a283, {
        x: -0.07,
        y: 0.17,
        z: 0.1,
        s: [1, 0.6, 0.5],
      }),
    ];
    for (const x of [-0.14, 0.14]) {
      const curve = new CatmullRomCurve3(
        [0, 0.08, 0.16, 0.24].map((t, i) => new Vector3(x + (i % 2 ? 0.025 : -0.025), 0.3 + t, 0)),
      );
      parts.push(part(new TubeGeometry(curve, 12, 0.008, 5, false), 0x9a8a5a));
    }
    return sceneryMesh(parts, { outline: OUTLINE, fade: false, shadows: true });
  });
}

// ---- Finds --------------------------------------------------------------------------------------

/** The spinning, bobbing part of a find, and (for butterflies) its wings to flap. */
export interface FindModel {
  group: Group;
  wings?: [Group, Group];
}

export function findModel(kind: FindKind): FindModel {
  const group = new Group();
  switch (kind) {
    case 'coin': {
      const face = new CylinderGeometry(0.17, 0.17, 0.05, 24);
      face.rotateX(Math.PI / 2);
      const parts = [
        part(face, 0xf5b93a),
        part(new TorusGeometry(0.11, 0.012, 6, 24), 0xd99a1e, { z: 0.026 }),
        part(new TorusGeometry(0.11, 0.012, 6, 24), 0xd99a1e, { z: -0.026 }),
        part(new ConeGeometry(0.05, 0.02, 5), 0xfff3c4, { z: 0.03, rx: Math.PI / 2 }),
      ];
      group.add(shared('coin', () => sceneryMesh(parts, { outline: OUTLINE, fade: false })));
      return { group };
    }
    case 'clover': {
      group.add(
        shared('clover', () => {
          const parts: BufferGeometry[] = [];
          for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI * 2;
            // Each leaf is a little heart: two round lobes.
            for (const side of [-1, 1]) {
              const b = a + side * 0.26;
              parts.push(
                part(new SphereGeometry(1, 10, 7), 0x6cc05a, {
                  x: Math.cos(b) * 0.13,
                  z: Math.sin(b) * 0.13,
                  y: 0.02,
                  s: [0.07, 0.025, 0.07],
                }),
              );
            }
          }
          parts.push(part(new SphereGeometry(0.03, 8, 6), 0x8fd07a, { y: 0.035 }));
          const stem = new CatmullRomCurve3([
            new Vector3(0, 0, 0),
            new Vector3(0.03, -0.12, 0.04),
            new Vector3(0.08, -0.22, 0.08),
          ]);
          parts.push(part(new TubeGeometry(stem, 8, 0.012, 5, false), 0x5aa04a));
          // Standing up, facing the camera a little.
          const mesh = sceneryMesh(parts, { outline: OUTLINE, fade: false });
          mesh.rotation.x = 0.9;
          const holder = new Group();
          holder.add(mesh);
          return holder;
        }),
      );
      return { group };
    }
    case 'butterfly': {
      const body = shared('butterfly-body', () => {
        const parts = [
          part(new SphereGeometry(1, 10, 8), COLORS.outline, { s: [0.025, 0.1, 0.03] }),
          part(new CylinderGeometry(0.004, 0.004, 0.09, 4), COLORS.outline, {
            x: -0.03,
            y: 0.12,
            rz: 0.5,
          }),
          part(new CylinderGeometry(0.004, 0.004, 0.09, 4), COLORS.outline, {
            x: 0.03,
            y: 0.12,
            rz: -0.5,
          }),
        ];
        return new Mesh(merge(parts), toonMaterial());
      });
      group.add(body);
      const wing = (side: number) => {
        const g = new Group();
        const mesh = shared(`wing${side}`, () =>
          sceneryMesh(
            [
              part(new SphereGeometry(1, 12, 8), 0xff9fc4, {
                x: side * 0.1,
                y: 0.05,
                s: [0.1, 0.085, 0.012],
                rz: side * 0.35,
              }),
              part(new SphereGeometry(1, 10, 7), 0xb69bff, {
                x: side * 0.07,
                y: -0.06,
                s: [0.065, 0.055, 0.012],
              }),
              part(new SphereGeometry(0.025, 8, 6), 0xffffff, {
                x: side * 0.1,
                y: 0.06,
                z: 0.01,
                s: [1, 1, 0.4],
              }),
            ],
            { outline: 0.01, fade: false },
          ),
        );
        g.add(mesh);
        group.add(g);
        return g;
      };
      // Big enough to spot and tap, like the original's.
      group.scale.setScalar(1.7);
      return { group, wings: [wing(-1), wing(1)] };
    }
  }
}

// ---- Scoop Bot ----------------------------------------------------------------------------------

/** Scoop Bot: a friendly little cleaning robot on wheels, with a scoop. */
export function scoopBotMesh(): Mesh {
  return shared('scoopBot', () => {
    const shell = 0xbfd8e8;
    const parts: BufferGeometry[] = [
      part(new RoundedBoxGeometry(0.36, 0.26, 0.3, 3, 0.07), shell, { y: 0.2 }),
      part(new SphereGeometry(0.15, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0xe6f2fa, { y: 0.32 }),
      part(new RoundedBoxGeometry(0.22, 0.08, 0.04, 2, 0.02), COLORS.outline, { y: 0.4, z: 0.12 }),
      part(new SphereGeometry(0.022, 8, 6), 0x7ff0ff, { x: -0.05, y: 0.4, z: 0.145 }),
      part(new SphereGeometry(0.022, 8, 6), 0x7ff0ff, { x: 0.05, y: 0.4, z: 0.145 }),
      part(new CylinderGeometry(0.008, 0.008, 0.12, 5), COLORS.outline, { y: 0.52 }),
      part(new SphereGeometry(0.035, 10, 8), 0xff6f6f, { y: 0.59 }),
      // A scoop in front.
      part(new RoundedBoxGeometry(0.22, 0.03, 0.12, 2, 0.01), 0x9fd0a0, {
        y: 0.05,
        z: 0.2,
        rx: -0.2,
      }),
    ];
    for (const x of [-0.16, 0.16]) {
      const wheel = new CylinderGeometry(0.07, 0.07, 0.05, 14);
      wheel.rotateZ(Math.PI / 2);
      parts.push(part(wheel, 0x5d6170, { x, y: 0.07 }));
    }
    return sceneryMesh(parts, { outline: OUTLINE, fade: false, shadows: true });
  });
}
