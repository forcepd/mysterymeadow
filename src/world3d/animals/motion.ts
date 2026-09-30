import type { TrickMove } from '../../config/tricks';
import type { GroundPoint } from '../coords';

/**
 * How animals move (render only, like the original's tweens): walking with a hop, ambling
 * around their home spot, breathing, turning to face where they go, and trick moves. Pure: no
 * Three.js objects, so it's unit-tested directly.
 */

/** The original's walking speed (110 world px/s) in ground units. */
export const WALK_SPEED = 1.1;
/** Walks take at least this long, and long trips speed up to never take more (ms). */
export const MIN_WALK_MS = 250;
export const MAX_WALK_MS = 2500;
/** Ambling stays this close to home (the original's 30 px), a bit less front-to-back. */
export const AMBLE_RADIUS = 0.3;
/** Hop-walk: 10 px up and back every 320 ms. */
export const HOP_HEIGHT = 0.1;
export const HOP_MS = 320;

const easeInOut = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * t);

interface Walk {
  from: GroundPoint;
  to: GroundPoint;
  start: number;
  duration: number;
  onDone: (() => void) | undefined;
}

/** Where an animal is on the ground, and its current walk (if any). */
export class Walker {
  pos: GroundPoint;
  private walk: Walk | null = null;

  constructor(
    start: GroundPoint,
    /** Walking speed and trip times (the avatar walks faster than the animals). */
    private readonly pace = { speed: WALK_SPEED, minMs: MIN_WALK_MS, maxMs: MAX_WALK_MS },
  ) {
    this.pos = { ...start };
  }

  get walking(): boolean {
    return this.walk !== null;
  }

  /** Where it's heading (its position when standing). */
  get destination(): GroundPoint {
    return this.walk ? this.walk.to : this.pos;
  }

  /** Starts a walk from where it is now. `instant` (reduced motion) jumps there. */
  walkTo(to: GroundPoint, now: number, instant = false, onDone?: () => void): void {
    this.walk = null;
    const dist = Math.hypot(to.x - this.pos.x, to.z - this.pos.z);
    if (instant || dist < 1e-4) {
      this.pos = { ...to };
      onDone?.();
      return;
    }
    const { speed, minMs, maxMs } = this.pace;
    const duration = Math.min(maxMs, Math.max(minMs, (dist / speed) * 1000));
    this.walk = { from: { ...this.pos }, to: { ...to }, start: now, duration, onDone };
  }

  stop(): void {
    this.walk = null;
  }

  /** Moves along the walk. Returns the hop height (0 when standing). */
  update(now: number): number {
    const w = this.walk;
    if (!w || now < w.start) return 0;
    const t = Math.min(1, (now - w.start) / w.duration);
    const e = easeInOut(t);
    this.pos = { x: w.from.x + (w.to.x - w.from.x) * e, z: w.from.z + (w.to.z - w.from.z) * e };
    if (t >= 1) {
      this.walk = null;
      w.onDone?.();
      return 0;
    }
    return hopHeight(now - w.start);
  }

  /** The direction it's walking, as a yaw (0 = facing +z), or null when standing. */
  heading(): number | null {
    const w = this.walk;
    if (!w) return null;
    const dx = w.to.x - w.from.x;
    const dz = w.to.z - w.from.z;
    if (Math.hypot(dx, dz) < 0.02) return null;
    return Math.atan2(dx, dz);
  }
}

/** Height of the hop-walk `elapsed` ms into a walk. */
export function hopHeight(elapsed: number): number {
  return HOP_HEIGHT * Math.abs(Math.sin((Math.PI * elapsed) / HOP_MS));
}

/** A random spot near home to amble to (`random` returns 0..1). */
export function ambleSpot(home: GroundPoint, random: () => number): GroundPoint {
  const a = random() * Math.PI * 2;
  const r = random() * AMBLE_RADIUS;
  return { x: home.x + Math.cos(a) * r, z: home.z + Math.sin(a) * r * 0.6 };
}

/** The next time to amble: 2.5–6.5 s from now, like the original. */
export function nextAmble(now: number, random: () => number): number {
  return now + 2500 + random() * 4000;
}

/** Breathing: a gentle up-and-down stretch (scale Y), about 1.1–1.5 s each way. */
export function breath(now: number, periodMs: number): number {
  return 1 + 0.025 * (1 - Math.cos((2 * Math.PI * now) / periodMs));
}

/** Turns `from` toward `to` (radians) by a fraction, the short way around. */
export function turnToward(from: number, to: number, fraction: number): number {
  const twoPi = Math.PI * 2;
  let d = (to - from) % twoPi;
  if (d > Math.PI) d -= twoPi;
  if (d < -Math.PI) d += twoPi;
  return from + d * Math.min(1, Math.max(0, fraction));
}

// ---- Tricks ---------------------------------------------------------------------------------

/** A pose offset (added to the resting pose); rotations in radians, `s` scales. */
export interface Pose {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
  sx: number;
  sy: number;
}

export const REST: Pose = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1 };

/** How long each trick move lasts (ms). */
export const TRICK_MS: Record<TrickMove, number> = {
  sit: 1020,
  spin: 700,
  highFive: 900,
  roll: 900,
  jump: 830,
  dance: 1200,
  wave: 1000,
  fetch: 1150,
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const bump = (t: number) => Math.sin(Math.PI * clamp01(t));

/**
 * The pose `elapsed` ms into a trick move (forward = +z in the animal's own space). Every move
 * starts and ends at rest. Moves follow the original's, with a real spin and roll in 3D.
 */
export function trickPose(move: TrickMove, elapsed: number): Pose {
  const t = clamp01(elapsed / TRICK_MS[move]);
  const p = { ...REST };
  switch (move) {
    case 'sit': {
      // Squish down onto its bottom, hold, pop back up.
      const down = t < 0.25 ? t / 0.25 : t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25;
      p.sy = lerp(1, 0.75, down);
      p.sx = lerp(1, 1.1, down);
      p.rx = -0.25 * down;
      break;
    }
    case 'spin':
      p.ry = Math.PI * 2 * easeInOut(t);
      p.y = 0.06 * bump(t);
      break;
    case 'highFive':
      // Leans back and reaches up, then a happy bounce.
      p.rx = -0.4 * bump(t / 0.6);
      p.y = 0.14 * bump(t / 0.6) + (t > 0.7 ? 0.16 * bump((t - 0.7) / 0.3) : 0);
      p.sy = 1 + 0.1 * bump(t / 0.6);
      break;
    case 'roll':
      p.rz = Math.PI * 2 * easeInOut(clamp01(t / 0.8));
      p.y = 0.15 * bump(t / 0.8) + (t > 0.8 ? 0.08 * bump((t - 0.8) / 0.2) : 0);
      break;
    case 'jump': {
      // Crouch (squash), launch (stretch), land (squash), settle.
      if (t < 0.2) {
        const c = t / 0.2;
        p.sy = lerp(1, 0.8, c);
        p.sx = lerp(1, 1.12, c);
      } else if (t < 0.85) {
        const a = (t - 0.2) / 0.65;
        p.y = 0.8 * bump(a);
        p.sy = lerp(1.15, 1, a);
        p.sx = lerp(0.9, 1, a);
      } else {
        const l = bump((t - 0.85) / 0.15);
        p.sy = 1 - 0.15 * l;
        p.sx = 1 + 0.1 * l;
      }
      break;
    }
    case 'dance': {
      // Side to side little hops.
      const beat = t * 4;
      const dir = Math.floor(beat) % 2 ? 1 : -1;
      const b = bump(beat % 1);
      p.x = dir * 0.14 * b;
      p.y = 0.14 * b;
      p.rz = -dir * 0.18 * b;
      break;
    }
    case 'wave':
      p.rz = 0.2 * Math.sin(t * Math.PI * 5) * bump(t);
      p.y = 0.03 * bump(t);
      break;
    case 'fetch': {
      // Dashes forward, bounces, trots back proudly.
      const out = t < 0.3 ? easeInOut(t / 0.3) : t < 0.45 ? 1 : 1 - easeInOut((t - 0.45) / 0.55);
      p.z = 0.7 * out;
      p.y = 0.16 * bump((t - 0.3) / 0.15) + 0.12 * bump((t - 0.75) / 0.2);
      break;
    }
  }
  return p;
}
