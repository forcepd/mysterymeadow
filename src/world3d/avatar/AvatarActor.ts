import { Group, Mesh } from 'three';
import { avatarKey } from '../../art/avatarSvg';
import { gridArea, type Rect } from '../../game/layout';
import type { AvatarLoadout } from '../../profile/avatar';
import type { FrameContext } from '../animals/AnimalActor';
import { animalMaterials } from '../animals/materials';
import { turnToward, Walker } from '../animals/motion';
import { toUnits, worldToGround, type GroundPoint, type ViewZone } from '../coords';
import { avatarRig, type Limb, type RigPivots } from './avatarModel';
import { ease, idlePose, mixPose, sitPose, STRIDE, walkPose, type AvatarPose } from './pose';

/** The original's avatar pace: 260 world px/s, trips up to 1.8 s. */
const PACE = { speed: 2.6, minMs: 200, maxMs: 1800 };
/** How far to the side of a tapped spot the avatar stops (the original's 85 px). */
const STAND_BESIDE = 0.85;
/** Stand this far in front of a seat before turning round and sitting down. */
const SEAT_APPROACH = 0.5;
const SIT_MS = 450;

/** A place to sit: where the hips go, and which way the seat faces. */
export interface Seat {
  /** An id for the seat (its item and which cushion), to notice when it moves or goes away. */
  key: string;
  x: number;
  y: number;
  z: number;
  /** The way the seat faces (0 = +z). */
  yaw: number;
}

/** Sitting on a seat (`start` < 0 until the sitting-down animation begins). */
type Sitting = { seat: Seat; from: GroundPoint; start: number; down: boolean };

/**
 * The player's avatar in the 3D world (DESIGN 13.3): walks toward wherever the player taps,
 * stopping beside the spot, with a real walk (legs and arms swinging). In the house it can sit
 * on the armchair and the sofa: it walks up, turns round and sits; the next tap elsewhere gets
 * it up again. Just for flavor: it never takes taps. Hidden while decorating, like the original.
 */
export class AvatarActor {
  readonly root = new Group();
  private readonly turn = new Group();
  /** The body, which bobs and sways. Legs and arms hang from it at their pivots. */
  private readonly figure = new Group();
  private readonly limbs: Record<Exclude<Limb, 'body'>, Group> = {
    legL: new Group(),
    legR: new Group(),
    armL: new Group(),
    armR: new Group(),
  };
  private pivots: RigPivots | null = null;
  private key = '';
  private readonly walker: Walker;
  private yaw = 0;
  private phase = 0;
  /** How much of the walk cycle shows (eases in and out). */
  private walking = 0;
  private last: GroundPoint;
  private sitting: Sitting | null = null;
  /** Where it's heading to sit (it walks there first). */
  private pendingSeat: Seat | null = null;
  private readonly bounds: { minX: number; maxX: number; minZ: number; maxZ: number };

  constructor(zone: ViewZone, door: { x: number; y: number }) {
    const area: Rect = gridArea(zone);
    const a = worldToGround({ x: area.x, y: area.y });
    const b = worldToGround({ x: area.x + area.w, y: area.y + area.h });
    this.bounds = { minX: a.x, maxX: b.x, minZ: a.z, maxZ: b.z };
    // Starts beside its zone's door.
    const d = worldToGround(door);
    const start = this.clamp({ x: d.x + toUnits(90), z: d.z + toUnits(30) });
    this.walker = new Walker(start, PACE);
    this.last = { ...start };
    const shadow = new Mesh(animalMaterials().shadowGeo, animalMaterials().shadow);
    shadow.scale.setScalar(0.3);
    shadow.position.y = 0.012;
    shadow.raycast = () => {};
    this.figure.add(...Object.values(this.limbs));
    this.turn.add(this.figure);
    this.root.add(this.turn, shadow);
    this.root.name = 'avatar';
  }

  /** Where it is and what it's doing (for tests). */
  get state(): { x: number; z: number; walking: boolean; sitting: boolean; seat: string | null } {
    const p = this.walker.pos;
    return {
      x: p.x,
      z: p.z,
      walking: this.walker.walking,
      sitting: !!this.sitting?.down,
      seat: this.sitting?.seat.key ?? this.pendingSeat?.key ?? null,
    };
  }

  setLoadout(loadout: AvatarLoadout): void {
    const key = avatarKey(loadout);
    if (key === this.key) return;
    this.key = key;
    for (const g of [this.figure, ...Object.values(this.limbs)]) {
      for (const child of [...g.children]) if (child instanceof Mesh) child.removeFromParent();
    }
    const rig = avatarRig(loadout);
    this.pivots = rig.pivots;
    for (const [limb, mesh] of Object.entries(rig.meshes) as [Limb, Mesh][]) {
      mesh.traverse((o) => (o.raycast = () => {}));
      if (limb === 'body') {
        this.figure.add(mesh);
        continue;
      }
      // Hang the limb from its pivot (hip or shoulder), so it swings around it.
      const pivot = rig.pivots[limb];
      this.limbs[limb].position.set(...pivot);
      mesh.position.set(-pivot[0], -pivot[1], -pivot[2]);
      this.limbs[limb].add(mesh);
    }
  }

  /** Walks toward a tapped spot, stopping beside it on the side it came from (gets up first). */
  walkToward(target: GroundPoint, now: number, instant: boolean): void {
    this.standUp();
    this.pendingSeat = null;
    const p = this.walker.pos;
    const side = p.x <= target.x ? -1 : 1;
    const to = this.clamp({ x: target.x + side * STAND_BESIDE, z: target.z + 0.3 });
    this.walker.walkTo(to, now, instant);
  }

  /** Walks up to a seat, turns round and sits down on it. */
  sitOn(seat: Seat, now: number, instant: boolean): void {
    if (this.sitting?.seat.key === seat.key) return;
    this.standUp();
    this.pendingSeat = seat;
    const front = this.approach(seat);
    this.walker.walkTo(front, now, instant, () => {
      if (this.pendingSeat?.key !== seat.key) return;
      this.pendingSeat = null;
      // The sitting-down animation starts on the next frame (when it arrives).
      this.sitting = { seat, from: { ...this.walker.pos }, start: -1, down: false };
    });
  }

  /** The seat it's on (or heading to) moved or went away: get up. */
  seatGone(): void {
    this.pendingSeat = null;
    this.standUp();
  }

  update(ctx: FrameContext, seats?: (key: string) => Seat | null): void {
    const { now, reducedMotion } = ctx;
    // If its seat moved or was put away (Decorate mode), stand up where it is.
    const seatKey = this.sitting?.seat.key ?? this.pendingSeat?.key;
    if (seatKey && seats) {
      const seat = seats(seatKey);
      const was = this.sitting?.seat ?? this.pendingSeat;
      if (
        !seat ||
        !was ||
        Math.hypot(seat.x - was.x, seat.z - was.z) > 0.01 ||
        seat.yaw !== was.yaw
      ) {
        this.seatGone();
      }
    }

    if (reducedMotion && this.walker.walking) this.walker.update(Infinity);
    else this.walker.update(now);
    const p = this.walker.pos;
    const moved = Math.hypot(p.x - this.last.x, p.z - this.last.z);
    this.last = { ...p };

    // The walk cycle follows the ground covered, so the feet never slide.
    const target = this.walker.walking && !reducedMotion ? 1 : 0;
    this.walking += (target - this.walking) * Math.min(1, ctx.dt * 10);
    this.phase += moved * STRIDE;

    let pose: AvatarPose = mixPose(
      reducedMotion ? idlePose(0) : idlePose(now),
      walkPose(this.phase, 1),
      this.walking,
    );
    let x = p.x;
    let z = p.z;
    let y = 0;
    let yaw: number;

    const sit = this.sitting;
    if (sit) {
      // Turn to face out from the seat, back up onto it, and sit down.
      if (sit.start < 0) sit.start = now;
      const t = reducedMotion ? 1 : ease((now - sit.start) / SIT_MS);
      sit.down = t >= 1;
      const hip = this.pivots?.hipY ?? 0.4;
      x = sit.from.x + (sit.seat.x - sit.from.x) * t;
      z = sit.from.z + (sit.seat.z - sit.from.z) * t;
      y = (sit.seat.y - hip) * t;
      pose = mixPose(pose, sitPose(1), t);
      yaw = sit.seat.yaw;
      this.yaw = reducedMotion || t > 0.5 ? yaw : turnToward(this.yaw, yaw, ctx.dt * 12);
    } else {
      const heading = this.walker.heading();
      yaw = heading ?? (this.pendingSeat ? this.pendingSeat.yaw : ctx.cameraYaw);
      this.yaw = reducedMotion ? yaw : turnToward(this.yaw, yaw, ctx.dt * 8);
    }

    this.root.position.set(x, y, z);
    this.turn.rotation.y = this.yaw;
    this.figure.position.y = pose.bob;
    this.figure.rotation.z = pose.sway;
    // Leaning into the walk a little (not while sitting).
    this.figure.rotation.x = this.sitting ? 0 : 0.09 * this.walking;
    this.limbs.legL.rotation.x = pose.legL;
    this.limbs.legR.rotation.x = pose.legR;
    this.limbs.armL.rotation.x = pose.armL;
    this.limbs.armR.rotation.x = pose.armR;
  }

  /** In front of a seat, on the ground (where it turns round to sit). */
  private approach(seat: Seat): GroundPoint {
    return {
      x: seat.x + Math.sin(seat.yaw) * SEAT_APPROACH,
      z: seat.z + Math.cos(seat.yaw) * SEAT_APPROACH,
    };
  }

  /** Gets up from a seat: steps forward off it, standing. */
  private standUp(): void {
    const sit = this.sitting;
    if (!sit) return;
    this.sitting = null;
    this.walker.pos = this.approach(sit.seat);
    this.last = { ...this.walker.pos };
  }

  private clamp(g: GroundPoint): GroundPoint {
    const b = this.bounds;
    return {
      x: Math.min(b.maxX, Math.max(b.minX, g.x)),
      z: Math.min(b.maxZ, Math.max(b.minZ, g.z)),
    };
  }
}
