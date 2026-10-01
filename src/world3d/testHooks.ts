import type { Vec2 } from '../sim/types';
import type { PickKind } from './pick';

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface ViewInfo {
  zone: 'yard' | 'house';
  azimuth: number;
  polar: number;
  zoom: number;
  atHome: boolean;
}

/**
 * Read-only hooks into the 3D world on `window.meadow3d`, so e2e tests can find things on screen
 * wherever the camera is. Page coordinates (CSS px).
 */
export interface Meadow3DHooks {
  projectObject(kind: PickKind, id: string): ScreenPoint | null;
  projectWorld(p: Vec2, height?: number): ScreenPoint | null;
  view(): ViewInfo;
  /** What the last frame drew (draw calls and triangles), for the performance budget. */
  stats(): { calls: number; triangles: number };
  /** Where the Vet Clinic's patient is on the page (null when it's closed). */
  projectPatient(): ScreenPoint | null;
  /** The player's avatar in the zone on show: where it is and what it's doing. */
  avatar(): {
    zone: 'yard' | 'house';
    x: number;
    z: number;
    walking: boolean;
    sitting: boolean;
    seat: string | null;
  };
  /** Effect particles alive right now. */
  particles(): number;
}

declare global {
  interface Window {
    meadow3d?: Meadow3DHooks;
  }
}
