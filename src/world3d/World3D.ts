import {
  Color,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  PCFShadowMap,
  Raycaster,
  RingGeometry,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Object3D,
} from 'three';
import { appBus } from '../bridge/appBus';
import type { GameSession } from '../bridge/gameSession';
import { gateSlot, zoneToWorld } from '../game/layout';
import type { Vec2 } from '../sim/types';
import { CameraRig } from './CameraRig';
import { framePoints, groundToWorld, worldToGround, type Point3, type ViewZone } from './coords';
import { GestureRecognizer, TAP_SLOP, type PointerSample, type PressHandler } from './gestures';
import type { ScreenPoint, ViewInfo } from './testHooks';
import { buildHousePlaceholder } from './placeholders';
import { sceneryFade } from './art/toon';
import { Yard } from './yard/Yard';
import { SKY_HORIZON } from './yard/scenery';
import {
  animalStandIn,
  PICK_KEY,
  selectionRing,
  STAND_IN_HEIGHT,
  variantColor,
  visitorStandIn,
  type StandIn,
  type VisitorStandIn,
} from './standIns';

/** Device pixel ratio cap: sharp on Retina iPads without drawing 9x the pixels on 3x screens. */
const MAX_PIXEL_RATIO = 2;
/** A tap this close (CSS px) to an object's on-screen anchor counts as on it (DESIGN 17.5). */
const MIN_TAP_RADIUS = 30;
/** Scenery closer than this fraction of the camera's distance fades away. */
const NEAR_FADE = 0.6;

type PickKind = 'animal' | 'visitor';

interface Pickable {
  kind: PickKind;
  id: string;
  zone: ViewZone;
  object: Object3D;
  /** Anchor height above the object's origin, for projection and near-taps. */
  height: number;
}

interface Ripple {
  mesh: Mesh;
  start: number;
}

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
  private readonly pickables = new Map<string, Pickable>();
  private readonly animals = new Map<string, StandIn>();
  private readonly visitors = new Map<string, VisitorStandIn>();
  private readonly ring = selectionRing();
  private readonly ripples: Ripple[] = [];
  private readonly rippleGeo = new RingGeometry(0.15, 0.22, 32);
  private selectedId: string | null = null;
  private atHome = true;
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

    this.scene.background = new Color(SKY_HORIZON);
    this.scene.fog = new Fog(SKY_HORIZON, 32, 85);
    this.addLights();

    this.zones = { yard: this.yard.group, house: buildHousePlaceholder() };
    this.zones.house.visible = false;
    this.scene.add(this.zones.yard, this.zones.house, this.ring);

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
    this.reconcile();
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

  /** Where an animal or visitor (its middle) is on the page, or null if hidden or off screen. */
  projectObject(kind: PickKind, id: string): ScreenPoint | null {
    const p = this.pickables.get(`${kind}:${id}`);
    if (!p || p.zone !== this.zone || !p.object.visible) return null;
    return this.toPage(this.anchorOf(p, 0.5));
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
    this.scene.traverse((o) => {
      if (o instanceof Mesh) {
        o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => m.dispose());
      }
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
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
    on('pointermove', (e) => this.gestures.move(sample(e)));
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
      appBus.on('selectAnimal', ({ id }) => {
        this.selectedId = id;
      }),
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
    for (const hit of hits) {
      const key = hit.object.userData[PICK_KEY] as string | undefined;
      const pickable = key ? this.pickables.get(key) : undefined;
      if (pickable && this.isLive(pickable)) return pickable;
    }
    // Missed everything: take the nearest object whose middle is within a finger's reach, so
    // far-away or zoomed-out things still get a decent tap target.
    let best: Pickable | null = null;
    let bestDist = MIN_TAP_RADIUS;
    for (const pickable of this.pickables.values()) {
      if (!this.isLive(pickable)) continue;
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

  private isLive(p: Pickable): boolean {
    return p.zone === this.zone && p.object.visible;
  }

  private pressAt(p: PointerSample): PressHandler | null {
    const target = this.pick(p);
    if (!target) return null;
    const start = p;
    let moved = false;
    return {
      move: (q) => {
        if (Math.hypot(q.x - start.x, q.y - start.y) > TAP_SLOP) moved = true;
      },
      // Hold (pet) and drag (to the door) arrive in Phase 3D-3; for now a press is a tap.
      up: () => {
        if (!moved) this.tapObject(target);
      },
      cancel: () => {},
    };
  }

  private tapObject(target: Pickable): void {
    if (target.kind === 'animal') {
      appBus.emit('selectAnimal', { id: target.id });
      return;
    }
    const visitor = this.session.sim.state.world.gateQueue.find((v) => v.id === target.id);
    if (visitor && !visitor.revealed) this.session.sim.revealVisitor(visitor.id);
  }

  private tapGround(p: PointerSample): void {
    const ground = this.rig.groundAt(this.ndc(p));
    if (ground) this.ripple(ground.x, ground.z);
    appBus.emit('selectAnimal', { id: null });
  }

  private ripple(x: number, z: number): void {
    const mesh = new Mesh(
      this.rippleGeo,
      new MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.03, z);
    this.zones[this.zone].add(mesh);
    this.ripples.push({ mesh, start: performance.now() });
  }

  // ---- Projection ------------------------------------------------------------------------------

  private anchorOf(p: Pickable, fraction: number): Point3 {
    const v = p.object.getWorldPosition(new Vector3());
    return { x: v.x, y: v.y + p.height * p.object.scale.y * fraction, z: v.z };
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
    this.reconcile();
    this.updateRipples(now);
    this.renderer.render(this.scene, this.rig.camera);
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

  private updateRipples(now: number): void {
    const still = this.reducedMotion();
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i]!;
      const t = (now - r.start) / 500;
      if (t >= 1) {
        r.mesh.removeFromParent();
        (r.mesh.material as MeshBasicMaterial).dispose();
        this.ripples.splice(i, 1);
        continue;
      }
      if (!still) r.mesh.scale.setScalar(1 + t * 2.5);
      (r.mesh.material as MeshBasicMaterial).opacity = 0.8 * (1 - t);
    }
  }

  /** Brings the 3D objects in line with the sim. */
  private reconcile(): void {
    const { world } = this.session.sim.state;
    this.yard.sync(world);

    const seen = new Set<string>();
    for (const animal of world.animals) {
      seen.add(animal.id);
      let s = this.animals.get(animal.id);
      if (!s) {
        s = animalStandIn(`animal:${animal.id}`);
        this.animals.set(animal.id, s);
        this.pickables.set(`animal:${animal.id}`, {
          kind: 'animal',
          id: animal.id,
          zone: animal.zone,
          object: s.group,
          height: STAND_IN_HEIGHT,
        });
      }
      const badges = this.session.sim.badges(animal.id);
      s.setLook({
        color: variantColor(animal.speciesId, animal.variantId),
        baby: badges.includes('baby'),
        sparkle: animal.isSparkle,
      });
      if (s.group.parent !== this.zones[animal.zone]) this.zones[animal.zone].add(s.group);
      this.pickables.get(`animal:${animal.id}`)!.zone = animal.zone;
      this.place(s.group, zoneToWorld(animal.zone, animal.position));
    }
    this.prune(this.animals, seen, 'animal');

    const queued = new Set<string>();
    world.gateQueue.forEach((visitor, i) => {
      queued.add(visitor.id);
      let s = this.visitors.get(visitor.id);
      if (!s) {
        s = visitorStandIn(`visitor:${visitor.id}`);
        this.visitors.set(visitor.id, s);
        this.zones.yard.add(s.group);
        this.pickables.set(`visitor:${visitor.id}`, {
          kind: 'visitor',
          id: visitor.id,
          zone: 'yard',
          object: s.group,
          height: STAND_IN_HEIGHT,
        });
      }
      s.setLook({
        color: variantColor(visitor.roll.speciesId, visitor.roll.variantId),
        baby: false,
        sparkle: visitor.roll.isSparkle,
      });
      s.setRevealed(visitor.revealed);
      this.place(s.group, gateSlot(i));
    });
    this.prune(this.visitors, queued, 'visitor');

    // The selection ring sits under the selected animal when it's in view.
    const selected = this.selectedId ? this.animals.get(this.selectedId) : undefined;
    const pick = this.selectedId ? this.pickables.get(`animal:${this.selectedId}`) : undefined;
    this.ring.visible = !!selected && !!pick && pick.zone === this.zone;
    if (selected && this.ring.visible) {
      this.ring.position.x = selected.group.position.x;
      this.ring.position.z = selected.group.position.z;
      this.ring.scale.setScalar(selected.group.scale.x);
    }
  }

  private place(object: Object3D, world: Vec2): void {
    const g = worldToGround(world);
    object.position.set(g.x, 0, g.z);
    // Face the default camera, like the original's front-facing sprites.
    object.rotation.y = 0;
  }

  private prune(map: Map<string, StandIn>, keep: Set<string>, kind: PickKind): void {
    for (const [id, s] of map) {
      if (keep.has(id)) continue;
      s.group.removeFromParent();
      map.delete(id);
      this.pickables.delete(`${kind}:${id}`);
      if (this.selectedId === id) this.selectedId = null;
    }
  }
}
