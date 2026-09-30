import { Vector2 } from 'three';
import { describe, expect, it } from 'vitest';
import { gateSlot, HOUSE_DOOR, INSIDE_DOOR, LAYOUT, yardToWorld } from '../../../src/game/layout';
import { CAMERA_LIMITS, CameraRig, HOME_POLAR, wrapAngle } from '../../../src/world3d/CameraRig';
import {
  framePoints,
  groundToWorld,
  worldToGround,
  type ViewZone,
} from '../../../src/world3d/coords';
import { is3DEnabled } from '../../../src/world3d/flag';

const ASPECTS = {
  'iPad 4:3': 4 / 3,
  'iPad mini 1133x744': 1133 / 744,
  '16:10': 16 / 10,
  '16:9': 16 / 9,
  'ultrawide 21:9': 21 / 9,
};

function onScreen(rig: CameraRig, p: { x: number; y: number; z: number }, margin = 1) {
  const v = rig.project(p);
  return v.z < 1 && Math.abs(v.x) <= margin && Math.abs(v.y) <= margin;
}

describe('world <-> ground mapping', () => {
  it('round-trips and puts the world center at the origin', () => {
    expect(worldToGround({ x: 640, y: 400 })).toEqual({ x: 0, z: 0 });
    for (const p of [{ x: 0, y: 0 }, { x: 1280, y: 800 }, HOUSE_DOOR, gateSlot(2)]) {
      const back = groundToWorld(worldToGround(p));
      expect(back.x).toBeCloseTo(p.x);
      expect(back.y).toBeCloseTo(p.y);
    }
  });

  it('keeps the 2D layout: further down the screen is nearer the default camera (+Z)', () => {
    const top = worldToGround({ x: 640, y: LAYOUT.fenceY });
    const bottom = worldToGround({ x: 640, y: LAYOUT.yard.bottom });
    expect(bottom.z).toBeGreaterThan(top.z);
  });
});

describe('CameraRig default view', () => {
  for (const zone of ['yard', 'house'] as ViewZone[]) {
    for (const [name, aspect] of Object.entries(ASPECTS)) {
      it(`shows the whole ${zone} on ${name}`, () => {
        const rig = new CameraRig(framePoints(zone), aspect);
        for (const p of framePoints(zone)) expect(onScreen(rig, p, 0.95)).toBe(true);
        // ...and fills the screen (not tiny): some point is near an edge.
        const extent = Math.max(
          ...framePoints(zone).map((p) => {
            const v = rig.project(p);
            return Math.max(Math.abs(v.x), Math.abs(v.y));
          }),
        );
        expect(extent).toBeGreaterThan(0.9);
      });
    }
  }

  it('shows every spot the game uses: gate queue, yard corners, doors', () => {
    const rig = new CameraRig(framePoints('yard'), 4 / 3);
    const spots = [
      gateSlot(0),
      gateSlot(2),
      HOUSE_DOOR,
      yardToWorld({ x: 0, y: 0 }),
      yardToWorld({ x: 1, y: 1 }),
      yardToWorld({ x: 0, y: 1 }),
    ];
    for (const s of spots) expect(onScreen(rig, { ...worldToGround(s), y: 0 })).toBe(true);
    const house = new CameraRig(framePoints('house'), 4 / 3);
    expect(onScreen(house, { ...worldToGround(INSIDE_DOOR), y: 0 })).toBe(true);
  });

  it('starts at home, looking from the front at the home angle', () => {
    const rig = new CameraRig(framePoints('yard'));
    expect(rig.isAtHome()).toBe(true);
    expect(rig.view.azimuth).toBe(0);
    expect(rig.view.polar).toBeCloseTo(HOME_POLAR);
    expect(rig.camera.position.z).toBeGreaterThan(rig.view.target.z);
  });

  it('refits when the screen changes shape, staying at home', () => {
    const rig = new CameraRig(framePoints('yard'), 16 / 9);
    rig.setAspect(4 / 3);
    expect(rig.isAtHome()).toBe(true);
    for (const p of framePoints('yard')) expect(onScreen(rig, p, 0.95)).toBe(true);
  });
});

describe('CameraRig controls', () => {
  it('orbits around, and a drag down tips the camera toward overhead', () => {
    const rig = new CameraRig(framePoints('yard'));
    rig.orbit(200, 0, 800);
    expect(rig.view.azimuth).toBeCloseTo(-Math.PI / 4);
    expect(rig.isAtHome()).toBe(false);
    const polar = rig.view.polar;
    rig.orbit(0, 50, 800);
    expect(rig.view.polar).toBeLessThan(polar);
  });

  it('never goes below 20 degrees above the ground, or past overhead', () => {
    const rig = new CameraRig(framePoints('yard'));
    rig.orbit(0, -100_000, 800);
    expect(rig.view.polar).toBe(CAMERA_LIMITS.maxPolar);
    expect(rig.camera.position.y).toBeGreaterThan(0);
    rig.orbit(0, 100_000, 800);
    expect(rig.view.polar).toBe(CAMERA_LIMITS.minPolar);
  });

  it('keeps orbiting all the way around', () => {
    const rig = new CameraRig(framePoints('yard'));
    rig.orbit(1600, 0, 800); // a full turn
    expect(Math.abs(wrapAngle(rig.view.azimuth))).toBeCloseTo(0);
  });

  it('clamps zoom', () => {
    const rig = new CameraRig(framePoints('yard'));
    rig.zoomAt(0.001);
    expect(rig.view.zoom).toBe(CAMERA_LIMITS.minZoom);
    rig.zoomAt(1000);
    expect(rig.view.zoom).toBe(CAMERA_LIMITS.maxZoom);
  });

  it('zooms toward the point under the finger, which stays put', () => {
    const rig = new CameraRig(framePoints('yard'));
    const ndc = new Vector2(0.4, -0.3);
    const before = rig.groundAt(ndc)!;
    rig.zoomAt(0.6, ndc);
    const after = rig.groundAt(ndc)!;
    expect(after.x).toBeCloseTo(before.x, 3);
    expect(after.z).toBeCloseTo(before.z, 3);
  });

  it('pans so the grabbed ground point follows the finger, within the zone', () => {
    const rig = new CameraRig(framePoints('yard'));
    rig.zoomAt(0.5);
    const from = new Vector2(0, 0);
    const to = new Vector2(0.2, 0.1);
    const grabbed = rig.groundAt(from)!;
    rig.pan(from, to);
    const now = rig.groundAt(to)!;
    expect(now.x).toBeCloseTo(grabbed.x, 3);
    expect(now.z).toBeCloseTo(grabbed.z, 3);
    // A huge pan stops at the edge of the zone.
    for (let i = 0; i < 50; i++) rig.pan(new Vector2(0.9, 0), new Vector2(-0.9, 0));
    const edge = Math.max(...framePoints('yard').map((p) => p.x));
    expect(rig.view.target.x).toBeLessThanOrEqual(edge + 1e-9);
  });

  it('resets home: instantly, or animated the short way around', () => {
    const rig = new CameraRig(framePoints('yard'));
    rig.orbit(1500, 80, 800); // nearly a full turn
    rig.zoomAt(0.5);
    rig.reset(0, true);
    expect(rig.isAtHome()).toBe(true);

    rig.orbit(1500, 80, 800);
    const start = rig.view.azimuth;
    rig.reset(1000);
    expect(rig.update(1100)).toBe(true);
    // The short way from ~337 degrees home is up through 360, not back down through 180.
    expect(rig.view.azimuth).toBeLessThan(start);
    expect(rig.update(2000)).toBe(false);
    expect(rig.isAtHome()).toBe(true);
  });

  it('a new gesture interrupts a reset', () => {
    const rig = new CameraRig(framePoints('yard'));
    rig.orbit(300, 0, 800);
    rig.reset(0);
    rig.update(100);
    rig.orbit(10, 0, 800);
    expect(rig.update(5000)).toBe(false);
    expect(rig.isAtHome()).toBe(false);
  });

  it('always has ground under the screen, even at the lowest angle', () => {
    const rig = new CameraRig(framePoints('yard'));
    expect(rig.groundAt(new Vector2(0, 0))).not.toBeNull();
    rig.orbit(0, -100_000, 800);
    for (const y of [-1, 0, 1]) expect(rig.groundAt(new Vector2(0, y))).not.toBeNull();
  });
});

describe('3D flag', () => {
  it('is on with ?3d, off otherwise', () => {
    expect(is3DEnabled('?3d')).toBe(true);
    expect(is3DEnabled('?3d=1')).toBe(true);
    expect(is3DEnabled('?x=1&3d')).toBe(true);
    expect(is3DEnabled('')).toBe(false);
    expect(is3DEnabled('?3d=0')).toBe(false);
    expect(is3DEnabled('?3d=false')).toBe(false);
  });
});
