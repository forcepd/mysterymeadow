import type { Vec2 } from '../sim/types';

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
  projectObject(kind: 'animal' | 'visitor', id: string): ScreenPoint | null;
  projectWorld(p: Vec2, height?: number): ScreenPoint | null;
  view(): ViewInfo;
  /** What the last frame drew (draw calls and triangles), for the performance budget. */
  stats(): { calls: number; triangles: number };
}

declare global {
  interface Window {
    meadow3d?: Meadow3DHooks;
  }
}
