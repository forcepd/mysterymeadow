import { Color, type BufferGeometry } from 'three';
import { describe, expect, it } from 'vitest';
import { paintFor } from '../../../src/art/animalSvg';
import { SPECIES } from '../../../src/config/species';
import type { TrickMove } from '../../../src/config/tricks';
import { animalModel, mysteryModel } from '../../../src/world3d/animals/model';
import {
  AMBLE_RADIUS,
  ambleSpot,
  breath,
  HOP_HEIGHT,
  MAX_WALK_MS,
  MIN_WALK_MS,
  nextAmble,
  REST,
  TRICK_MS,
  trickPose,
  turnToward,
  WALK_SPEED,
  Walker,
} from '../../../src/world3d/animals/motion';
import { seededRandom } from '../../../src/world3d/art/toon';

const EYE = new Color('#2e2420');

function hasColor(g: BufferGeometry, color: Color): number[] {
  const c = g.getAttribute('color');
  const pos = g.getAttribute('position');
  const zs: number[] = [];
  for (let i = 0; i < c.count; i++) {
    if (
      Math.abs(c.getX(i) - color.r) < 1e-4 &&
      Math.abs(c.getY(i) - color.g) < 1e-4 &&
      Math.abs(c.getZ(i) - color.b) < 1e-4
    ) {
      zs.push(pos.getZ(i));
    }
  }
  return zs;
}

const triangles = (g: BufferGeometry) => g.getAttribute('position').count / 3;

describe('3D animal models', () => {
  const all = SPECIES.flatMap((s) =>
    s.variants.flatMap((v) => [false, true].map((sparkle) => ({ s, v, sparkle }))),
  );

  it('builds every species, color and Sparkle, standing on the ground at a sensible size', () => {
    for (const { s, v, sparkle } of all) {
      const m = animalModel(s.id, v.id, sparkle);
      const box = m.geometry.boundingBox!;
      const what = `${s.id}/${v.id}${sparkle ? '/sparkle' : ''}`;
      expect(box.min.y, `${what} feet`).toBeGreaterThanOrEqual(-0.02);
      expect(box.min.y, `${what} feet`).toBeLessThan(0.06);
      expect(m.height, `${what} height`).toBeGreaterThan(0.55);
      expect(m.height, `${what} height`).toBeLessThan(1.5);
      expect(m.radius, `${what} reach`).toBeLessThan(0.85);
    }
  });

  it('stays light enough for the iPad (triangles per animal)', () => {
    const most = Math.max(...all.map(({ s, v }) => triangles(animalModel(s.id, v.id).geometry)));
    expect(most).toBeLessThan(7000);
  });

  it('faces the front (+z): the eyes are on the front of the model', () => {
    for (const s of SPECIES) {
      const m = animalModel(s.id, s.variants[0]!.id);
      const eyes = hasColor(m.geometry, EYE);
      expect(eyes.length, `${s.id} has eyes`).toBeGreaterThan(0);
      const avg = eyes.reduce((a, b) => a + b, 0) / eyes.length;
      expect(avg, `${s.id} eyes in front`).toBeGreaterThan(0.1);
    }
  });

  it("is painted in the variant's colors (lighter for Sparkle)", () => {
    for (const s of SPECIES) {
      for (const v of s.variants) {
        for (const sparkle of [false, true]) {
          const main = new Color(paintFor(v.colors, sparkle, false).main);
          const found = hasColor(animalModel(s.id, v.id, sparkle).geometry, main);
          expect(found.length, `${s.id}/${v.id} main color`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('gives every species its own shape', () => {
    const shapes = new Set(
      SPECIES.map((s) => {
        const m = animalModel(s.id, s.variants[0]!.id);
        return `${m.geometry.getAttribute('position').count}|${m.height.toFixed(3)}`;
      }),
    );
    expect(shapes.size).toBe(SPECIES.length);
  });

  it('shares one model per look, and falls back to the bunny for unknown species', () => {
    expect(animalModel('fox', 'red')).toBe(animalModel('fox', 'red'));
    expect(animalModel('fox', 'red', true)).not.toBe(animalModel('fox', 'red'));
    expect(() => animalModel('nope', 'nope')).not.toThrow();
    expect(animalModel('nope', 'nope').height).toBeGreaterThan(0.5);
  });

  it('the mystery visitor is a faceless silhouette in one color', () => {
    const m = mysteryModel();
    expect(hasColor(m.geometry, EYE)).toEqual([]);
    const silhouette = hasColor(m.geometry, new Color('#4b4560'));
    expect(silhouette.length).toBe(m.geometry.getAttribute('position').count);
    expect(m.outline.getAttribute('position').count).toBeGreaterThan(0);
  });
});

describe('animal motion', () => {
  it('walks at the original speed, never too quick or too slow, then stops at the target', () => {
    const w = new Walker({ x: 0, z: 0 });
    let done = 0;
    w.walkTo({ x: 1.1, z: 0 }, 1000, false, () => done++);
    expect(w.walking).toBe(true);
    w.update(1500);
    expect(w.pos.x).toBeGreaterThan(0);
    expect(w.pos.x).toBeLessThan(1.1);
    expect(w.update(2000)).toBe(0); // 1.1 units at 1.1 u/s = 1 s
    expect(w.pos).toEqual({ x: 1.1, z: 0 });
    expect(w.walking).toBe(false);
    w.update(3000);
    expect(done).toBe(1);

    // Short hops take at least MIN_WALK_MS; long trips are capped at MAX_WALK_MS.
    const short = new Walker({ x: 0, z: 0 });
    short.walkTo({ x: 0.01, z: 0 }, 0);
    short.update(MIN_WALK_MS - 1);
    expect(short.walking).toBe(true);
    const far = new Walker({ x: 0, z: 0 });
    far.walkTo({ x: WALK_SPEED * 10, z: 0 }, 0);
    far.update(MAX_WALK_MS);
    expect(far.walking).toBe(false);
  });

  it('hops while walking (never higher than a hop), and not at all when standing', () => {
    const w = new Walker({ x: 0, z: 0 });
    expect(w.update(0)).toBe(0);
    w.walkTo({ x: 2, z: 0 }, 0);
    let top = 0;
    for (let t = 0; t < 1800; t += 10) top = Math.max(top, w.update(t));
    expect(top).toBeGreaterThan(HOP_HEIGHT * 0.9);
    expect(top).toBeLessThanOrEqual(HOP_HEIGHT);
  });

  it('with reduced motion (instant), jumps straight there', () => {
    const w = new Walker({ x: 0, z: 0 });
    let done = false;
    w.walkTo({ x: 3, z: 1 }, 0, true, () => (done = true));
    expect(w.pos).toEqual({ x: 3, z: 1 });
    expect(done).toBe(true);
  });

  it('a walk that starts later waits in place without hopping', () => {
    const w = new Walker({ x: 0, z: 0 });
    w.walkTo({ x: 1, z: 0 }, 1000);
    expect(w.update(500)).toBe(0);
    expect(w.pos).toEqual({ x: 0, z: 0 });
  });

  it('faces where it walks', () => {
    const w = new Walker({ x: 0, z: 0 });
    expect(w.heading()).toBeNull();
    w.walkTo({ x: 1, z: 0 }, 0);
    expect(w.heading()).toBeCloseTo(Math.PI / 2);
    w.walkTo({ x: w.pos.x, z: 5 }, 0);
    expect(w.heading()).toBeCloseTo(0);
  });

  it('ambles near home, now and then', () => {
    const rand = seededRandom(1);
    const home = { x: 2, z: -1 };
    for (let i = 0; i < 200; i++) {
      const p = ambleSpot(home, rand);
      expect(Math.hypot(p.x - home.x, (p.z - home.z) / 0.6)).toBeLessThanOrEqual(
        AMBLE_RADIUS + 1e-9,
      );
      const next = nextAmble(1000, rand);
      expect(next).toBeGreaterThanOrEqual(3500);
      expect(next).toBeLessThanOrEqual(7500);
    }
  });

  it('breathes gently', () => {
    for (let t = 0; t < 3000; t += 50) {
      expect(breath(t, 2400)).toBeGreaterThanOrEqual(1);
      expect(breath(t, 2400)).toBeLessThanOrEqual(1.05);
    }
  });

  it('turns the short way around', () => {
    expect(turnToward(0, 1, 0.5)).toBeCloseTo(0.5);
    // From just below +PI to just above -PI is a small step, not most of a circle.
    const from = Math.PI - 0.1;
    const to = -Math.PI + 0.1;
    expect(turnToward(from, to, 1) - from).toBeCloseTo(0.2);
    expect(turnToward(0, 1, 5)).toBeCloseTo(1);
  });

  it('every trick starts and ends at rest', () => {
    for (const move of Object.keys(TRICK_MS) as TrickMove[]) {
      for (const t of [0, TRICK_MS[move]]) {
        const p = trickPose(move, t);
        for (const key of Object.keys(REST) as (keyof typeof REST)[]) {
          const want = REST[key];
          // A full spin or roll ends facing the same way.
          const got = key === 'ry' || key === 'rz' ? Math.cos(p[key]) : p[key];
          expect(got, `${move} ${key} at ${t}`).toBeCloseTo(
            key === 'ry' || key === 'rz' ? 1 : want,
            3,
          );
        }
      }
      // ...and actually moves in between.
      const mid = trickPose(move, TRICK_MS[move] * 0.4);
      expect(JSON.stringify(mid)).not.toBe(JSON.stringify(REST));
    }
  });
});
