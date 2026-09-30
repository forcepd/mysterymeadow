import { Group, Mesh } from 'three';
import type { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { RARITY_STYLE, starString } from '../../art/palette';
import { speciesName } from '../../bridge/describe';
import type { Visitor } from '../../sim/types';
import type { GroundPoint } from '../coords';
import type { FrameContext } from './AnimalActor';
import { labelStyles, setText, worldLabel } from './labels';
import { animalMaterials } from './materials';
import { animalModel, mysteryModel, type AnimalModel } from './model';
import { Walker } from './motion';

/**
 * A mystery visitor at the gate (DESIGN 6.1): a wobbling dark silhouette with a "?" until
 * revealed, then the animal with its name and colored rarity stars, and "No room!" while it
 * waits. Shuffles along when the queue moves; waves and walks off up the path if it leaves.
 */
export class VisitorActor {
  readonly root = new Group();
  private readonly figure = new Group();
  private readonly body: Mesh;
  private readonly outline: Mesh;
  private readonly shadow: Mesh;
  readonly hit: Mesh;
  private readonly bubble: CSS2DObject;
  private readonly title: CSS2DObject;
  private model: AnimalModel = mysteryModel();
  private revealed = false;
  /** What the model shows now (null before the first sync). */
  private shown: 'mystery' | 'animal' | null = null;
  private readonly walker: Walker;
  private slot: GroundPoint;
  private pop: number | null = null;
  private leaving: { start: number; onDone: () => void } | null = null;

  constructor(
    readonly visitorId: string,
    pickKey: string,
    slot: GroundPoint,
  ) {
    const m = animalMaterials();
    this.body = new Mesh(this.model.geometry, m.body);
    this.outline = new Mesh(this.model.outline, m.outline);
    this.outline.raycast = () => {};
    this.figure.add(this.body, this.outline);
    this.shadow = new Mesh(m.shadowGeo, m.shadow);
    this.shadow.position.y = 0.012;
    this.shadow.raycast = () => {};
    this.hit = new Mesh(m.hitGeo, m.hit);
    this.hit.userData.pickKey = pickKey;
    this.bubble = worldLabel(labelStyles.bubble!, { x: 0.5, y: 1 });
    this.title = worldLabel(labelStyles.title!, { x: 0.5, y: -0.25 });
    this.root.add(this.figure, this.shadow, this.hit, this.bubble, this.title);
    this.walker = new Walker(slot);
    this.slot = { ...slot };
    this.fit();
  }

  get isRevealed(): boolean {
    return this.revealed;
  }

  get isLeaving(): boolean {
    return this.leaving !== null;
  }

  get height(): number {
    return this.model.height;
  }

  get position(): GroundPoint {
    return this.walker.pos;
  }

  sync(visitor: Visitor, slot: GroundPoint, now: number, instant: boolean): void {
    if (this.leaving) return;
    if (slot.x !== this.slot.x || slot.z !== this.slot.z) {
      this.slot = { ...slot };
      this.walker.walkTo(slot, now, instant);
    }
    const want = visitor.revealed ? 'animal' : 'mystery';
    if (want !== this.shown) {
      // Revealed in front of the player (not loaded that way): pop!
      const reveal = this.shown === 'mystery' && want === 'animal';
      this.shown = want;
      this.revealed = visitor.revealed;
      const { speciesId, variantId, isSparkle, rarity } = visitor.roll;
      this.model = this.revealed ? animalModel(speciesId, variantId, isSparkle) : mysteryModel();
      this.body.geometry = this.model.geometry;
      this.outline.geometry = this.model.outline;
      this.fit();
      if (this.revealed) {
        const sparkle = isSparkle ? '✦ Sparkle ' : '';
        setText(this.title, `${sparkle}${speciesName(speciesId)}\n${starString(rarity)}`);
        this.title.element.style.color = RARITY_STYLE[rarity].color;
        // Shown until it walks in; if it has to wait, the kid knows why.
        setText(this.bubble, 'No room!');
        this.bubble.element.dataset.small = 'true';
        if (reveal && !instant) this.pop = now;
      } else {
        setText(this.title, '');
        setText(this.bubble, '?');
      }
    }
  }

  /** It couldn't come in: waves, then walks back up the path and fades. */
  leave(now: number, onDone: () => void): void {
    setText(this.bubble, '👋');
    this.bubble.element.dataset.small = 'false';
    setText(this.title, '');
    this.leaving = { start: now + 600, onDone };
    this.walker.walkTo({ x: this.slot.x, z: this.slot.z - 1.4 }, now + 600);
  }

  update(ctx: FrameContext): void {
    const { now, reducedMotion } = ctx;
    const hop = reducedMotion ? 0 : this.walker.update(Math.max(now, 0));
    if (reducedMotion && this.walker.walking) this.walker.update(Infinity);
    const p = this.walker.pos;
    this.root.position.set(p.x, 0, p.z);

    // Unrevealed: a curious wobble. Revealed: faces the camera, happy to be seen.
    const wobble = !this.revealed && !reducedMotion ? Math.sin(now / 190) * 0.12 : 0;
    this.figure.rotation.set(0, this.revealed ? ctx.cameraYaw * 0.5 : 0, wobble);
    let scale = 1;
    if (this.pop !== null) {
      const t = Math.min(1, (now - this.pop) / 500);
      scale = 0.3 + 0.7 * backOut(t);
      if (t >= 1) this.pop = null;
    }
    if (this.leaving && now >= this.leaving.start) {
      const t = reducedMotion ? 1 : Math.min(1, (now - this.leaving.start) / 900);
      scale *= 1 - t;
      if (t >= 1) {
        const done = this.leaving.onDone;
        this.leaving = { start: Infinity, onDone: done };
        done();
      }
    }
    this.figure.position.y = hop;
    this.figure.scale.setScalar(scale);
    this.shadow.scale.setScalar(this.model.radius * 0.8 * scale);
  }

  dispose(): void {
    this.root.removeFromParent();
    this.bubble.element.remove();
    this.title.element.remove();
  }

  private fit(): void {
    const { height, radius } = this.model;
    this.hit.scale.set(Math.max(0.5, radius * 1.1), height + 0.1, Math.max(0.5, radius * 1.1));
    this.bubble.position.y = height + 0.12;
  }
}

function backOut(t: number): number {
  const c = 1.70158;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}
