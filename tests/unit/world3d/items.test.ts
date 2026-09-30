import { Box3, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../../src/config/balance';
import { ITEMS, isPlaceable, layerOf, type PlaceableItemDef } from '../../../src/config/items';
import { YARD_GRID } from '../../../src/config/yard';
import { ROOM, tileRect } from '../../../src/game/layout';
import type { PlacedItem, Zone } from '../../../src/sim/types';
import {
  BACK_WALL_Z,
  WALL_ART,
  wallStripToWall,
  wallToWallStrip,
  worldToGround,
} from '../../../src/world3d/coords';
import { itemModel } from '../../../src/world3d/items/itemModels';
import { placeItem, rotatedSize, tileScale } from '../../../src/world3d/items/placement3d';

const placeable = ITEMS.filter(isPlaceable) as PlaceableItemDef[];
const houseGrids = BALANCE.houseTiers.map((t) => ({
  cols: t.interiorGrid[0],
  rows: t.interiorGrid[1],
}));
const ROTATIONS: PlacedItem['rotation'][] = [0, 90, 180, 270];

function zoneFor(def: PlaceableItemDef): Zone {
  return def.category === 'lure' ? 'yard' : 'house';
}

describe('back wall mapping', () => {
  it('round-trips between the wall strip and the 3D wall', () => {
    for (const p of [
      { x: ROOM.left, y: ROOM.wallTop },
      { x: 640, y: (ROOM.wallTop + ROOM.wallBottom) / 2 },
      { x: ROOM.right, y: ROOM.wallBottom },
    ]) {
      const w = wallStripToWall(p);
      expect(w.z).toBeCloseTo(BACK_WALL_Z);
      const back = wallToWallStrip(w.x, w.y);
      expect(back.x).toBeCloseTo(p.x);
      expect(back.y).toBeCloseTo(p.y);
    }
    expect(wallStripToWall({ x: 0, y: ROOM.wallTop }).y).toBeCloseTo(WALL_ART.top);
    expect(wallStripToWall({ x: 0, y: ROOM.wallBottom }).y).toBeCloseTo(WALL_ART.bottom);
  });
});

describe('placing items in 3D', () => {
  it('fills the footprint on the floor, turned, at every tier and rotation', () => {
    for (const def of placeable) {
      if (layerOf(def) === 'wall') continue;
      const zone = zoneFor(def);
      const grids = zone === 'yard' ? [YARD_GRID] : houseGrids;
      for (const grid of grids) {
        for (const rotation of ROTATIONS) {
          const tile = { x: 1, y: 1 };
          const at = placeItem(def, { zone, tile, rotation }, grid);
          const r = tileRect(zone, grid, tile, rotatedSize(def, rotation));
          const center = worldToGround({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
          expect(at.x).toBeCloseTo(center.x);
          expect(at.z).toBeCloseTo(center.z);
          // Turned back to its own size: width x depth swap at 90 and 270.
          const turned = rotation === 90 || rotation === 270;
          expect(turned ? at.d : at.w).toBeCloseTo(r.w / 100);
          expect(turned ? at.w : at.d).toBeCloseTo(r.h / 100);
          expect(at.yaw).toBeCloseTo((-rotation * Math.PI) / 180);
        }
      }
    }
  });

  it('hangs wall items on the back wall, mirrored when turned around', () => {
    for (const def of placeable.filter((d) => layerOf(d) === 'wall')) {
      for (const grid of houseGrids) {
        const at = placeItem(
          def,
          { zone: 'house', tile: { x: 0, y: 0 }, rotation: 0 },
          { ...grid, rows: 1 },
        );
        expect(at.z).toBeGreaterThan(BACK_WALL_Z);
        expect(at.z).toBeLessThan(BACK_WALL_Z + 0.1);
        expect(at.y - at.d / 2).toBeGreaterThanOrEqual(WALL_ART.bottom - 1e-6);
        expect(at.y + at.d / 2).toBeLessThanOrEqual(WALL_ART.top + 1e-6);
        const flipped = placeItem(
          def,
          { zone: 'house', tile: { x: 0, y: 0 }, rotation: 180 },
          { ...grid, rows: 1 },
        );
        expect(flipped.mirror).toBe(true);
      }
    }
  });

  it('rugs lie on the floor, under everything', () => {
    for (const def of placeable.filter((d) => layerOf(d) === 'rug')) {
      const at = placeItem(
        def,
        { zone: 'house', tile: { x: 0, y: 0 }, rotation: 0 },
        houseGrids[0]!,
      );
      expect(at.y).toBeGreaterThan(0);
      expect(at.y).toBeLessThan(0.01);
    }
  });

  it('things get smaller in bigger houses, like the original tiles', () => {
    const scales = houseGrids.map((g) => tileScale('house', g));
    for (let i = 1; i < scales.length; i++) expect(scales[i]).toBeLessThanOrEqual(scales[i - 1]!);
  });
});

describe('3D item models', () => {
  it('builds every item, staying inside its footprint and standing on the floor', () => {
    for (const def of placeable) {
      const zone = zoneFor(def);
      const grid = zone === 'yard' ? YARD_GRID : houseGrids[0]!;
      const at = placeItem(
        def,
        { zone, tile: { x: 0, y: 0 }, rotation: 0 },
        layerOf(def) === 'wall' ? { ...grid, rows: 1 } : grid,
      );
      const mesh = itemModel(def.id, at.w, at.d, at.s);
      const box = new Box3().setFromBufferAttribute(
        mesh.geometry.getAttribute('position') as never,
      );
      const size = box.getSize(new Vector3());
      expect(size.length(), def.id).toBeGreaterThan(0.05);
      if (layerOf(def) === 'wall') {
        // A picture: flat against the wall, no wider or taller than its space.
        expect(size.z, def.id).toBeLessThan(0.2);
        expect(size.x, def.id).toBeLessThanOrEqual(at.w + 0.02);
        expect(size.y, def.id).toBeLessThanOrEqual(at.d + 0.05);
      } else {
        expect(box.min.y, def.id).toBeGreaterThanOrEqual(-0.05);
        // A little overhang is fine (a bird on the bath's rim), but it stays on its tiles.
        expect(size.x, def.id).toBeLessThanOrEqual(at.w + 0.1);
        expect(size.z, def.id).toBeLessThanOrEqual(at.d + 0.1);
      }
    }
  });

  it('shares one model per item and size', () => {
    const a = itemModel('sofa', 2, 0.7, 1);
    const b = itemModel('sofa', 2, 0.7, 1);
    expect(a.geometry).toBe(b.geometry);
    expect(itemModel('sofa', 1.5, 0.7, 1).geometry).not.toBe(a.geometry);
  });
});
