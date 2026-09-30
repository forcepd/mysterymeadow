import {
  CanvasTexture,
  Group,
  Mesh,
  MeshToonMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { darken, lighten } from '../../art/svg';
import { getItem } from '../../config/items';
import { INSIDE_DOOR, ROOM } from '../../game/layout';
import type { SimState } from '../../sim/types';
import { part, sceneryMesh, toonGradient, toonMaterial } from '../art/toon';
import { labelStyles } from '../animals/labels';
import { BACK_WALL_Z, toUnits, WALL_HEIGHT, worldToGround } from '../coords';

/**
 * The house interior (DESIGN 12): a cutaway dollhouse room. The floor and walls wear the chosen
 * flooring and wallpaper (patterns drawn like the original's: stripes, hearts, clouds; boards,
 * checks, carpet). Walls are one-sided, facing into the room, so from outside they disappear
 * and never block the view in. The green doormat at the front is the way out.
 */

const SIDE_HEIGHT = 1.1;
const FLOOR_FRONT = INSIDE_DOOR.y + 50;

type Draw = (ctx: CanvasRenderingContext2D, size: number, color: string) => void;

const WALLPAPERS: Record<string, Draw> = {
  // Soft stripes, like the original's walls.
  wallpaper_cream: (ctx, n) => {
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    for (let x = 0; x < n; x += n / 4) ctx.fillRect(x, 0, n / 9, n);
  },
  wallpaper_mint: (ctx, n, c) => {
    ctx.fillStyle = darken(c, 0.08);
    for (let x = 0; x < n; x += n / 4) ctx.fillRect(x, 0, n / 8, n);
  },
  wallpaper_berry: (ctx, n, c) => {
    ctx.fillStyle = darken(c, 0.14);
    for (const [x, y] of [
      [0.25, 0.25],
      [0.75, 0.75],
    ]) {
      heart(ctx, x! * n, y! * n, n * 0.08);
    }
  },
  wallpaper_sky: (ctx, n) => {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (const [x, y, r] of [
      [0.3, 0.3, 0.07],
      [0.75, 0.72, 0.06],
    ]) {
      for (const dx of [-1, 0, 1]) {
        ctx.beginPath();
        ctx.arc(
          (x! + dx * r! * 0.9) * n,
          y! * n - (dx === 0 ? r! * n * 0.3 : 0),
          r! * n,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }
  },
};

const FLOORS: Record<string, Draw> = {
  // Boards along the room, with staggered joints.
  flooring_wood: (ctx, n, c) => {
    ctx.strokeStyle = darken(c, 0.14);
    ctx.lineWidth = n / 64;
    for (let i = 0; i < 4; i++) {
      const y = (i * n) / 4;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(n, y);
      ctx.stroke();
      const x = ((i % 2) * n) / 2 + n / 4;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + n / 4);
      ctx.stroke();
    }
  },
  flooring_checker: (ctx, n, c) => {
    ctx.fillStyle = darken(c, 0.12);
    ctx.fillRect(0, 0, n / 2, n / 2);
    ctx.fillRect(n / 2, n / 2, n / 2, n / 2);
  },
  flooring_carpet: (ctx, n, c) => {
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = i % 2 ? lighten(c, 0.12) : darken(c, 0.06);
      const x = (Math.sin(i * 12.9898) * 43758.5453) % 1;
      const y = (Math.sin(i * 78.233) * 43758.5453) % 1;
      ctx.fillRect(Math.abs(x) * n, Math.abs(y) * n, n / 40, n / 40);
    }
  },
};

function heart(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y + r);
  ctx.bezierCurveTo(x - r * 1.3, y, x - r * 0.9, y - r, x, y - r * 0.4);
  ctx.bezierCurveTo(x + r * 0.9, y - r, x + r * 1.3, y, x, y + r);
  ctx.fill();
}

function patternTexture(draw: Draw | undefined, color: string, repeat: [number, number]): Texture {
  const canvas = document.createElement('canvas');
  const n = 128;
  canvas.width = canvas.height = n;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, n, n);
  draw?.(ctx, n, color);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(...repeat);
  return texture;
}

/** A flat panel facing +z (rotate it to face other ways), `w` x `h`. */
function panel(w: number, h: number, material: MeshToonMaterial): Mesh {
  const mesh = new Mesh(new PlaneGeometry(w, h), material);
  mesh.receiveShadow = true;
  return mesh;
}

export class Room {
  readonly group = new Group();
  private readonly wallMaterial = new MeshToonMaterial();
  private readonly floorMaterial = new MeshToonMaterial();
  private surfaces = '';
  private readonly doormatLabel: CSS2DObject;

  constructor() {
    this.group.name = 'house';
    this.wallMaterial.gradientMap = toonGradient();
    this.floorMaterial.gradientMap = toonGradient();

    const left = worldToGround({ x: ROOM.left, y: 0 }).x;
    const right = worldToGround({ x: ROOM.right, y: 0 }).x;
    const front = worldToGround({ x: 0, y: FLOOR_FRONT }).z;
    const width = right - left;
    const depth = front - BACK_WALL_Z;
    const cx = (left + right) / 2;

    // Around the house: a warm wooden base, like the original's frame around the room.
    const base = new Mesh(new PlaneGeometry(200, 200), toonMaterial('#9a7b5f'));
    base.rotation.x = -Math.PI / 2;
    base.position.y = -0.12;
    base.receiveShadow = true;
    this.group.add(base);

    // The floor, on a thick slab.
    const floor = panel(width, depth, this.floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0, BACK_WALL_Z + depth / 2);
    const slab = sceneryMesh(
      [
        part(new RoundedBoxGeometry(width + 0.3, 0.12, depth + 0.15, 2, 0.04), '#c9a27a', {
          x: cx,
          y: -0.061,
          z: BACK_WALL_Z + depth / 2 + 0.07,
        }),
      ],
      { fade: false, shadows: false },
    );
    this.group.add(slab, floor);

    // The back wall (full height) and two low side walls, all facing into the room.
    const back = panel(width, WALL_HEIGHT, this.wallMaterial);
    back.position.set(cx, WALL_HEIGHT / 2, BACK_WALL_Z);
    this.group.add(back);
    for (const side of [-1, 1]) {
      const wall = panel(depth, SIDE_HEIGHT, this.wallMaterial);
      wall.rotation.y = -side * (Math.PI / 2);
      wall.position.set(side < 0 ? left : right, SIDE_HEIGHT / 2, BACK_WALL_Z + depth / 2);
      this.group.add(wall);
    }

    // White trim: baseboards, a picture rail on top of the back wall, caps on the side walls.
    const trim: ReturnType<typeof part>[] = [
      part(new RoundedBoxGeometry(width, 0.12, 0.05, 1, 0.02), '#fffaf0', {
        x: cx,
        y: 0.06,
        z: BACK_WALL_Z + 0.025,
      }),
      part(new RoundedBoxGeometry(width + 0.1, 0.1, 0.12, 1, 0.03), '#fffaf0', {
        x: cx,
        y: WALL_HEIGHT,
        z: BACK_WALL_Z + 0.03,
      }),
    ];
    for (const x of [left, right]) {
      trim.push(
        part(new RoundedBoxGeometry(0.05, 0.12, depth, 1, 0.02), '#fffaf0', {
          x: x + (x < cx ? 0.025 : -0.025),
          y: 0.06,
          z: BACK_WALL_Z + depth / 2,
        }),
        part(new RoundedBoxGeometry(0.12, 0.08, depth + 0.06, 1, 0.03), '#fffaf0', {
          x,
          y: SIDE_HEIGHT,
          z: BACK_WALL_Z + depth / 2,
        }),
        part(new RoundedBoxGeometry(0.12, WALL_HEIGHT, 0.12, 1, 0.03), '#fffaf0', {
          x,
          y: WALL_HEIGHT / 2,
          z: BACK_WALL_Z,
        }),
      );
    }
    this.group.add(sceneryMesh(trim, { fade: false, shadows: false }));

    // The doormat: the way back out to the yard.
    const mat = worldToGround(INSIDE_DOOR);
    this.group.add(
      sceneryMesh(
        [
          part(new RoundedBoxGeometry(toUnits(180), 0.03, toUnits(52), 2, 0.012), '#5f8f4a', {
            x: mat.x,
            y: 0.015,
            z: mat.z,
          }),
          part(new RoundedBoxGeometry(toUnits(166), 0.034, toUnits(40), 2, 0.012), '#8fbf6a', {
            x: mat.x,
            y: 0.017,
            z: mat.z,
          }),
        ],
        { fade: false, shadows: false },
      ),
    );
    const el = document.createElement('div');
    el.className = labelStyles.doormat!;
    el.textContent = '🌳 Outside';
    this.doormatLabel = new CSS2DObject(el);
    this.doormatLabel.position.set(mat.x, 0.05, mat.z);
    this.group.add(this.doormatLabel);
  }

  /** Keeps the wallpaper and flooring the player chose. */
  sync(world: SimState['world']): void {
    const { wallpaperId, flooringId } = world.house;
    const key = `${wallpaperId}|${flooringId}`;
    if (key === this.surfaces) return;
    this.surfaces = key;
    const wall = getItem(wallpaperId)?.color ?? '#fbf1dc';
    const floor = getItem(flooringId)?.color ?? '#e3c08f';
    this.wallMaterial.map?.dispose();
    this.floorMaterial.map?.dispose();
    this.wallMaterial.map = patternTexture(WALLPAPERS[wallpaperId], wall, [8, 2]);
    this.floorMaterial.map = patternTexture(FLOORS[flooringId], floor, [6, 3]);
    this.wallMaterial.needsUpdate = true;
    this.floorMaterial.needsUpdate = true;
  }

  dispose(): void {
    this.doormatLabel.element.remove();
    this.wallMaterial.map?.dispose();
    this.floorMaterial.map?.dispose();
  }
}
