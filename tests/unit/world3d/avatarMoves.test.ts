import { Box3 } from 'three';
import { describe, expect, it } from 'vitest';
import { DEFAULT_LOADOUT } from '../../../src/profile/avatar';
import { AvatarActor, type Seat } from '../../../src/world3d/avatar/AvatarActor';
import { avatarMesh, avatarRig } from '../../../src/world3d/avatar/avatarModel';
import { ease, idlePose, mixPose, sitPose, walkPose } from '../../../src/world3d/avatar/pose';
import { seatsFor } from '../../../src/world3d/items/itemModels';

const count = (m: { geometry: { getAttribute(n: string): { count: number } } }) =>
  m.geometry.getAttribute('position').count;

describe('the avatar rig', () => {
  const rig = avatarRig(DEFAULT_LOADOUT);

  it('has a body, two legs and two arms, hung from hips and shoulders on each side', () => {
    expect(Object.keys(rig.meshes).sort()).toEqual(['armL', 'armR', 'body', 'legL', 'legR']);
    const { legL, legR, armL, armR, hipY } = rig.pivots;
    expect(legL[0]).toBeCloseTo(-legR[0]);
    expect(armL[0]).toBeCloseTo(-armR[0]);
    expect(legL[1]).toBeCloseTo(hipY);
    expect(armL[1]).toBeGreaterThan(hipY);
  });

  it('keeps every piece of the avatar (the rig adds up to the whole avatar)', () => {
    const total = Object.values(rig.meshes).reduce((n, m) => n + count(m!), 0);
    expect(total).toBe(count(avatarMesh(DEFAULT_LOADOUT)));
  });

  it('puts the legs (with shoes) below the hips, and the arms (with hands) at the sides', () => {
    const box = (m: { geometry: { getAttribute(n: string): unknown } }) =>
      new Box3().setFromBufferAttribute(m.geometry.getAttribute('position') as never);
    const hip = rig.pivots.hipY;
    // (The leg's rounded top tucks up into the hips a little.)
    expect(box(rig.meshes.legL!).max.y).toBeLessThan(hip + 0.08);
    expect(box(rig.meshes.legL!).min.y).toBeLessThan(0.02); // shoes reach the ground
    expect(box(rig.meshes.armR!).min.x).toBeGreaterThan(0.1);
    expect(box(rig.meshes.armL!).max.x).toBeLessThan(-0.1);
  });
});

describe('avatar poses', () => {
  it('walks with each leg opposite the other, and each arm opposite its leg', () => {
    for (const phase of [0.5, 1.2, 2.5, 4]) {
      const p = walkPose(phase, 1);
      expect(p.legL).toBeCloseTo(-p.legR);
      expect(Math.sign(p.armL)).toBe(-Math.sign(p.legL));
    }
    // A real stride: the legs swing well apart at the top of the cycle.
    expect(walkPose(Math.PI / 2, 1).legL).toBeGreaterThan(0.5);
  });

  it('eases in: no swing when not walking', () => {
    for (const v of Object.values(walkPose(1, 0))) expect(v).toBeCloseTo(0);
  });

  it('sits with the legs straight out in front and hands in the lap', () => {
    const p = sitPose(1);
    expect(p.legL).toBeCloseTo(-Math.PI / 2);
    expect(p.legR).toBeCloseTo(-Math.PI / 2);
    expect(p.armL).toBeLessThan(0);
    for (const v of Object.values(sitPose(0))) expect(v).toBeCloseTo(0);
  });

  it('mixes poses and eases smoothly', () => {
    const a = idlePose(0);
    const b = sitPose(1);
    expect(mixPose(a, b, 0)).toEqual(a);
    expect(mixPose(a, b, 1).legL).toBeCloseTo(b.legL);
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(0.5)).toBeCloseTo(0.5);
  });
});

describe('seats', () => {
  it('the armchair seats one and the sofa two, on their cushions; nothing else is a seat', () => {
    const chair = seatsFor('armchair', 1.2, 0.7, 1);
    const sofa = seatsFor('sofa', 2.4, 0.7, 1);
    expect(chair).toHaveLength(1);
    expect(sofa).toHaveLength(2);
    expect(sofa[0]!.x).toBeLessThan(0);
    expect(sofa[1]!.x).toBeGreaterThan(0);
    for (const s of [...chair, ...sofa]) {
      expect(s.y).toBeCloseTo(0.37);
      expect(Math.abs(s.z)).toBeLessThan(0.35);
    }
    expect(seatsFor('side_table', 1, 1, 1)).toEqual([]);
    expect(seatsFor('bed_basic', 1, 1, 1)).toEqual([]);
  });
});

describe('the avatar sitting down and getting up', () => {
  const seat: Seat = { key: 'chair:0', x: 1, y: 0.4, z: -0.5, yaw: 0 };
  const frame = (actor: AvatarActor, now: number, seats?: (k: string) => Seat | null) =>
    actor.update({ now, dt: 1 / 60, reducedMotion: false, cameraYaw: 0 }, seats);

  function seated() {
    const actor = new AvatarActor('house', { x: 640, y: 690 });
    actor.setLoadout(DEFAULT_LOADOUT);
    actor.sitOn(seat, 0, false);
    for (let t = 0; t <= 4000; t += 16) frame(actor, t, () => seat);
    return actor;
  }

  it('walks up to the seat, turns round and sits on it', () => {
    const actor = seated();
    const s = actor.state;
    expect(s.sitting).toBe(true);
    expect(s.seat).toBe('chair:0');
    // Hips on the seat, sunk down to its height.
    expect(actor.root.position.x).toBeCloseTo(seat.x);
    expect(actor.root.position.z).toBeCloseTo(seat.z);
    expect(actor.root.position.y).toBeLessThan(0.05);
  });

  it('gets up and walks off at the next tap', () => {
    const actor = seated();
    actor.walkToward({ x: -2, z: 1 }, 5000, false);
    frame(actor, 5016, () => seat);
    expect(actor.state.sitting).toBe(false);
    expect(actor.state.walking).toBe(true);
    expect(actor.root.position.y).toBe(0);
  });

  it('stands up if its seat is moved or put away', () => {
    const actor = seated();
    frame(actor, 5000, () => ({ ...seat, x: 2 }));
    expect(actor.state.sitting).toBe(false);
    const again = seated();
    frame(again, 5000, () => null);
    expect(again.state.sitting).toBe(false);
  });

  it('with reduced motion, it just appears seated (no animation)', () => {
    const actor = new AvatarActor('house', { x: 640, y: 690 });
    actor.setLoadout(DEFAULT_LOADOUT);
    actor.sitOn(seat, 0, true);
    actor.update({ now: 0, dt: 1 / 60, reducedMotion: true, cameraYaw: 0 }, () => seat);
    expect(actor.state.sitting).toBe(true);
  });
});
