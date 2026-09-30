import {
  Color,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  PCFShadowMap,
  Plane,
  Raycaster,
  RingGeometry,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { appBus } from '../bridge/appBus';
import type { GameSession } from '../bridge/gameSession';
import type { Vec2 } from '../sim/types';
import { CameraRig } from './CameraRig';
import {
  BACK_WALL_Z,
  framePoints,
  groundToWorld,
  wallToWallStrip,
  worldToGround,
  type Point3,
  type ViewZone,
} from './coords';
import { GestureRecognizer, TAP_SLOP, type PointerSample, type PressHandler } from './gestures';
import type { ScreenPoint, ViewInfo } from './testHooks';
import { Room } from './house/Room';
import { Items } from './items/Items';
import { Decorate } from './decorate/Decorate';
import { animalMaterials } from './animals/materials';
import { sceneryFade } from './art/toon';
import { Yard } from './yard/Yard';
import { SKY_HORIZON } from './yard/scenery';
import { Critters } from './animals/Critters';
import { pickKey, type Pickable, type PickKind } from './pick';
import { labelStyles } from './animals/labels';
import { animalPress } from './animals/animalPress';
import { Care, type FxHost } from './care/Care';
import { Effects3D } from './fx/Effects3D';
import fxStyles from './fx/fx.module.css';
import { doorOf } from '../game/layout';

/** Device pixel ratio cap: sharp on Retina iPads without drawing 9x the pixels on 3x screens. */
const MAX_PIXEL_RATIO = 2;
/** A tap this close (CSS px) to an object's on-screen anchor counts as on it (DESIGN 17.5). */
const MIN_TAP_RADIUS = 30;
/** Scenery closer than this fraction of the camera's distance fades away. */
const NEAR_FADE = 0.6;

/**
 * The Three.js world (replaces the Phaser game). Render only, like the original scenes: every
 * frame it reconciles 3D objects with sim state; taps become sim commands or app-bus events.
 */
export class World3D {
  readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly rigs: Record<ViewZone, CameraRig>;
  private readonly zones: Record<ViewZone, Group>;
  private readonly yard = new Yard();
  private zone: ViewZone = 'yard';
  private readonly gestures: GestureRecognizer;
  private readonly raycaster = new Raycaster();
  private readonly critters: Critters;
  private readonly care: Care;
  private readonly room = new Room();
  private readonly items: Items;
  private readonly decorate: Decorate;
  private readonly fx: Effects3D;
  /** Flying coins (DOM), over the canvas. */
  private readonly overlay = document.createElement('div');
  /** Glows at the door while an animal is carried (drop it here). */
  private readonly doorRing: Mesh;
  private doorState: 'off' | 'far' | 'near' = 'off';
  /** Names, badges and bubbles over the animals (HTML, so crisp at any zoom). */
  private readonly labels = new CSS2DRenderer();
  private atHome = true;
  private lastFrame = performance.now();
  private readonly offs: (() => void)[] = [];
  private readonly systemReducedMotion: boolean;
  private size = { width: 1, height: 1 };
  private readyEmitted = false;

  constructor(
    private readonly host: HTMLElement,
    private readonly session: GameSession,
  ) {
    this.systemReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.domElement.style.display = 'block';
    host.appendChild(this.renderer.domElement);
    this.labels.domElement.className = labelStyles.layer!;
    host.appendChild(this.labels.domElement);
    this.overlay.className = fxStyles.overlay!;
    host.appendChild(this.overlay);
    this.fx = new Effects3D(this.overlay, () => this.reducedMotion());
    const fxHost: FxHost = {
      fx: this.fx,
      coins: (from, count) => this.coinsFrom(from, count),
    };

    this.scene.background = new Color(SKY_HORIZON);
    this.scene.fog = new Fog(SKY_HORIZON, 32, 85);
    this.addLights();

    this.zones = { yard: this.yard.group, house: this.room.group };
    this.zones.house.visible = false;
    this.critters = new Critters(session, this.zones, fxHost);
    this.care = new Care(session, this.zones, fxHost);
    this.items = new Items(session, this.zones);
    this.decorate = new Decorate(
      session,
      {
        zone: () => this.zone,
        zones: this.zones,
        floorPoint: (q) => {
          const g = this.rig.groundAt(this.ndc(q));
          return g ? groundToWorld(g) : null;
        },
        wallPoint: (q) => this.wallPoint(q),
        clientToCanvas: (c) => {
          const r = this.renderer.domElement.getBoundingClientRect();
          if (c.x < r.left || c.x > r.right || c.y < r.top || c.y > r.bottom) return null;
          return { x: c.x - r.left, y: c.y - r.top };
        },
        say: (at, text, color) => this.fx.floatText(this.zones[this.zone], at, text, color, 22),
        sparkle: (at) =>
          this.fx.burst(this.zones[this.zone], at, [0xffd84d, 0xffffff, 0x9fe7ff], 8),
        changed: (on) => this.setDecorating(on),
      },
      (id) => this.items.select(id),
    );
    this.doorRing = new Mesh(
      new RingGeometry(0.75, 0.95, 48),
      new MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
      }),
    );
    this.doorRing.rotation.x = -Math.PI / 2;
    this.doorRing.visible = false;
    this.doorRing.raycast = () => {};
    this.scene.add(this.zones.yard, this.zones.house, this.critters.selectionRing, this.doorRing);

    this.rigs = {
      yard: new CameraRig(framePoints('yard')),
      house: new CameraRig(framePoints('house')),
    };
    this.gestures = new GestureRecognizer({
      pressAt: (p) => this.pressAt(p),
      tap: (p) => this.tapGround(p),
      orbit: (dx, dy) => this.rig.orbit(dx, dy, this.size.height),
      pinch: ({ from, to, scale }) => {
        this.rig.pan(this.ndc(from), this.ndc(to));
        this.rig.zoomAt(1 / scale, this.ndc(to));
      },
    });
    this.listen();
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private get rig(): CameraRig {
    return this.rigs[this.zone];
  }

  private reducedMotion(): boolean {
    return this.systemReducedMotion || this.session.sim.state.world.settings.reducedMotion;
  }

  // ---- Public API ------------------------------------------------------------------------------

  showZone(zone: ViewZone): void {
    if (zone === this.zone) return;
    this.gestures.cancel();
    this.zone = zone;
    this.zones.yard.visible = zone === 'yard';
    this.zones.house.visible = zone === 'house';
    appBus.emit('sceneChanged', { scene: zone });
    this.notifyView(true);
  }

  resetView(): void {
    this.rig.reset(performance.now(), this.reducedMotion());
  }

  /** Where a world-pixel spot (at `height` units up) is on the page, or null if off screen. */
  projectWorld(p: Vec2, height = 0): ScreenPoint | null {
    return this.toPage({ ...worldToGround(p), y: height });
  }

  /** Where something tappable (its middle) is on the page, or null if hidden or off screen. */
  projectObject(kind: PickKind, id: string): ScreenPoint | null {
    const p = this.live().get(pickKey(kind, id));
    return p ? this.toPage(this.anchorOf(p, 0.5)) : null;
  }

  /** Particles alive right now (the original's cap applies). */
  particles(): number {
    return this.fx.particleCount;
  }

  /** The camera, for tests and the debug panel. */
  view(): ViewInfo {
    const v = this.rig.view;
    return {
      zone: this.zone,
      azimuth: v.azimuth,
      polar: v.polar,
      zoom: v.zoom,
      atHome: this.rig.isAtHome(),
    };
  }

  stats(): { calls: number; triangles: number } {
    const { calls, triangles } = this.renderer.info.render;
    return { calls, triangles };
  }

  destroy(): void {
    this.renderer.setAnimationLoop(null);
    this.offs.forEach((off) => off());
    this.gestures.cancel();
    this.critters.dispose();
    this.care.dispose();
    this.decorate.dispose();
    this.room.dispose();
    this.fx.dispose();
    this.scene.traverse((o) => {
      if (o instanceof Mesh) {
        o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => m.dispose());
      }
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labels.domElement.remove();
    this.overlay.remove();
  }

  // ---- Setup -----------------------------------------------------------------------------------

  private addLights(): void {
    // Soft sky fill (blue from above, grass green bounced from below) and a warm sun from the
    // upper left, like the original's lighting, casting soft shadows over the whole yard.
    this.scene.add(new HemisphereLight(0xf2f9ff, 0xa8d68f, 1.35));
    const sun = new DirectionalLight(0xfff1d8, 2.1);
    sun.position.set(-6, 14, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const cam = sun.shadow.camera;
    cam.left = -11;
    cam.right = 11;
    cam.top = 9;
    cam.bottom = -9;
    cam.near = 1;
    cam.far = 50;
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.02;
    // Softer edges (PCF blur radius).
    sun.shadow.radius = 3;
    this.scene.add(sun, sun.target);
  }

  private listen(): void {
    const canvas = this.renderer.domElement;
    const sample = (e: PointerEvent): PointerSample => {
      const r = canvas.getBoundingClientRect();
      return { id: e.pointerId, x: e.clientX - r.left, y: e.clientY - r.top, time: e.timeStamp };
    };
    const on = <K extends keyof HTMLElementEventMap>(
      type: K,
      fn: (e: HTMLElementEventMap[K]) => void,
      options?: AddEventListenerOptions,
    ) => {
      canvas.addEventListener(type, fn as EventListener, options);
      this.offs.push(() => canvas.removeEventListener(type, fn as EventListener, options));
    };
    on('pointerdown', (e) => {
      canvas.setPointerCapture?.(e.pointerId);
      const p = sample(e);
      const ground = this.rig.groundAt(this.ndc(p));
      const w = ground ? groundToWorld(ground) : { x: 0, y: 0 };
      appBus.emit('canvasTap', w);
      this.gestures.down(p);
    });
    on('pointermove', (e) => {
      // A mouse moving over the room with a tray item picked shows where it would go.
      if (e.buttons === 0 && e.pointerType === 'mouse') this.decorate.hover(sample(e));
      this.gestures.move(sample(e));
    });
    on('pointerup', (e) => this.gestures.up(sample(e)));
    on('pointercancel', (e) => this.gestures.cancel(sample(e)));
    on(
      'wheel',
      (e) => {
        e.preventDefault();
        const p = sample(e as unknown as PointerEvent);
        // Trackpad pinches arrive as ctrl+wheel with small deltas: zoom faster for those.
        const speed = e.ctrlKey ? 0.01 : 0.0015;
        this.rig.zoomAt(Math.exp(e.deltaY * speed), this.ndc(p));
      },
      { passive: false },
    );
    on('contextmenu', (e) => e.preventDefault());

    const observer = new ResizeObserver(() => this.resize());
    observer.observe(this.host);
    this.offs.push(() => observer.disconnect());

    this.offs.push(
      appBus.on('showZone', ({ zone }) => this.showZone(zone)),
      appBus.on('resetView', () => this.resetView()),
    );
  }

  private resize(): void {
    const width = Math.max(this.host.clientWidth, 1);
    const height = Math.max(this.host.clientHeight, 1);
    if (width === this.size.width && height === this.size.height) return;
    this.size = { width, height };
    this.renderer.setSize(width, height);
    this.labels.setSize(width, height);
    for (const rig of Object.values(this.rigs)) rig.setAspect(width / height);
  }

  // ---- Input -----------------------------------------------------------------------------------

  private ndc(p: { x: number; y: number }): Vector2 {
    return new Vector2((p.x / this.size.width) * 2 - 1, -(p.y / this.size.height) * 2 + 1);
  }

  /** The object under a screen point: the nearest ray hit, else the closest anchor in reach. */
  private pick(p: { x: number; y: number }): Pickable | null {
    this.raycaster.setFromCamera(this.ndc(p), this.rig.camera);
    const hits = this.raycaster.intersectObject(this.zones[this.zone], true);
    const live = this.live();
    // Several tap areas under the finger (poop usually lies right where its animal stands):
    // take the one whose middle is nearest the finger, so a tap on the poop cleans it and a
    // tap on the animal opens its card.
    const under = new Set<Pickable>();
    for (const hit of hits) {
      const key = hit.object.userData.pickKey as string | undefined;
      const pickable = key ? live.get(key) : undefined;
      if (pickable) under.add(pickable);
    }
    if (under.size === 1) return [...under][0]!;
    if (under.size > 1) return this.nearest(under, p, Infinity);
    // Missed everything: take the nearest object whose middle is within a finger's reach, so
    // far-away or zoomed-out things still get a decent tap target.
    return this.nearest(live.values(), p, MIN_TAP_RADIUS);
  }

  /** Of these, the one whose middle is nearest the point on screen (within `reach` px). */
  private nearest(
    candidates: Iterable<Pickable>,
    p: { x: number; y: number },
    reach: number,
  ): Pickable | null {
    let best: Pickable | null = null;
    let bestDist = reach;
    for (const pickable of candidates) {
      const s = this.toCanvas(this.anchorOf(pickable, 0.5));
      if (!s) continue;
      const d = Math.hypot(s.x - p.x, s.y - p.y);
      if (d < bestDist) {
        best = pickable;
        bestDist = d;
      }
    }
    return best;
  }

  /** The spot on the house's wall strip (world px) under a screen point: the back wall. */
  private wallPoint(q: { x: number; y: number }): { x: number; y: number } | null {
    const ray = this.rig.rayAt(this.ndc(q));
    const hit = ray.intersectPlane(new Plane(new Vector3(0, 0, 1), -BACK_WALL_Z), new Vector3());
    if (!hit || hit.y < -0.5) return null;
    return wallToWallStrip(hit.x, hit.y);
  }

  /** Decorate mode on or off: animals fade, finds hide, the camera makes room for the tray. */
  private setDecorating(on: boolean): void {
    this.items.decorating = on;
    this.care.setDecorating(on);
    const m = animalMaterials();
    for (const material of [m.body, m.outline]) {
      material.transparent = on;
      material.opacity = on ? 0.35 : 1;
      material.needsUpdate = true;
    }
    this.labels.domElement.style.opacity = on ? '0.35' : '';
    this.gestures.cancel();
    const now = performance.now();
    if (!on) {
      this.rig.reset(now, this.reducedMotion());
      return;
    }
    // Zoomed out a little, and the room moved up above the tray.
    const home = this.rig.homeView;
    this.rig.goTo(
      { ...home, zoom: home.zoom * 1.2, target: { x: home.target.x, z: home.target.z + 1 } },
      now,
      this.reducedMotion(),
    );
  }

  /** Everything tappable in the zone on show, by pick key. */
  private live(): Map<string, Pickable> {
    const live = new Map<string, Pickable>();
    // In Decorate mode only placed things (and bowls) take taps, like the original.
    const sources = this.decorate.active
      ? [this.items.pickables(), [...this.care.pickables()].filter((p) => p.kind === 'bowl')]
      : [this.critters.pickables(), this.care.pickables()];
    for (const source of sources) {
      for (const p of source) if (p.zone === this.zone) live.set(pickKey(p.kind, p.id), p);
    }
    return live;
  }

  private pressAt(p: PointerSample): PressHandler | null {
    const target = this.pick(p);
    if (!target) return null;
    if (this.decorate.active) return this.decorate.pressItem(target, p);
    if (target.kind === 'animal') return this.pressAnimal(target.id, p);
    // Everything else acts on a tap (released without dragging off).
    const start = p;
    let moved = false;
    return {
      move: (q) => {
        if (Math.hypot(q.x - start.x, q.y - start.y) > TAP_SLOP * 2) moved = true;
      },
      up: () => {
        if (!moved) this.tapObject(target);
      },
      cancel: () => {},
    };
  }

  /** Tap an animal for its card, hold to pet, drag to carry it to the door. */
  private pressAnimal(id: string, start: PointerSample): PressHandler | null {
    const zone = this.zone;
    const { sim } = this.session;
    const entry = () => this.critters.actor(id);
    return animalPress(
      {
        zone,
        animalId: id,
        select: (animalId) => appBus.emit('selectAnimal', { id: animalId }),
        pet: (animalId) => sim.pet(animalId),
        moveToZone: (animalId, to) => sim.moveAnimalToZone(animalId, to),
        groundAt: (q) => this.rig.groundAt(this.ndc(q)),
        carry: {
          start: () => entry()?.actor.startDrag(),
          to: (g) => entry()?.actor.dragTo(g),
          drop: (goHome) => entry()?.actor.endDrag(performance.now(), this.reducedMotion(), goHome),
          top: () => entry()?.actor.top ?? { x: 0, y: 1, z: 0 },
        },
        doorHint: (state) => this.showDoor(zone, state),
        say: (at, text, color) => this.fx.floatText(this.zones[zone], at, text, color, 22),
        now: () => performance.now(),
        setTimer: (fn, ms) => window.setTimeout(fn, ms),
        clearTimer: (t) => window.clearTimeout(t as number),
      },
      start,
    );
  }

  private tapObject(target: Pickable): void {
    if (target.kind === 'visitor') {
      const visitor = this.session.sim.state.world.gateQueue.find((v) => v.id === target.id);
      if (visitor && !visitor.revealed) this.session.sim.revealVisitor(visitor.id);
      return;
    }
    if (target.kind !== 'animal') this.care.tap(target.kind, target.id);
  }

  private tapGround(p: PointerSample): void {
    if (this.decorate.active) {
      this.decorate.tapEmpty(p);
      return;
    }
    const ground = this.rig.groundAt(this.ndc(p));
    if (ground) this.fx.ripple(this.zones[this.zone], { x: ground.x, y: 0, z: ground.z });
    appBus.emit('selectAnimal', { id: null });
  }

  /** The glowing ring at the door while an animal is carried: brighter when it's close. */
  private showDoor(zone: ViewZone, state: 'off' | 'far' | 'near'): void {
    this.doorState = state;
    this.doorRing.visible = state !== 'off';
    const door = worldToGround(doorOf(zone));
    this.doorRing.position.set(door.x, 0.03, door.z);
    const material = this.doorRing.material as MeshBasicMaterial;
    material.color.set(state === 'near' ? 0x9ff0a8 : 0xffffff);
  }

  /** Coins flying from a spot in the world to the coin counter in the HUD. */
  private coinsFrom(from: Point3, count: number): void {
    const start = this.toCanvas(from);
    if (!start) return;
    const counter = document.querySelector('[data-testid="coins"]');
    const hostRect = this.host.getBoundingClientRect();
    const r = counter?.getBoundingClientRect();
    const to = r
      ? { x: r.left + r.width * 0.25 - hostRect.left, y: r.top + r.height / 2 - hostRect.top }
      : { x: 150, y: 28 };
    this.fx.coinShower(start, to, count);
  }

  // ---- Projection ------------------------------------------------------------------------------

  private anchorOf(p: Pickable, fraction: number): Point3 {
    const v = p.object.getWorldPosition(new Vector3());
    return { x: v.x, y: v.y + p.height * fraction, z: v.z };
  }

  /** Canvas CSS px for a 3D point, or null when it's behind the camera or off the canvas. */
  private toCanvas(point: Point3): ScreenPoint | null {
    const v = this.rig.project(point);
    if (v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) return null;
    return { x: ((v.x + 1) / 2) * this.size.width, y: ((1 - v.y) / 2) * this.size.height };
  }

  private toPage(point: Point3): ScreenPoint | null {
    const c = this.toCanvas(point);
    if (!c) return null;
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: r.left + c.x, y: r.top + c.y };
  }

  // ---- Frame -----------------------------------------------------------------------------------

  private frame(): void {
    const now = performance.now();
    this.rig.update(now);
    // Scenery nearer the camera than ~60% of the way to what it looks at dissolves (trees and
    // fences never hide the yard).
    const { target } = this.rig.view;
    sceneryFade.value =
      this.rig.camera.position.distanceTo(new Vector3(target.x, 0, target.z)) * NEAR_FADE;
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.yard.sync(this.session.sim.state.world);
    this.room.sync(this.session.sim.state.world);
    const ctx = { now, dt, reducedMotion: this.reducedMotion(), cameraYaw: this.rig.view.azimuth };
    this.critters.update(ctx, this.zone);
    this.care.update(ctx);
    this.items.update(this.rig.camera);
    this.decorate.update();
    this.fx.update(now);
    if (this.doorRing.visible) {
      const pulse = ctx.reducedMotion ? 1 : 1 + 0.08 * Math.sin(now / 150);
      this.doorRing.scale.setScalar(pulse * (this.doorState === 'near' ? 1.1 : 1));
    }
    this.renderer.render(this.scene, this.rig.camera);
    this.labels.render(this.scene, this.rig.camera);
    this.notifyView();
    if (!this.readyEmitted) {
      this.readyEmitted = true;
      appBus.emit('worldReady', undefined);
    }
  }

  private notifyView(force = false): void {
    const atHome = this.rig.isAtHome();
    if (atHome === this.atHome && !force) return;
    this.atHome = atHome;
    appBus.emit('viewChanged', { atHome });
  }
}
