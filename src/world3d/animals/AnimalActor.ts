import { Group, Mesh, Sprite, SpriteMaterial } from 'three';
import type { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { displayName } from '../../bridge/describe';
import { getIllness } from '../../config/illnesses';
import type { TrickMove } from '../../config/tricks';
import type { Badge } from '../../sim/GameSim';
import type { Animal } from '../../sim/types';
import type { GroundPoint } from '../coords';
import { labelStyles, setText, worldLabel } from './labels';
import { animalMaterials, starTexture } from './materials';
import { animalModel, type AnimalModel } from './model';
import { symptomView, type SymptomView } from './symptoms';
import {
  ambleSpot,
  breath,
  nextAmble,
  REST,
  TRICK_MS,
  trickPose,
  turnToward,
  Walker,
  type Pose,
} from './motion';

const BABY_SCALE = 0.65;
/** Below this, a need shows as an icon over the animal (render-only cue, like the original). */
const LOW_NEED = 25;

type Icon = Badge | 'hungry' | 'sad';
const ICONS: Partial<Record<Icon, string>> = {
  sick: '🤒', // Replaced by the illness's own symptom icon when known.
  hungry: '🍽️',
  sad: '😢',
  pregnant: '🍼',
  readyToSell: '🪙',
  kept: '❤️',
  new: '✨',
};
const ICON_ORDER: Icon[] = ['sick', 'hungry', 'sad', 'pregnant', 'readyToSell', 'kept', 'new'];
const SPARKLE_COLORS = ['#ffd84d', '#ff8fd0', '#8fd6ff', '#b69bff'];

export interface FrameContext {
  now: number;
  /** Seconds since the last frame. */
  dt: number;
  reducedMotion: boolean;
  /** The camera's direction around the yard (animals face it when standing). */
  cameraYaw: number;
}

type Leaving = { kind: 'goodbye' | 'exit'; start: number; onDone: () => void };

/**
 * One animal in the 3D world. Its sim position is its "home"; between sim moves it ambles
 * around home (render only). Pops in, walks in, waves goodbye, and performs tricks.
 */
export class AnimalActor {
  readonly root = new Group();
  /** Which way it faces. */
  private readonly turn = new Group();
  /** Trick moves and the hop, in the animal's own space. */
  private readonly pose = new Group();
  private readonly figure = new Group();
  private readonly body: Mesh;
  private readonly outline: Mesh;
  private readonly shadow: Mesh;
  readonly hit: Mesh;
  private readonly name: CSS2DObject;
  private readonly badges: CSS2DObject;
  private sparkles: Sprite[] = [];
  private model: AnimalModel;
  private look = '';
  private labelKey = '';
  private readonly walker: Walker;
  private home: GroundPoint;
  private baseScale = 1;
  private yaw: number;
  private idleYaw: number;
  private nextAmbleAt: number;
  private readonly breathMs = 2200 + Math.random() * 800;
  private trick: { move: TrickMove; start: number } | null = null;
  private pop: { start: number } | null = null;
  private leaving: Leaving | null = null;
  private symptom: SymptomView | null = null;
  /** Picked up by the player's finger (drag to the door). */
  private dragging = false;
  private lastNow = 0;

  constructor(
    readonly animalId: string,
    pickKey: string,
    start: GroundPoint,
    home: GroundPoint,
    now: number,
    private readonly random: () => number = Math.random,
  ) {
    const m = animalMaterials();
    this.model = animalModel('bunny', 'white');
    this.body = new Mesh(this.model.geometry, m.body);
    this.body.receiveShadow = true;
    this.outline = new Mesh(this.model.outline, m.outline);
    this.outline.raycast = () => {};
    this.figure.add(this.body, this.outline);
    this.pose.add(this.figure);
    this.turn.add(this.pose);

    this.shadow = new Mesh(m.shadowGeo, m.shadow);
    this.shadow.position.y = 0.012;
    this.shadow.raycast = () => {};
    this.hit = new Mesh(m.hitGeo, m.hit);
    this.hit.userData.pickKey = pickKey;

    this.name = worldLabel(labelStyles.name!, { x: 0.5, y: -0.35 });
    this.badges = worldLabel(labelStyles.badges!, { x: 0.5, y: 1 });
    this.root.add(this.turn, this.shadow, this.hit, this.name, this.badges);

    this.walker = new Walker(start);
    this.home = { ...home };
    this.yaw = (this.random() - 0.5) * 0.8;
    this.idleYaw = this.yaw;
    this.nextAmbleAt = now + 1500 + this.random() * 3000;
    this.placeRoot(0);
  }

  get position(): GroundPoint {
    return this.walker.pos;
  }

  /** The model's height at its current size (for labels, rings, and projection). */
  get height(): number {
    return this.model.height * this.baseScale;
  }

  get isLeaving(): boolean {
    return this.leaving !== null;
  }

  get isDragging(): boolean {
    return this.dragging;
  }

  /** The top of its head, in world units (for effects over it). */
  get top(): { x: number; y: number; z: number } {
    const p = this.walker.pos;
    return { x: p.x, y: this.height, z: p.z };
  }

  /** Updates looks and home from sim state. Cheap to call every frame. */
  sync(
    animal: Animal,
    badges: readonly Badge[],
    home: GroundPoint,
    now: number,
    instant: boolean,
  ): void {
    if (this.leaving) return;
    const look = `${animal.speciesId}|${animal.variantId}|${animal.isSparkle}`;
    if (look !== this.look) {
      this.look = look;
      this.model = animalModel(animal.speciesId, animal.variantId, animal.isSparkle);
      this.body.geometry = this.model.geometry;
      this.outline.geometry = this.model.outline;
      this.setSparkle(animal.isSparkle);
      // Rebuild any symptom look for the new body.
      this.symptom?.dispose();
      this.symptom = null;
    }

    const baby = badges.includes('baby');
    const active = new Set<Icon>(badges);
    if (animal.needs.hunger < LOW_NEED) active.add('hungry');
    if (animal.needs.happiness < LOW_NEED) active.add('sad');
    const illness = animal.sickness && getIllness(animal.sickness.illnessId);
    const sickIcon = animal.sickness?.atClinicUntil !== undefined ? '🏥' : illness?.symptomIcon;
    const symptom = illness?.symptomFx;
    if (symptom !== this.symptom?.kind) {
      this.symptom?.dispose();
      this.symptom = symptom
        ? symptomView(symptom, this.model.anchors, this.figure, this.root)
        : null;
    }
    const icons = ICON_ORDER.filter((i) => active.has(i))
      .slice(0, 2)
      .map((i) => (i === 'sick' && sickIcon) || ICONS[i])
      .join('');
    const labelKey = `${displayName(animal)}|${icons}|${baby}`;
    if (labelKey !== this.labelKey) {
      this.labelKey = labelKey;
      setText(this.name, displayName(animal));
      setText(this.badges, icons);
      this.baseScale = baby ? BABY_SCALE : 1;
      this.fitToModel();
    }

    if (home.x !== this.home.x || home.z !== this.home.z) {
      this.home = { ...home };
      if (!this.dragging) this.walker.walkTo(home, now, instant);
    }
  }

  /** Picked up: lifted a little, and it stops wandering. */
  startDrag(): void {
    this.dragging = true;
    this.walker.stop();
    this.trick = null;
  }

  dragTo(p: GroundPoint): void {
    this.walker.pos = { ...p };
  }

  /** Put down: walks back home unless it's leaving through a door. */
  endDrag(now: number, instant: boolean, goHome = true): void {
    this.dragging = false;
    if (goHome) this.walker.walkTo(this.home, now, instant);
  }

  /** Walks to a spot (e.g. home from the gate, or through a door). */
  walkTo(to: GroundPoint, now: number, instant: boolean, onDone?: () => void): void {
    this.walker.walkTo(to, now, instant, onDone);
  }

  /** Newborns and pets back from storage pop in. */
  popIn(now: number, instant: boolean): void {
    if (!instant) this.pop = { start: now };
  }

  perform(move: TrickMove, now: number, instant: boolean): void {
    if (instant || this.leaving) return;
    this.trick = { move, start: now };
  }

  /** A happy goodbye (sold, or off to Pet Storage): floats up and shrinks away. */
  goodbye(now: number, onDone: () => void): void {
    this.walker.stop();
    this.trick = null;
    this.hideLabels();
    this.leaving = { kind: 'goodbye', start: now, onDone };
  }

  /** Walks to a door and shrinks away through it (going to the other zone). */
  exitThrough(door: GroundPoint, now: number, instant: boolean, onDone: () => void): void {
    this.trick = null;
    this.hideLabels();
    // Walking to the door (no taps on the way), then shrinking through it.
    this.leaving = { kind: 'exit', start: Infinity, onDone };
    this.walker.walkTo(door, now, instant, () => {
      this.leaving = { kind: 'exit', start: this.lastNow, onDone };
    });
  }

  update(ctx: FrameContext): void {
    const { now, reducedMotion } = ctx;
    this.lastNow = now;
    // Amble around home now and then (never while leaving or with reduced motion).
    if (
      !this.leaving &&
      !this.dragging &&
      !this.walker.walking &&
      !reducedMotion &&
      now >= this.nextAmbleAt
    ) {
      this.nextAmbleAt = nextAmble(now, this.random);
      this.walker.walkTo(ambleSpot(this.home, this.random), now);
      this.idleYaw = (this.random() - 0.5) * 1.1;
    }
    const hop = reducedMotion ? 0 : this.walker.update(now);
    if (reducedMotion && this.walker.walking) this.walker.update(Infinity);

    // Face where it's going; when standing, turn back toward the camera (a little off-center).
    const heading = this.walker.heading();
    const want = heading ?? ctx.cameraYaw + this.idleYaw;
    this.yaw = reducedMotion && heading === null ? want : turnToward(this.yaw, want, ctx.dt * 7);

    let pose: Pose = REST;
    if (this.trick) {
      const elapsed = now - this.trick.start;
      if (elapsed >= TRICK_MS[this.trick.move]) this.trick = null;
      else pose = trickPose(this.trick.move, elapsed);
    }
    let scale = 1;
    if (this.pop) {
      const t = Math.min(1, (now - this.pop.start) / 450);
      scale = backOut(t);
      if (t >= 1) this.pop = null;
    }
    let lift = 0;
    const leaving = this.leaving;
    if (leaving && now >= leaving.start) {
      const duration = leaving.kind === 'goodbye' ? 900 : 350;
      const t = reducedMotion ? 1 : Math.min(1, (now - leaving.start) / duration);
      scale *= 1 - t;
      if (leaving.kind === 'goodbye') lift = 0.6 * t * t;
      if (t >= 1) {
        this.leaving = { ...leaving, start: Infinity };
        leaving.onDone();
      }
    }

    const sick = this.symptom?.update(now, reducedMotion);
    // Held up by the finger: lifted and a little bigger, like the original.
    const held = this.dragging ? 0.3 : 0;
    if (this.dragging) scale *= 1.1;
    const breathe = reducedMotion ? 1 : breath(now, this.breathMs);
    this.figure.scale.set(
      pose.sx * (hop > 0 ? 0.95 : 1) * (sick?.sx ?? 1),
      pose.sy * breathe * (sick?.sy ?? 1),
      pose.sx,
    );
    this.pose.position.set(
      pose.x + (sick?.x ?? 0),
      pose.y + hop + lift + held + (sick?.y ?? 0),
      pose.z,
    );
    this.pose.rotation.set(pose.rx, pose.ry, pose.rz + (sick?.rz ?? 0));
    this.pose.scale.setScalar(scale);
    // The shadow stays on the ground, smaller while the animal is up in the air.
    const air = pose.y + hop + lift + held;
    this.shadow.scale.setScalar(this.model.radius * 0.8 * scale * Math.max(0.5, 1 - air * 1.2));
    this.twinkle(now, reducedMotion);
    this.placeRoot(this.yaw);
  }

  dispose(): void {
    this.symptom?.dispose();
    this.root.removeFromParent();
    for (const s of this.sparkles) s.material.dispose();
    this.name.element.remove();
    this.badges.element.remove();
  }

  private placeRoot(yaw: number): void {
    const p = this.walker.pos;
    this.root.position.set(p.x, 0, p.z);
    this.root.scale.setScalar(this.baseScale);
    // Only the figure turns; labels and the tap volume don't need to.
    this.turn.rotation.y = yaw;
  }

  private fitToModel(): void {
    const { height, radius } = this.model;
    this.hit.scale.set(Math.max(0.42, radius * 1.05), height + 0.08, Math.max(0.42, radius * 1.05));
    this.badges.position.y = height + 0.1;
    this.name.position.y = 0;
    this.sparkles.forEach((s, i) => placeStar(s, i, height));
  }

  private setSparkle(on: boolean): void {
    for (const s of this.sparkles) {
      s.removeFromParent();
      s.material.dispose();
    }
    this.sparkles = [];
    if (!on) return;
    this.sparkles = SPARKLE_COLORS.map((color, i) => {
      const s = new Sprite(new SpriteMaterial({ map: starTexture(color), depthWrite: false }));
      placeStar(s, i, this.model.height);
      this.pose.add(s);
      return s;
    });
  }

  private twinkle(now: number, still: boolean): void {
    this.sparkles.forEach((s, i) => {
      const t = still ? 0.5 : 0.5 + 0.5 * Math.sin(now / 220 + i * 1.6);
      s.scale.setScalar(0.1 + 0.08 * t);
      s.material.opacity = 0.35 + 0.65 * t;
    });
  }

  private hideLabels(): void {
    this.name.visible = false;
    this.badges.visible = false;
  }
}

/** Sparkle stars sit around the animal at different heights. */
function placeStar(s: Sprite, i: number, height: number): void {
  const a = (i / 4) * Math.PI * 2 + 0.4;
  s.position.set(Math.cos(a) * 0.48, height * (0.3 + 0.18 * i), Math.sin(a) * 0.34);
}

/** Overshoots a little, then settles (pop-in). */
function backOut(t: number): number {
  const c = 1.70158;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}
