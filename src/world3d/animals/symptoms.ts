import {
  Group,
  Mesh,
  MeshToonMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  type Object3D,
} from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { SymptomFx } from '../../config/illnesses';
import { toonMaterial } from '../art/toon';
import fxStyles from '../fx/fx.module.css';
import { puffShape } from '../fx/textures';
import type { AnimalAnchors } from './model';

/**
 * Sickness looks in 3D (DESIGN 9.4 "visible symptoms"), like the original's `symptoms.ts`:
 * drawings placed on the animal's own face and body (from its model's anchors), a body motion
 * (sneeze squash, wobble, scratch, limp, sleepy breathing), and little words that drift up
 * ("achoo!", "~", "z"). With reduced motion everything stays still.
 */

/** Adjustments to the animal's pose this frame (added / multiplied by the actor). */
export interface SymptomMotion {
  x: number;
  y: number;
  rz: number;
  sx: number;
  sy: number;
}

const STILL: SymptomMotion = { x: 0, y: 0, rz: 0, sx: 1, sy: 1 };

export interface SymptomView {
  readonly kind: SymptomFx;
  update(now: number, reducedMotion: boolean): SymptomMotion;
  dispose(): void;
}

type V3 = readonly [number, number, number];

const ball = new SphereGeometry(1, 10, 7);
const materials = new Map<string, MeshToonMaterial>();
function mat(color: string): MeshToonMaterial {
  let m = materials.get(color);
  if (!m) {
    m = toonMaterial(color);
    materials.set(color, m);
  }
  return m;
}

function blob(parent: Object3D, color: string, at: V3, r: [number, number, number]): Mesh {
  const m = new Mesh(ball, mat(color));
  m.position.set(at[0], at[1], at[2]);
  m.scale.set(...r);
  m.raycast = () => {};
  parent.add(m);
  return m;
}

/** A word that drifts up from a spot and fades (a few at a time). */
class Puffs {
  private readonly live: { label: CSS2DObject; start: number; from: V3; dx: number }[] = [];

  constructor(private readonly parent: Object3D) {}

  add(now: number, at: V3, text: string, color: string, size: number, dx = 0): void {
    const el = document.createElement('div');
    el.className = fxStyles.float!;
    el.textContent = text;
    el.style.color = color;
    el.style.fontSize = `${size}px`;
    el.dataset.symptom = text;
    const label = new CSS2DObject(el);
    label.position.set(...at);
    this.parent.add(label);
    this.live.push({ label, start: now, from: at, dx });
  }

  update(now: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i]!;
      const t = (now - p.start) / 1300;
      if (t >= 1) {
        this.remove(i);
        continue;
      }
      const e = 1 - (1 - t) ** 2;
      p.label.position.set(p.from[0] + p.dx * e, p.from[1] + 0.36 * e, p.from[2]);
      p.label.element.style.opacity = String(1 - t);
    }
  }

  private remove(i: number): void {
    const [p] = this.live.splice(i, 1);
    p!.label.removeFromParent();
    p!.label.element.remove();
  }

  dispose(): void {
    while (this.live.length) this.remove(0);
  }
}

/** Fires `fn` every `ms` (not with reduced motion). */
function every(ms: number, fn: (now: number) => void) {
  let next = -1;
  return (now: number, still: boolean) => {
    if (still) return;
    if (next < 0) next = now + ms * 0.5;
    if (now >= next) {
      next = now + ms;
      fn(now);
    }
  };
}

/** A short move that plays once from `start` for `ms` (0..1 progress), or null when idle. */
function pulse(start: number, ms: number, now: number): number | null {
  const t = (now - start) / ms;
  return t >= 0 && t < 1 ? t : null;
}

/**
 * Builds the look for one illness on an animal. `layer` moves with the animal (its figure
 * space); `labels` is where drifting words go (the animal's root, so they don't spin).
 */
export function symptomView(
  kind: SymptomFx,
  a: AnimalAnchors,
  layer: Object3D,
  labels: Object3D,
): SymptomView {
  const group = new Group();
  group.name = `symptom-${kind}`;
  layer.add(group);
  const puffs = new Puffs(labels);
  const hr = a.head.radius;
  const [bx, by, bz] = a.body.center;
  const [rx, ry, rz] = a.body.radii;
  let staticWord: CSS2DObject | null = null;
  const still = (text: string, at: V3, color: string, size: number) => {
    if (staticWord) return;
    const el = document.createElement('div');
    el.className = fxStyles.float!;
    el.textContent = text;
    el.style.color = color;
    el.style.fontSize = `${size}px`;
    el.dataset.symptom = text;
    staticWord = new CSS2DObject(el);
    staticWord.position.set(...at);
    labels.add(staticWord);
  };
  const aboveHead: V3 = [hr * 0.9, a.head.center[1] + hr * 1.1, a.head.center[2]];
  let motion: (now: number, still: boolean) => SymptomMotion = () => STILL;
  let tick: (now: number, still: boolean) => void = () => {};
  let glow: Sprite | null = null;

  switch (kind) {
    case 'sneeze': {
      // A drippy nose, and a big sneeze every few seconds.
      const drip = blob(
        group,
        '#8fd6ff',
        [a.nose[0] + hr * 0.12, a.nose[1] - hr * 0.2, a.nose[2]],
        [hr * 0.07, hr * 0.11, hr * 0.07],
      );
      let sneezeAt = -Infinity;
      const sneeze = every(2600, (now) => {
        sneezeAt = now;
        puffs.add(
          now,
          [a.nose[0] + hr * 0.4, a.nose[1], a.nose[2] + hr * 0.3],
          'achoo!',
          '#4a90c0',
          14,
          0.25,
        );
      });
      tick = (now, s) => {
        sneeze(now, s);
        if (s) still('achoo!', [hr * 0.6, a.nose[1] + hr * 0.4, a.nose[2]], '#4a90c0', 14);
        drip.scale.y = hr * 0.11 * (s ? 1 : 1 + 0.3 * Math.sin(now / 350) ** 2);
      };
      motion = (now) => {
        const t = pulse(sneezeAt, 220, now);
        if (t === null) return STILL;
        const b = Math.sin(Math.PI * t);
        return { ...STILL, sy: 1 - 0.14 * b, sx: 1 + 0.08 * b };
      };
      break;
    }
    case 'wobble': {
      // Green cheeks and a rumbly, wobbly tummy.
      for (const c of a.cheeks) blob(group, '#7ccf6a', c, [hr * 0.15, hr * 0.12, hr * 0.06]);
      const rumble = every(3000, (now) =>
        puffs.add(now, [bx - rx * 1.1, by, bz + rz * 0.6], '~', '#6aa85a', 22, -0.14),
      );
      tick = rumble;
      motion = (now, s) =>
        s ? STILL : { ...STILL, rz: 0.07 * Math.sin((now / 520) * Math.PI * 2) };
      break;
    }
    case 'dots': {
      // Tiny bouncing dots in the fur, and a scratch now and then.
      const spots: V3[] = [
        [-rx * 0.6, by + ry * 0.3, bz + rz * 0.6],
        [rx * 0.4, by + ry * 0.5, bz + rz * 0.62],
        [rx * 0.75, by - ry * 0.1, bz + rz * 0.55],
        [-rx * 0.2, by - ry * 0.2, bz + rz * 0.95],
        [-hr * 0.55, a.head.center[1] + hr * 0.55, a.head.center[2] + hr * 0.6],
        [hr * 0.45, a.head.center[1] + hr * 0.7, a.head.center[2] + hr * 0.5],
      ];
      const dots = spots.map((at) => blob(group, '#3a2e28', at, [0.022, 0.022, 0.022]));
      let scratchAt = -Infinity;
      const scratch = every(2200, (now) => (scratchAt = now));
      tick = (now, s) => {
        scratch(now, s);
        dots.forEach((d, i) => {
          const base = spots[i]!;
          d.position.y = base[1] + (s ? 0 : 0.07 * Math.abs(Math.sin(now / (180 + i * 37))));
        });
      };
      motion = (now) => {
        const t = pulse(scratchAt, 500, now);
        return t === null ? STILL : { ...STILL, x: 0.03 * Math.sin(t * Math.PI * 10) };
      };
      break;
    }
    case 'limp': {
      // A sore paw (pink and puffy) and a limp.
      const [px, py, pz] = a.paw;
      blob(group, '#ff9fb5', [px, py + 0.02, pz], [0.1, 0.07, 0.11]);
      motion = (now, s) => {
        if (s) return { ...STILL, rz: -0.09 };
        const b = 0.5 - 0.5 * Math.cos((now / 840) * Math.PI * 2);
        return { ...STILL, rz: -0.1 * b, y: -0.03 * b };
      };
      break;
    }
    case 'spots': {
      // Red spots, and a warm glow.
      const spots: V3[] = [
        [-hr * 0.5, a.head.center[1] + hr * 0.45, a.head.center[2] + hr * 0.7],
        [hr * 0.42, a.head.center[1] + hr * 0.55, a.head.center[2] + hr * 0.65],
        [0, a.head.center[1] + hr * 0.8, a.head.center[2] + hr * 0.45],
        [-rx * 0.5, by + ry * 0.2, bz + rz * 0.82],
        [rx * 0.55, by + ry * 0.05, bz + rz * 0.8],
        [0.1 * rx, by - ry * 0.35, bz + rz * 0.9],
      ];
      for (const at of spots) blob(group, '#ff5a5a', at, [0.03, 0.03, 0.018]);
      glow = new Sprite(
        new SpriteMaterial({
          map: puffShape(),
          color: 0xff7a5a,
          transparent: true,
          depthWrite: false,
          opacity: 0.18,
        }),
      );
      glow.position.set(0, (a.head.center[1] + hr) / 2, 0);
      glow.scale.setScalar((a.head.center[1] + hr) * 1.5);
      glow.renderOrder = -1;
      group.add(glow);
      tick = (now, s) => {
        glow!.material.opacity = s
          ? 0.18
          : 0.12 + 0.16 * (0.5 - 0.5 * Math.cos((now / 1600) * Math.PI * 2));
      };
      break;
    }
    case 'zzz': {
      // Sleepy: heavy eyelids, slow breathing, and floating Zzz.
      for (const [x, y, z] of a.eyes)
        blob(group, '#4a3b33', [x, y + hr * 0.08, z + 0.01], [hr * 0.17, hr * 0.06, 0.02]);
      const snore = every(1400, (now) => puffs.add(now, aboveHead, 'z', '#6d6aa8', 18, 0.14));
      tick = (now, s) => {
        snore(now, s);
        if (s) still('z z', aboveHead, '#6d6aa8', 18);
      };
      motion = (now, s) =>
        s ? STILL : { ...STILL, sy: 1 - 0.05 * (0.5 - 0.5 * Math.cos((now / 3200) * Math.PI * 2)) };
      break;
    }
  }

  return {
    kind,
    update(now, reducedMotion) {
      tick(now, reducedMotion);
      puffs.update(now);
      return motion(now, reducedMotion);
    },
    dispose() {
      puffs.dispose();
      if (staticWord) {
        staticWord.removeFromParent();
        staticWord.element.remove();
      }
      glow?.material.dispose();
      group.removeFromParent();
    },
  };
}
