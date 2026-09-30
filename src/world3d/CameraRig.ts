import { MathUtils, PerspectiveCamera, Plane, Ray, Vector2, Vector3 } from 'three';
import type { GroundPoint, Point3 } from './coords';

const deg = MathUtils.degToRad;

/** Camera limits (DESIGN-3D "Camera and input rules"). */
export const CAMERA_LIMITS = {
  /** Polar angle from straight down: never quite overhead... */
  minPolar: deg(4),
  /** ...and never lower than 12 degrees above the ground (a sliver of sky over the hills). */
  maxPolar: deg(78),
  /** Zoom is the camera distance as a fraction of the default (fitted) distance. */
  minZoom: 0.3,
  maxZoom: 1.3,
} as const;

/** The default 3/4 view: looking down from the front (the original's point of view). */
export const HOME_POLAR = deg(40);
export const FOV = 30;
/** Where the frame's points must fit on screen (NDC units; 1 = the edge). */
const FIT_MARGIN = 0.94;
const RESET_MS = 450;

export interface ViewState {
  /** Around the vertical axis; 0 = camera in front (+Z), looking toward the back. */
  azimuth: number;
  /** From straight down (0) toward the horizon. */
  polar: number;
  /** Distance as a fraction of the fitted distance. */
  zoom: number;
  /** Where the camera looks, on the ground. */
  target: GroundPoint;
}

interface Tween {
  from: ViewState;
  to: ViewState;
  start: number;
}

const GROUND = new Plane(new Vector3(0, 1, 0), 0);

/**
 * Orbit camera for one zone. The default view fits the zone's frame points to the screen like
 * the original's fixed 2D view; players can orbit, zoom (toward a point), and pan within limits,
 * and reset back. All input is in screen terms (pixels, NDC), so it's testable without a DOM.
 */
export class CameraRig {
  readonly camera = new PerspectiveCamera(FOV, 16 / 10, 0.1, 300);
  view: ViewState;
  private home: ViewState;
  private fitDistance = 20;
  private readonly bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  private tween: Tween | null = null;

  constructor(
    private readonly points: readonly Point3[],
    aspect = 16 / 10,
  ) {
    const xs = points.map((p) => p.x);
    const zs = points.map((p) => p.z);
    this.bounds = {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minZ: Math.min(...zs),
      maxZ: Math.max(...zs),
    };
    this.home = {
      azimuth: 0,
      polar: HOME_POLAR,
      zoom: 1,
      target: {
        x: (this.bounds.minX + this.bounds.maxX) / 2,
        z: (this.bounds.minZ + this.bounds.maxZ) / 2,
      },
    };
    this.view = cloneView(this.home);
    this.setAspect(aspect);
  }

  /** Refits the default view for a new screen shape, keeping the player's relative zoom. */
  setAspect(aspect: number): void {
    const atHome = this.isAtHome();
    this.camera.aspect = aspect;
    this.fit();
    if (atHome) this.view = cloneView(this.home);
    this.apply();
  }

  /** Orbit by a drag of (dx, dy) CSS px on a viewport `height` px tall. */
  orbit(dx: number, dy: number, height: number): void {
    this.stopTween();
    const turn = Math.PI / Math.max(height, 1);
    this.view.azimuth -= dx * turn;
    this.view.polar = MathUtils.clamp(
      this.view.polar - dy * turn,
      CAMERA_LIMITS.minPolar,
      CAMERA_LIMITS.maxPolar,
    );
    this.apply();
  }

  /**
   * Zoom by `factor` (< 1 = closer), keeping the ground point under `ndc` (if any) in place,
   * like a map. The camera distance and look-at point stay within limits.
   */
  zoomAt(factor: number, ndc?: Vector2): void {
    this.stopTween();
    const before = this.view.zoom;
    const zoom = MathUtils.clamp(before * factor, CAMERA_LIMITS.minZoom, CAMERA_LIMITS.maxZoom);
    if (zoom === before) return;
    const anchor = ndc ? this.groundAt(ndc) : null;
    this.view.zoom = zoom;
    if (anchor) {
      const ratio = zoom / before;
      this.view.target = {
        x: anchor.x + (this.view.target.x - anchor.x) * ratio,
        z: anchor.z + (this.view.target.z - anchor.z) * ratio,
      };
    }
    this.clampTarget();
    this.apply();
  }

  /** Slide the view so the ground point under `from` ends up under `to` (two-finger pan). */
  pan(from: Vector2, to: Vector2): void {
    this.stopTween();
    const a = this.groundAt(from);
    const b = this.groundAt(to);
    if (!a || !b) return;
    this.view.target = {
      x: this.view.target.x + (a.x - b.x),
      z: this.view.target.z + (a.z - b.z),
    };
    this.clampTarget();
    this.apply();
  }

  /** Back to the default view (animated unless `instant`). */
  reset(now: number, instant = false): void {
    const to = cloneView(this.home);
    // Take the short way around.
    to.azimuth = this.view.azimuth + wrapAngle(to.azimuth - this.view.azimuth);
    if (instant) {
      this.tween = null;
      this.view = cloneView(this.home);
      this.apply();
      return;
    }
    this.tween = { from: cloneView(this.view), to, start: now };
  }

  /** Advances the reset animation. Returns true while it's still moving. */
  update(now: number): boolean {
    const tween = this.tween;
    if (!tween) return false;
    const t = MathUtils.clamp((now - tween.start) / RESET_MS, 0, 1);
    const e = 1 - (1 - t) ** 3;
    const { from, to } = tween;
    this.view = {
      azimuth: MathUtils.lerp(from.azimuth, to.azimuth, e),
      polar: MathUtils.lerp(from.polar, to.polar, e),
      zoom: MathUtils.lerp(from.zoom, to.zoom, e),
      target: {
        x: MathUtils.lerp(from.target.x, to.target.x, e),
        z: MathUtils.lerp(from.target.z, to.target.z, e),
      },
    };
    if (t >= 1) {
      this.tween = null;
      this.view = cloneView(this.home);
    }
    this.apply();
    return this.tween !== null;
  }

  isAtHome(): boolean {
    const v = this.view;
    const h = this.home;
    return (
      Math.abs(wrapAngle(v.azimuth - h.azimuth)) < 0.01 &&
      Math.abs(v.polar - h.polar) < 0.01 &&
      Math.abs(v.zoom - h.zoom) < 0.01 &&
      Math.hypot(v.target.x - h.target.x, v.target.z - h.target.z) < 0.02
    );
  }

  /** The ground point under a screen point (NDC), or null when looking at the sky. */
  groundAt(ndc: Vector2): GroundPoint | null {
    const ray = this.rayAt(ndc);
    const hit = ray.intersectPlane(GROUND, new Vector3());
    return hit ? { x: hit.x, z: hit.z } : null;
  }

  rayAt(ndc: Vector2): Ray {
    this.camera.updateMatrixWorld();
    const origin = new Vector3().setFromMatrixPosition(this.camera.matrixWorld);
    const dir = new Vector3(ndc.x, ndc.y, 0.5).unproject(this.camera).sub(origin).normalize();
    return new Ray(origin, dir);
  }

  /** A 3D point in NDC (x, y in -1..1 when on screen; z > 1 = behind the camera). */
  project(p: Point3): Vector3 {
    this.camera.updateMatrixWorld();
    return new Vector3(p.x, p.y, p.z).project(this.camera);
  }

  private stopTween(): void {
    this.tween = null;
  }

  private clampTarget(): void {
    const b = this.bounds;
    this.view.target = {
      x: MathUtils.clamp(this.view.target.x, b.minX, b.maxX),
      z: MathUtils.clamp(this.view.target.z, b.minZ, b.maxZ),
    };
  }

  /** Places the camera for `view` at `fitDistance * zoom`. */
  private apply(view = this.view, distance = this.fitDistance * view.zoom): void {
    const { azimuth, polar, target } = view;
    const s = Math.sin(polar);
    this.camera.position.set(
      target.x + distance * s * Math.sin(azimuth),
      distance * Math.cos(polar),
      target.z + distance * s * Math.cos(azimuth),
    );
    this.camera.lookAt(target.x, 0, target.z);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
  }

  /**
   * Finds the home view: the closest camera (at the home angle) that shows every frame point,
   * with the look-at point nudged so the margins above and below match.
   */
  private fit(): void {
    const home = this.home;
    for (let pass = 0; pass < 4; pass++) {
      let lo = 1;
      let hi = 400;
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        if (this.fitsAt(home, mid)) hi = mid;
        else lo = mid;
      }
      this.fitDistance = hi;
      this.apply(home, hi);
      // Center the points vertically: look at the ground under the middle of their extent.
      const ys = this.points.map((p) => this.project(p).y);
      const middle = (Math.min(...ys) + Math.max(...ys)) / 2;
      const center = this.groundAt(new Vector2(0, middle));
      if (!center) break;
      home.target = center;
    }
    this.apply(home, this.fitDistance);
  }

  private fitsAt(view: ViewState, distance: number): boolean {
    this.apply(view, distance);
    return this.points.every((p) => {
      const v = this.project(p);
      return v.z < 1 && Math.abs(v.x) <= FIT_MARGIN && Math.abs(v.y) <= FIT_MARGIN;
    });
  }
}

function cloneView(v: ViewState): ViewState {
  return { ...v, target: { ...v.target } };
}

/** An angle wrapped into -PI..PI. */
export function wrapAngle(a: number): number {
  const twoPi = Math.PI * 2;
  return a - twoPi * Math.floor((a + Math.PI) / twoPi);
}
