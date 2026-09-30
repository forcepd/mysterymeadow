import { Group, Mesh, type Object3D } from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { GameSession } from '../../bridge/gameSession';
import { getItem, isPlaceable } from '../../config/items';
import { LAYOUT, tileCenterWorld, zoneToWorld } from '../../game/layout';
import type { PlacedItem, Poop, YardFind } from '../../sim/types';
import { animalMaterials } from '../animals/materials';
import type { FrameContext } from '../animals/AnimalActor';
import { HOUSE_BOX, HOUSE_HEIGHT, worldToGround, type Point3, type ViewZone } from '../coords';
import type { Effects3D } from '../fx/Effects3D';
import { pickKey, type Pickable } from '../pick';
import styles from './care.module.css';
import { bowlMesh, findModel, poopMesh, scoopBotMesh, type FindModel } from './models';

/** How the care things reach the effects (and the coin counter). */
export interface FxHost {
  fx: Effects3D;
  /** Coins flying from a spot in the world to the coin counter. */
  coins(from: Point3, count: number): void;
}

/** Where Scoop Bot waits between jobs: by the fence, left of the gate (like the original). */
const SCOOP_PARK = { x: 1040, y: LAYOUT.fenceY + 70 };
/** Finds hover this high, and bob this much. */
const FIND_HEIGHT = 0.4;
/** The original's 88 px find target, and 72 px poop target. */
const FIND_REACH = 0.44;
const POOP_REACH = 0.36;
const BOWL_REACH = 0.42;

interface Anim {
  start: number;
  duration: number;
  step(t: number): void;
  end?(): void;
}

interface Thing {
  root: Group;
  zone: ViewZone;
  height: number;
  leaving: boolean;
}

interface BowlThing extends Thing {
  servings: number;
  mesh: Object3D;
  alert: CSS2DObject;
}

interface FindThing extends Thing {
  model: FindModel;
  kind: YardFind['kind'];
  phase: number;
}

function tapVolume(key: string, radius: number, height: number): Mesh {
  const m = animalMaterials();
  const hit = new Mesh(m.hitGeo, m.hit);
  hit.scale.set(radius, height, radius);
  hit.userData.pickKey = key;
  return hit;
}

/**
 * Food bowls, poop, yard finds and Scoop Bot in the 3D world (DESIGN 8.2, 8.3, early-game finds,
 * helpers), kept in step with the sim like the original's zone scenes. Taps become sim commands;
 * sim events add the flourishes.
 */
export class Care {
  private readonly bowls = new Map<string, BowlThing>();
  private readonly poops = new Map<string, Thing>();
  private readonly finds = new Map<string, FindThing>();
  private readonly collected = new Set<string>();
  private readonly anims: Anim[] = [];
  private readonly bot = new Group();
  private botBusy = false;
  private readonly offs: (() => void)[] = [];
  private initialized = false;
  private now = 0;
  private reducedMotion = false;

  constructor(
    private readonly session: GameSession,
    private readonly zones: Record<ViewZone, Group>,
    private readonly host: FxHost,
  ) {
    this.bot.add(scoopBotMesh());
    this.bot.visible = false;
    this.placeBot();
    zones.yard.add(this.bot);

    const { events } = session.sim;
    this.offs.push(
      events.on('animalAte', ({ bowlId }) => {
        const b = this.bowls.get(bowlId);
        if (b) this.host.fx.floatText(b.root, { x: 0, y: 0.45, z: 0 }, 'nom!', '#8b5a33', 24);
      }),
      events.on('bowlRefilled', ({ bowlId }) => {
        const b = this.bowls.get(bowlId);
        if (b)
          this.host.fx.burst(b.root.parent!, this.top(b, 0.3), [0xe0a868, 0xffd84d, 0xffffff], 8);
      }),
      events.on('findCollected', ({ find, coins }) => {
        this.collected.add(find.id);
        const f = this.finds.get(find.id);
        if (!f) return;
        const at = this.top(f, 0);
        this.host.fx.floatText(
          this.zones.yard,
          { ...at, y: at.y + 0.3 },
          `+${coins} 🪙`,
          '#c98a00',
          30,
        );
        this.host.fx.burst(this.zones.yard, at, [0xffd84d, 0xffffff, 0x9ff0c8], 8);
        this.host.coins(at, Math.min(coins, 5));
      }),
      events.on('poopCleaned', ({ poop, by }) => {
        if (by === 'scoopBot' && poop.zone === 'yard') this.scoop(poop);
      }),
      events.on('houseUpgraded', () => {
        const c = worldToGround({
          x: HOUSE_BOX.x + HOUSE_BOX.w / 2,
          y: HOUSE_BOX.y + HOUSE_BOX.h / 2,
        });
        this.host.fx.burst(
          this.zones.yard,
          { x: c.x, y: 1.4, z: c.z },
          [0xffd84d, 0xff9fc4, 0x9fe7ff, 0xffffff],
          16,
        );
        this.host.fx.hearts(this.zones.yard, { x: c.x, y: HOUSE_HEIGHT, z: c.z }, 5);
      }),
    );
  }

  *pickables(): Iterable<Pickable> {
    for (const [id, b] of this.bowls)
      yield { kind: 'bowl', id, zone: b.zone, object: b.root, height: b.height };
    for (const [id, p] of this.poops) {
      if (!p.leaving) yield { kind: 'poop', id, zone: p.zone, object: p.root, height: p.height };
    }
    for (const [id, f] of this.finds) {
      if (!f.leaving) yield { kind: 'find', id, zone: 'yard', object: f.root, height: f.height };
    }
  }

  /** A tap on a bowl, poop or find (DESIGN 8.2, 8.3). */
  tap(kind: Pickable['kind'], id: string): void {
    const { sim } = this.session;
    if (kind === 'bowl') {
      const result = sim.refillBowl(id);
      const b = this.bowls.get(id);
      if (!result.ok && b)
        this.host.fx.floatText(b.root, { x: 0, y: 0.5, z: 0 }, 'Full!', '#3f7fbf', 24);
    } else if (kind === 'poop') {
      sim.cleanPoop(id);
    } else if (kind === 'find') {
      sim.collectFind(id);
    }
  }

  update(ctx: FrameContext): void {
    this.now = ctx.now;
    this.reducedMotion = ctx.reducedMotion;
    const { world } = this.session.sim.state;
    this.reconcileBowls(world.placedItems);
    this.reconcilePoops(world.poops);
    this.reconcileFinds(world.finds);
    this.bot.visible = this.session.sim.hasHelper('scoopBot');
    this.animateFinds(ctx);
    for (let i = this.anims.length - 1; i >= 0; i--) {
      const a = this.anims[i]!;
      if (ctx.now < a.start) continue;
      const t = ctx.reducedMotion ? 1 : Math.min(1, (ctx.now - a.start) / a.duration);
      a.step(t);
      if (t >= 1) {
        this.anims.splice(i, 1);
        a.end?.();
      }
    }
    this.initialized = true;
  }

  dispose(): void {
    this.offs.forEach((off) => off());
    for (const b of this.bowls.values()) b.alert.element.remove();
    this.bot.removeFromParent();
  }

  private top(t: Thing, extra: number): Point3 {
    return { x: t.root.position.x, y: t.height + extra, z: t.root.position.z };
  }

  private animate(duration: number, step: (t: number) => void, end?: () => void, delay = 0): void {
    this.anims.push({ start: this.now + delay, duration, step, ...(end ? { end } : {}) });
  }

  // ---- Bowls ------------------------------------------------------------------------------------

  private reconcileBowls(items: readonly PlacedItem[]): void {
    const seen = new Set<string>();
    for (const item of items) {
      const def = getItem(item.itemId);
      if (!def || !isPlaceable(def) || def.category !== 'bowl') continue;
      seen.add(item.id);
      const zone = item.zone;
      const at = worldToGround(tileCenterWorld(zone, this.session.sim.gridSize(zone), item.tile));
      let b = this.bowls.get(item.id);
      if (!b || b.zone !== zone) {
        if (b) this.removeBowl(item.id, b);
        const root = new Group();
        const el = document.createElement('div');
        el.className = styles.alert!;
        el.append(Object.assign(document.createElement('span'), { textContent: '!' }));
        const alert = new CSS2DObject(el);
        alert.center.set(0.5, 1);
        alert.position.y = 0.5;
        root.add(tapVolume(pickKey('bowl', item.id), BOWL_REACH, 0.45), alert);
        b = { root, zone, height: 0.25, leaving: false, servings: -1, mesh: new Group(), alert };
        this.bowls.set(item.id, b);
        this.zones[zone].add(root);
      }
      b.root.position.set(at.x, 0, at.z);
      const servings = item.servings ?? 0;
      if (servings !== b.servings) {
        b.servings = servings;
        b.mesh.removeFromParent();
        b.mesh = bowlMesh(servings);
        b.root.add(b.mesh);
        b.alert.visible = servings === 0;
      }
      b.alert.element.dataset.pulse = String(!this.reducedMotion);
    }
    for (const [id, b] of this.bowls) if (!seen.has(id)) this.removeBowl(id, b);
  }

  private removeBowl(id: string, b: BowlThing): void {
    b.root.removeFromParent();
    b.alert.element.remove();
    this.bowls.delete(id);
  }

  // ---- Poop -------------------------------------------------------------------------------------

  private reconcilePoops(poops: readonly Poop[]): void {
    const seen = new Set<string>();
    for (const poop of poops) {
      seen.add(poop.id);
      if (this.poops.has(poop.id)) continue;
      const root = new Group();
      const mesh = poopMesh();
      root.add(mesh, tapVolume(pickKey('poop', poop.id), POOP_REACH, 0.5));
      const g = worldToGround(zoneToWorld(poop.zone, poop.position));
      root.position.set(g.x, 0, g.z);
      this.zones[poop.zone].add(root);
      this.poops.set(poop.id, { root, zone: poop.zone, height: 0.3, leaving: false });
      // A new one plops in (not ones already there when the world loads).
      if (this.initialized && !this.reducedMotion) {
        mesh.scale.setScalar(0.2);
        this.animate(300, (t) => mesh.scale.setScalar(0.2 + 0.8 * backOut(t)));
      }
    }
    for (const [id, p] of this.poops) {
      if (seen.has(id) || p.leaving) continue;
      // Cleaned: a sparkle, and it shrinks away.
      p.leaving = true;
      this.host.fx.burst(this.zones[p.zone], this.top(p, -0.1), [0xffffff, 0x9fe7ff, 0xffe066], 8);
      this.animate(
        220,
        (t) => p.root.scale.setScalar(1 - t),
        () => {
          p.root.removeFromParent();
          this.poops.delete(id);
        },
      );
    }
  }

  // ---- Finds ------------------------------------------------------------------------------------

  private reconcileFinds(finds: readonly YardFind[]): void {
    const seen = new Set<string>();
    for (const find of finds) {
      seen.add(find.id);
      if (this.finds.has(find.id)) continue;
      const root = new Group();
      const model = findModel(find.kind);
      model.group.position.y = FIND_HEIGHT;
      const shadow = new Mesh(animalMaterials().shadowGeo, animalMaterials().shadow);
      shadow.scale.setScalar(0.18);
      shadow.position.y = 0.012;
      root.add(model.group, shadow, tapVolume(pickKey('find', find.id), FIND_REACH, 0.9));
      const g = worldToGround(zoneToWorld('yard', find.position));
      root.position.set(g.x, 0, g.z);
      this.zones.yard.add(root);
      const thing: FindThing = {
        root,
        zone: 'yard',
        // Its middle is the floating find itself.
        height: FIND_HEIGHT * 2,
        leaving: false,
        model,
        kind: find.kind,
        phase: Math.random() * 6,
      };
      this.finds.set(find.id, thing);
      if (!this.reducedMotion) {
        root.scale.setScalar(0.2);
        this.animate(350, (t) => root.scale.setScalar(0.2 + 0.8 * backOut(t)));
      }
    }
    for (const [id, f] of this.finds) {
      if (seen.has(id) || f.leaving) continue;
      f.leaving = true;
      // Tapped: a quick pop. Nobody tapped it: it floats (or flutters) away.
      const collected = this.collected.delete(id);
      const rise = collected ? 0.2 : 0.6;
      const grow = collected ? 1.4 : 0.8;
      this.animate(
        350,
        (t) => {
          f.root.position.y = rise * t;
          f.root.scale.setScalar((1 + (grow - 1) * t) * (1 - t));
        },
        () => {
          f.root.removeFromParent();
          this.finds.delete(id);
        },
      );
    }
  }

  /** Finds bob gently; coins spin; butterflies flap; clovers turn slowly. */
  private animateFinds(ctx: FrameContext): void {
    for (const f of this.finds.values()) {
      const g = f.model.group;
      if (ctx.reducedMotion) {
        g.position.y = FIND_HEIGHT;
        g.rotation.y = f.kind === 'clover' ? 0 : ctx.cameraYaw;
        continue;
      }
      const t = ctx.now / 1000 + f.phase;
      g.position.y = FIND_HEIGHT + 0.08 * Math.sin(t * 3.5);
      if (f.kind === 'coin') g.rotation.y = t * 2.2;
      else if (f.kind === 'clover') g.rotation.y = ctx.cameraYaw + Math.sin(t * 0.8) * 0.5;
      else g.rotation.y = ctx.cameraYaw + Math.sin(t * 0.6) * 0.4;
      if (f.model.wings) {
        const flap = 0.2 + 1.1 * Math.abs(Math.sin(t * 14));
        f.model.wings[0].rotation.y = flap;
        f.model.wings[1].rotation.y = -flap;
      }
    }
  }

  // ---- Scoop Bot --------------------------------------------------------------------------------

  private placeBot(): void {
    const park = worldToGround(SCOOP_PARK);
    this.bot.position.set(park.x, 0, park.z);
    this.bot.rotation.set(0, 0, 0);
  }

  /** Scoop Bot zips to the poop, gives it a wiggle and a sparkle, and comes back to park. */
  private scoop(poop: Poop): void {
    const at = worldToGround(zoneToWorld('yard', poop.position));
    if (this.reducedMotion || this.botBusy) {
      this.host.fx.burst(this.zones.yard, { x: at.x, y: 0.15, z: at.z }, [0x9fe7ff, 0xffffff], 6);
      return;
    }
    this.botBusy = true;
    const park = worldToGround(SCOOP_PARK);
    const go = { x: at.x, z: at.z + 0.1 };
    const face = Math.atan2(go.x - park.x, go.z - park.z);
    const ease = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * t);
    this.bot.rotation.y = face;
    this.animate(500, (t) => {
      const e = ease(t);
      this.bot.position.set(park.x + (go.x - park.x) * e, 0, park.z + (go.z - park.z) * e);
    });
    this.animate(
      540,
      (t) => (this.bot.rotation.z = 0.26 * Math.sin(t * Math.PI * 6)),
      undefined,
      500,
    );
    this.animate(
      10,
      () => {},
      () =>
        this.host.fx.burst(this.zones.yard, { x: at.x, y: 0.15, z: at.z }, [0x9fe7ff, 0xffffff], 6),
      560,
    );
    this.animate(
      600,
      (t) => {
        const e = ease(t);
        this.bot.rotation.y = face + Math.PI;
        this.bot.position.set(go.x + (park.x - go.x) * e, 0, go.z + (park.z - go.z) * e);
      },
      () => {
        this.placeBot();
        this.botBusy = false;
      },
      1190,
    );
  }
}

function backOut(t: number): number {
  const c = 1.70158;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}
