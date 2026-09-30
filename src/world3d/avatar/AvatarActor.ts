import { Group, Mesh } from 'three';
import { gridArea, type Rect } from '../../game/layout';
import type { AvatarLoadout } from '../../profile/avatar';
import { avatarKey } from '../../art/avatarSvg';
import type { FrameContext } from '../animals/AnimalActor';
import { animalMaterials } from '../animals/materials';
import { turnToward, Walker } from '../animals/motion';
import { toUnits, worldToGround, type GroundPoint, type ViewZone } from '../coords';
import { avatarMesh } from './avatarModel';

/** The original's avatar pace: 260 world px/s, trips up to 1.8 s. */
const PACE = { speed: 2.6, minMs: 200, maxMs: 1800 };
/** How far to the side of a tapped spot the avatar stops (the original's 85 px). */
const STAND_BESIDE = 0.85;

/**
 * The player's avatar in the 3D world (DESIGN 13.3): walks toward wherever the player taps,
 * stopping beside the spot so it never stands on the animal or bowl that was tapped. Just for
 * flavor: it never takes taps. Hidden while decorating, like the original.
 */
export class AvatarActor {
  readonly root = new Group();
  private readonly turn = new Group();
  private model: Mesh | null = null;
  private key = '';
  private readonly walker: Walker;
  private yaw = 0;
  private readonly bounds: { minX: number; maxX: number; minZ: number; maxZ: number };

  constructor(zone: ViewZone, door: { x: number; y: number }) {
    const area: Rect = gridArea(zone);
    const a = worldToGround({ x: area.x, y: area.y });
    const b = worldToGround({ x: area.x + area.w, y: area.y + area.h });
    this.bounds = { minX: a.x, maxX: b.x, minZ: a.z, maxZ: b.z };
    // Starts beside its zone's door.
    const start = this.clamp({
      x: worldToGround(door).x + toUnits(90),
      z: worldToGround(door).z + toUnits(30),
    });
    this.walker = new Walker(start, PACE);
    const shadow = new Mesh(animalMaterials().shadowGeo, animalMaterials().shadow);
    shadow.scale.setScalar(0.3);
    shadow.position.y = 0.012;
    shadow.raycast = () => {};
    this.root.add(this.turn, shadow);
    this.root.name = 'avatar';
  }

  setLoadout(loadout: AvatarLoadout): void {
    const key = avatarKey(loadout);
    if (key === this.key) return;
    this.key = key;
    this.model?.removeFromParent();
    this.model = avatarMesh(loadout);
    this.model.traverse((o) => (o.raycast = () => {}));
    this.turn.add(this.model);
  }

  /** Walks toward a tapped spot, stopping beside it on the side it came from. */
  walkToward(target: GroundPoint, now: number, instant: boolean): void {
    const p = this.walker.pos;
    const side = p.x <= target.x ? -1 : 1;
    this.walker.walkTo(
      this.clamp({ x: target.x + side * STAND_BESIDE, z: target.z + 0.3 }),
      now,
      instant,
    );
  }

  update(ctx: FrameContext): void {
    const hopping = this.walker.walking && !ctx.reducedMotion;
    if (ctx.reducedMotion && this.walker.walking) this.walker.update(Infinity);
    else this.walker.update(ctx.now);
    const p = this.walker.pos;
    this.root.position.set(p.x, 0, p.z);
    this.turn.position.y = hopping ? 0.04 * Math.abs(Math.sin(ctx.now / 90)) : 0;
    const heading = this.walker.heading();
    const want = heading ?? ctx.cameraYaw;
    this.yaw = ctx.reducedMotion ? want : turnToward(this.yaw, want, ctx.dt * 8);
    this.turn.rotation.y = this.yaw;
  }

  private clamp(g: GroundPoint): GroundPoint {
    const b = this.bounds;
    return {
      x: Math.min(b.maxX, Math.max(b.minX, g.x)),
      z: Math.min(b.maxZ, Math.max(b.minZ, g.z)),
    };
  }
}
