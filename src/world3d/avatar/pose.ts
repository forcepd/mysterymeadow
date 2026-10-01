/**
 * The avatar's body language (pure, so it's unit-tested): a walk cycle with swinging legs and
 * arms, a gentle idle, and sitting down on a seat. Angles are radians around the hips and
 * shoulders (positive = swinging backward), `bob` lifts the body, `sway` tips it side to side.
 */

export interface AvatarPose {
  legL: number;
  legR: number;
  armL: number;
  armR: number;
  bob: number;
  sway: number;
}

export const STANDING: AvatarPose = { legL: 0, legR: 0, armL: 0, armR: 0, bob: 0, sway: 0 };

/** How far the walk cycle moves per unit walked (a full stride about every 0.75 units). */
export const STRIDE = (Math.PI * 2) / 0.75;
const LEG_SWING = 0.7;
const ARM_SWING = 0.65;

/**
 * Walking: each leg swings opposite the other, each arm opposite its leg (like a real walk),
 * the body bobs up twice per stride and sways a little. `amount` (0..1) eases in and out.
 */
export function walkPose(phase: number, amount: number): AvatarPose {
  const s = Math.sin(phase);
  return {
    legL: LEG_SWING * s * amount,
    legR: -LEG_SWING * s * amount,
    armL: -ARM_SWING * s * amount,
    armR: ARM_SWING * s * amount,
    bob: 0.04 * Math.abs(Math.cos(phase)) * amount,
    sway: 0.05 * s * amount,
  };
}

/** Standing still: breathing, arms drifting just a little. */
export function idlePose(now: number): AvatarPose {
  const t = now / 1000;
  return {
    ...STANDING,
    armL: 0.05 * Math.sin(t * 1.3),
    armR: -0.05 * Math.sin(t * 1.3 + 0.6),
    bob: 0.008 * Math.sin(t * 2.2),
  };
}

/** Sitting `t` of the way down (0 standing .. 1 seated): legs out in front, hands in the lap. */
export function sitPose(t: number): AvatarPose {
  const k = Math.min(1, Math.max(0, t));
  return {
    ...STANDING,
    legL: -(Math.PI / 2) * k,
    legR: -(Math.PI / 2) * k,
    armL: -0.45 * k,
    armR: -0.45 * k,
  };
}

/** Mixes two poses (a = 0 .. b = 1). */
export function mixPose(a: AvatarPose, b: AvatarPose, t: number): AvatarPose {
  const m = (x: number, y: number) => x + (y - x) * t;
  return {
    legL: m(a.legL, b.legL),
    legR: m(a.legR, b.legR),
    armL: m(a.armL, b.armL),
    armR: m(a.armR, b.armR),
    bob: m(a.bob, b.bob),
    sway: m(a.sway, b.sway),
  };
}

/** Easing for sitting down and standing up. */
export function ease(t: number): number {
  const k = Math.min(1, Math.max(0, t));
  return k * k * (3 - 2 * k);
}
