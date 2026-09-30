import {
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RingGeometry,
  Sprite,
  SpriteMaterial,
  type Object3D,
  type Texture,
} from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { ParticleBudget } from '../../game/fx/budget';
import { MAX_PARTICLES } from '../../game/fx/effects';
import type { Point3 } from '../coords';
import styles from './fx.module.css';
import { heartShape, puffShape, starShape } from './textures';

const CONFETTI = [0xff8fc4, 0xffd84d, 0x8fd6ff, 0x9ff0c8, 0xb69bff, 0xff9f5a];

interface Live {
  start: number;
  duration: number;
  /** t runs 0..1 over the duration (after the start). */
  step(t: number): void;
  end(): void;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

/**
 * Short-lived celebrations in the 3D world, like the original's `Effects`: star bursts,
 * confetti, puffs, hearts, floating text, banners, tap ripples, and coins flying to the coin
 * counter. Particles share the original's cap (MAX_PARTICLES); extras are trimmed, never queued.
 * With reduced motion, everything fades in place.
 */
export class Effects3D {
  private readonly budget = new ParticleBudget(MAX_PARTICLES);
  private readonly live: Live[] = [];
  private readonly confettiGeo = new PlaneGeometry(0.09, 0.14);
  private readonly rippleGeo = new RingGeometry(0.15, 0.22, 32);
  private now = 0;

  constructor(
    /** Holds DOM effects (flying coins), over the canvas. */
    private readonly overlay: HTMLElement,
    private readonly reducedMotion: () => boolean,
  ) {}

  /** Particles alive right now (for the performance pass and tests). */
  get particleCount(): number {
    return this.budget.count;
  }

  update(now: number): void {
    this.now = now;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const item = this.live[i]!;
      if (now < item.start) continue;
      const t = Math.min(1, (now - item.start) / item.duration);
      item.step(t);
      if (t >= 1) {
        item.end();
        this.live.splice(i, 1);
      }
    }
  }

  dispose(): void {
    for (const item of this.live) item.end();
    this.live.length = 0;
    this.confettiGeo.dispose();
    this.rippleGeo.dispose();
  }

  private add(item: Omit<Live, 'start'>, delay = 0): void {
    this.live.push({ ...item, start: this.now + delay });
  }

  private sprite(parent: Object3D, map: Texture, color: number | string, size: number): Sprite {
    const s = new Sprite(
      new SpriteMaterial({ map, color: new Color(color), transparent: true, depthWrite: false }),
    );
    s.scale.setScalar(size);
    s.renderOrder = 5;
    parent.add(s);
    return s;
  }

  private free(obj: Sprite | Mesh, counted = true): void {
    obj.removeFromParent();
    (obj.material as SpriteMaterial | MeshBasicMaterial).dispose();
    if (counted) this.budget.release();
  }

  /** Stars bursting outward (reveal, birth, a clean-up sparkle). */
  burst(parent: Object3D, at: Point3, colors: readonly number[], count = 10): void {
    const still = this.reducedMotion();
    const n = this.budget.take(count);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const star = this.sprite(parent, starShape(), colors[i % colors.length] ?? 0xffffff, 0.2);
      const dist = still ? 0 : 0.6 + (i % 3) * 0.18;
      const up = (i % 2 ? 0.25 : -0.05) * (still ? 0 : 1);
      star.position.set(at.x, at.y, at.z);
      this.add({
        duration: 650,
        step: (t) => {
          const e = 1 - (1 - t) ** 3;
          star.position.set(
            at.x + Math.cos(a) * dist * e,
            at.y + up * e,
            at.z + Math.sin(a) * dist * e,
          );
          star.material.opacity = 1 - t;
          star.scale.setScalar(0.2 * (still ? 1 : 1 - 0.6 * e));
          star.material.rotation = t * 3;
        },
        end: () => this.free(star),
      });
    }
  }

  /** Paper confetti popping up and fluttering down (reveals, births, big moments). */
  confetti(parent: Object3D, at: Point3, count = 18): void {
    const still = this.reducedMotion();
    const n = this.budget.take(count);
    for (let i = 0; i < n; i++) {
      const piece = new Mesh(
        this.confettiGeo,
        new MeshBasicMaterial({
          color: CONFETTI[i % CONFETTI.length]!,
          side: DoubleSide,
          transparent: true,
        }),
      );
      piece.renderOrder = 5;
      parent.add(piece);
      const a = (i / n) * Math.PI * 2 + i;
      const spread = 0.6 + (i % 4) * 0.25;
      const peak = 0.9 + (i % 4) * 0.25;
      const spin = 6 + (i % 5);
      if (still)
        piece.position.set(
          at.x + ((i % 6) - 2.5) * 0.16,
          at.y + 0.2 + Math.floor(i / 6) * 0.14,
          at.z,
        );
      this.add({
        duration: still ? 900 : 1400,
        step: (t) => {
          if (!still) {
            // Up fast, then drifting down and out, tumbling.
            const up = t < 0.25 ? 1 - (1 - t / 0.25) ** 2 : 1 - ((t - 0.25) / 0.75) ** 1.4 * 1.6;
            piece.position.set(
              at.x + Math.cos(a) * spread * t,
              at.y + peak * up,
              at.z + Math.sin(a) * spread * t,
            );
            piece.rotation.set(t * spin, t * spin * 0.7, t * spin * 0.4);
          }
          piece.material.opacity = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
        },
        end: () => this.free(piece),
      });
    }
  }

  /** A soft puff of cloud (the mystery visitor turning into an animal). */
  puff(parent: Object3D, at: Point3): void {
    const still = this.reducedMotion();
    const n = this.budget.take(7);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const cloud = this.sprite(parent, puffShape(), 0xffffff, 0.45);
      this.add({
        duration: 600,
        step: (t) => {
          const e = 1 - (1 - t) ** 3;
          const r = 0.2 + (still ? 0 : 0.5 * e);
          cloud.position.set(at.x + Math.cos(a) * r, at.y + Math.sin(a) * r * 0.6, at.z + 0.1);
          cloud.scale.setScalar(0.45 * (still ? 1 : 1 + 0.6 * e));
          cloud.material.opacity = 0.9 * (1 - t);
        },
        end: () => this.free(cloud),
      });
    }
  }

  /** Hearts floating up (births, petting, treats). */
  hearts(parent: Object3D, at: Point3, count = 4): void {
    const still = this.reducedMotion();
    const n = this.budget.take(count);
    for (let i = 0; i < n; i++) {
      const heart = this.sprite(parent, heartShape(), 0xff6f9a, 0.26);
      const x = at.x + (i - (n - 1) / 2) * 0.22;
      heart.visible = false;
      this.add(
        {
          duration: 1100,
          step: (t) => {
            heart.visible = true;
            heart.position.set(
              x + (still ? 0 : Math.sin(t * 6 + i) * 0.05),
              at.y - i * 0.06 + (still ? 0 : 0.9 * t),
              at.z,
            );
            heart.material.opacity = 1 - t * t;
          },
          end: () => this.free(heart),
        },
        i * 90,
      );
    }
  }

  /** Text that rises and fades (e.g. "+45 🪙"). Text doesn't count toward the particle cap. */
  floatText(parent: Object3D, at: Point3, text: string, color: string, size = 30, delay = 0): void {
    const el = document.createElement('div');
    el.className = styles.float!;
    el.textContent = text;
    el.style.color = color;
    el.style.fontSize = `${size}px`;
    el.style.opacity = '0';
    const label = new CSS2DObject(el);
    label.position.set(at.x, at.y, at.z);
    parent.add(label);
    const still = this.reducedMotion();
    this.add(
      {
        duration: 1100,
        step: (t) => {
          label.position.y = at.y + (still ? 0 : 0.9 * (1 - (1 - t) ** 2));
          el.style.opacity = String(1 - t);
        },
        end: () => {
          label.removeFromParent();
          el.remove();
        },
      },
      delay,
    );
  }

  /** A big title that pops in and floats away ("✦ Sparkle! ✦", "Legendary!"). */
  banner(parent: Object3D, at: Point3, text: string, color: string): void {
    const el = document.createElement('div');
    el.className = styles.banner!;
    const inner = document.createElement('span');
    inner.textContent = text;
    el.append(inner);
    el.style.color = color;
    const label = new CSS2DObject(el);
    label.position.set(at.x, at.y, at.z);
    parent.add(label);
    const still = this.reducedMotion();
    this.add({
      duration: 1800,
      step: (t) => {
        if (still) {
          el.style.opacity = String(t < 0.67 ? 1 : 1 - (t - 0.67) / 0.33);
          return;
        }
        // Pop in (0.2 -> 1 with a little overshoot), hold, then rise and fade.
        const pop = Math.min(1, t / 0.21);
        const c = 1.70158;
        const s = 0.2 + 0.8 * (1 + (c + 1) * (pop - 1) ** 3 + c * (pop - 1) ** 2);
        inner.style.transform = `scale(${s})`;
        const out = Math.max(0, (t - 0.72) / 0.28);
        label.position.y = at.y + 0.5 * out;
        el.style.opacity = String(1 - out);
      },
      end: () => {
        label.removeFromParent();
        el.remove();
      },
    });
  }

  /** A ring on the ground where the player tapped. */
  ripple(parent: Object3D, at: Point3): void {
    const ring = new Mesh(
      this.rippleGeo,
      new MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(at.x, at.y + 0.03, at.z);
    parent.add(ring);
    const still = this.reducedMotion();
    this.add({
      duration: 450,
      step: (t) => {
        if (!still) ring.scale.setScalar(1 + t * 2.5);
        ring.material.opacity = 0.8 * (1 - t);
      },
      end: () => this.free(ring, false),
    });
  }

  /**
   * Coins that hop up from a spot on the screen and fly to the coin counter (sales, finds).
   * `from` and `to` are in the overlay's own CSS px.
   */
  coinShower(from: ScreenPoint, to: ScreenPoint, count = 8): void {
    const n = this.budget.take(count);
    const still = this.reducedMotion();
    for (let i = 0; i < n; i++) {
      const coin = document.createElement('div');
      coin.className = styles.coin!;
      coin.dataset.fx = 'coin';
      this.overlay.append(coin);
      const at = (x: number, y: number, s = 1) => `translate(${x}px, ${y}px) scale(${s})`;
      const finish = () => {
        coin.remove();
        this.budget.release();
      };
      if (still || typeof coin.animate !== 'function') {
        coin.style.transform = at(from.x, from.y);
        this.add({ duration: 700, step: (t) => (coin.style.opacity = String(1 - t)), end: finish });
        continue;
      }
      const dx = (i - (n - 1) / 2) * 16;
      const hop = { x: from.x + dx, y: from.y - 50 - (i % 3) * 14 };
      const total = 260 + i * 45 + 520;
      coin.style.transform = at(from.x, from.y);
      const animation = coin.animate(
        [
          { transform: at(from.x, from.y), easing: 'ease-out' },
          { transform: at(hop.x, hop.y), offset: 260 / total },
          { transform: at(hop.x, hop.y), offset: (260 + i * 45) / total, easing: 'ease-in' },
          { transform: at(to.x, to.y, 0.6) },
        ],
        { duration: total, fill: 'forwards' },
      );
      // Tracked like any other effect, so the budget frees even if the animation is dropped.
      this.add({
        duration: total + 50,
        step: () => {},
        end: () => {
          animation.cancel();
          finish();
        },
      });
    }
  }
}
