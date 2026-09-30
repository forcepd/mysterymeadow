import { Box3, Color, Mesh, Vector3, type BufferGeometry } from 'three';
import { describe, expect, it } from 'vitest';
import { HOUSE_COLORS } from '../../../src/config/houseColors';
import { gateSlot, HOUSE_DOOR, LAYOUT, tileToWorld, yardToWorld } from '../../../src/game/layout';
import { sceneryFade, toonMaterial } from '../../../src/world3d/art/toon';
import { HOUSE_BOX, HOUSE_HEIGHT, toUnits, worldToGround } from '../../../src/world3d/coords';
import { buildHouse, houseCenter, type HouseTier } from '../../../src/world3d/yard/house';
import { buildYardScenery, FLOWER_HEIGHT } from '../../../src/world3d/yard/scenery';
import { terrainHeight } from '../../../src/world3d/yard/terrain';

const scenery = buildYardScenery();

/** Every vertex of a mesh, in world space (the scenery meshes sit at the origin). */
function vertices(mesh: Mesh): Vector3[] {
  mesh.updateMatrixWorld(true);
  const pos = (mesh.geometry as BufferGeometry).getAttribute('position');
  const out: Vector3[] = [];
  for (let i = 0; i < pos.count; i++) {
    out.push(new Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(mesh.matrixWorld));
  }
  return out;
}

const solid = vertices(scenery.solid);

/** Solid scenery taller than `height` within `radius` units of a world spot. */
function tallNear(spot: { x: number; y: number }, radius: number, height = 0.3) {
  const g = worldToGround(spot);
  return solid.filter((v) => v.y > height && Math.hypot(v.x - g.x, v.z - g.z) < radius);
}

describe('terrain', () => {
  it('is flat wherever the game puts things', () => {
    const spots = [
      yardToWorld({ x: 0, y: 0 }),
      yardToWorld({ x: 1, y: 1 }),
      yardToWorld({ x: 0.5, y: 0.5 }),
      HOUSE_DOOR,
      tileToWorld({ x: 0, y: 0 }),
      ...Array.from({ length: 8 }, (_, i) => gateSlot(i)),
      { x: -200, y: -300 },
      { x: 1500, y: 900 },
    ];
    for (const s of spots) {
      const g = worldToGround(s);
      expect(terrainHeight(g.x, g.z), `flat at ${s.x},${s.y}`).toBe(0);
    }
  });

  it('rolls into hills far from the yard, smoothly', () => {
    expect(terrainHeight(30, 0)).toBeGreaterThan(0.5);
    expect(terrainHeight(0, -30)).toBeGreaterThan(0.5);
    // No cliffs: neighboring points differ only a little.
    for (let x = -40; x <= 40; x += 2) {
      for (let z = -40; z <= 40; z += 2) {
        expect(Math.abs(terrainHeight(x, z) - terrainHeight(x + 0.5, z))).toBeLessThan(0.4);
      }
    }
  });
});

describe('yard scenery keeps the play area clear', () => {
  it('nothing taller than a flower stands in the yard where animals go', () => {
    const { left, top, right, bottom } = LAYOUT.yard;
    const a = worldToGround({ x: left - 30, y: top - 30 });
    const b = worldToGround({ x: right + 30, y: bottom + 30 });
    const inside = solid.filter(
      (v) => v.x > a.x && v.x < b.x && v.z > a.z && v.z < b.z && v.y > FLOWER_HEIGHT + 0.02,
    );
    expect(inside).toEqual([]);
  });

  it('the gate queue, the gate opening and the house door stay clear', () => {
    for (let i = 0; i < 6; i++) expect(tallNear(gateSlot(i), 0.7), `gate slot ${i}`).toEqual([]);
    // Between the gate posts: an open gap in the fence.
    const { gate, fenceY } = LAYOUT;
    for (let x = gate.x + 30; x <= gate.x + gate.width - 30; x += 20) {
      expect(tallNear({ x, y: fenceY }, 0.12, 0.05), `gate gap at ${x}`).toEqual([]);
    }
    expect(tallNear(HOUSE_DOOR, 0.4)).toEqual([]);
  });

  it('the fence runs along the top of the yard, beside the gate', () => {
    const { gate, fenceY } = LAYOUT;
    for (const x of [500, 800, gate.x - 40, gate.x + gate.width + 60]) {
      expect(tallNear({ x, y: fenceY }, 0.3).length, `fence at ${x}`).toBeGreaterThan(0);
    }
  });

  it('flowers are short, so they can go anywhere', () => {
    const flowers = vertices(scenery.flowers);
    expect(flowers.length).toBeGreaterThan(0);
    for (const v of flowers)
      expect(v.y - terrainHeight(v.x, v.z)).toBeLessThan(FLOWER_HEIGHT + 0.03);
  });

  it('is only a few meshes (merged for the iPad)', () => {
    let meshes = 0;
    scenery.group.traverse((o) => {
      if (o instanceof Mesh) meshes++;
    });
    // Ground, path, sky, clouds, tufts, near + far + flowers (each with an outline).
    expect(meshes).toBeLessThanOrEqual(11);
  });
});

describe('house', () => {
  const tiers: HouseTier[] = [0, 1, 2, 3];

  function bounds(mesh: Mesh): Box3 {
    mesh.updateMatrixWorld(true);
    return new Box3().setFromObject(mesh, true);
  }

  it('builds every tier in every color, around the door spot', () => {
    const door = worldToGround(HOUSE_DOOR);
    for (const tier of tiers) {
      for (const { color } of HOUSE_COLORS) {
        const house = buildHouse(color, tier);
        const b = bounds(house);
        // Centered on the door, with the front just behind where animals wait at the door.
        expect((b.min.x + b.max.x) / 2).toBeCloseTo(door.x, 0);
        expect(b.max.z).toBeLessThan(door.z);
        expect(b.min.y).toBeGreaterThanOrEqual(-0.01);
      }
    }
  });

  it('gets grander by tier, and stays within its patch of the yard', () => {
    const size = tiers.map((t) => bounds(buildHouse('#ffffff', t)).getSize(new Vector3()));
    expect(size[3]!.y).toBeGreaterThan(size[0]!.y);
    expect(size[3]!.x).toBeGreaterThan(size[0]!.x);
    const house = worldToGround({ x: HOUSE_BOX.x, y: HOUSE_BOX.y });
    const b = bounds(buildHouse('#ffffff', 3));
    expect(b.min.x).toBeGreaterThan(house.x - 0.8);
    expect(b.max.y).toBeLessThan(HOUSE_HEIGHT + 1.2);
    expect(b.max.x).toBeLessThan(house.x + toUnits(HOUSE_BOX.w) + 0.8);
    const c = houseCenter();
    expect(c.x).toBeCloseTo(worldToGround(HOUSE_DOOR).x);
  });

  it('is painted in the chosen color', () => {
    const lilac = HOUSE_COLORS.find((c) => c.id === 'lilac')!.color;
    const house = buildHouse(lilac, 0);
    const colors = house.geometry.getAttribute('color');
    const want = new Color(lilac);
    let found = false;
    for (let i = 0; i < colors.count && !found; i++) {
      found =
        Math.abs(colors.getX(i) - want.r) < 1e-4 &&
        Math.abs(colors.getY(i) - want.g) < 1e-4 &&
        Math.abs(colors.getZ(i) - want.b) < 1e-4;
    }
    expect(found).toBe(true);
  });

  it('has an outline hull that never takes taps or casts shadows', () => {
    const hull = buildHouse('#ffffff', 0).getObjectByName('outline') as Mesh;
    expect(hull).toBeDefined();
    expect(hull.castShadow).toBe(false);
    const hits: unknown[] = [];
    hull.raycast({} as never, hits as never);
    expect(hits).toEqual([]);
  });
});

describe('near-camera fade', () => {
  it('is shared by scenery materials and off for others', () => {
    expect(sceneryFade.value).toBe(0);
    const faded = toonMaterial(undefined, { fade: true });
    const plain = toonMaterial('#fff');
    expect(faded.customProgramCacheKey()).toContain('fade');
    expect(plain.customProgramCacheKey()).not.toContain('fade');
  });
});
