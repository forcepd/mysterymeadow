import {
  BufferGeometry,
  DoubleSide,
  EdgesGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
} from 'three';
import { appBus } from '../../bridge/appBus';
import type { GameSession } from '../../bridge/gameSession';
import { getItem, isPlaceable, layerOf, type PlaceableItemDef } from '../../config/items';
import { gridArea, tileAt } from '../../game/layout';
import type { PlacedItem, Vec2 } from '../../sim/types';
import { WALL_ART, wallStripToWall, worldToGround, type Point3, type ViewZone } from '../coords';
import type { PointerSample, PressHandler } from '../gestures';
import { roundedRect } from '../items/itemModels';
import { placeItem, rotatedSize } from '../items/placement3d';
import type { Pickable } from '../pick';

/** A press on a placed item has to move this far (CSS px) to become a move. */
const MOVE_SLOP = 12;

/** What Decorate mode needs from the 3D world (screen points are canvas CSS px). */
export interface DecorateWorld {
  zone(): ViewZone;
  zones: Record<ViewZone, Group>;
  /** The world-pixel spot on the ground under a screen point. */
  floorPoint(p: { x: number; y: number }): Vec2 | null;
  /** The world-pixel spot on the house's wall strip under a screen point (the back wall). */
  wallPoint(p: { x: number; y: number }): Vec2 | null;
  /** A screen point (page coordinates) on the canvas, or null off it. */
  clientToCanvas(client: { x: number; y: number }): { x: number; y: number } | null;
  say(at: Point3, text: string, color: string): void;
  sparkle(at: Point3): void;
  /** Mode changed: the world fades animals, hides finds, and moves the camera. */
  changed(on: boolean): void;
}

interface Spot {
  def: PlaceableItemDef;
  tile: { x: number; y: number };
  rotation: PlacedItem['rotation'];
  point: Point3;
}

/**
 * Decorate mode in 3D (DESIGN 12.3), doing what the original's ZoneScene does: a grid over the
 * floor (and the house's back wall), a green or red ghost where an item would go, tap or drag
 * from the tray to place, and drag placed items (bowls too) to move them. The tray (DecorateBar)
 * turns and stores the selected item.
 */
export class Decorate {
  active = false;
  private picked: string | null = null;
  private selected: string | null = null;
  private readonly ghost = new Group();
  private readonly ghostFill: Mesh;
  private readonly ghostEdge: LineSegments;
  private readonly grids: Record<ViewZone, LineSegments | null> = { yard: null, house: null };
  private gridKey = '';
  private readonly offs: (() => void)[] = [];

  constructor(
    private readonly session: GameSession,
    private readonly world: DecorateWorld,
    private readonly onSelect: (placedId: string | null) => void,
  ) {
    const shape = roundedRect(1, 1, 0.08);
    this.ghostFill = new Mesh(
      shape,
      new MeshBasicMaterial({
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
        side: DoubleSide,
      }),
    );
    this.ghostEdge = new LineSegments(
      new EdgesGeometry(shape),
      new LineBasicMaterial({ depthTest: false }),
    );
    this.ghostFill.renderOrder = 18;
    this.ghostEdge.renderOrder = 19;
    this.ghost.add(this.ghostFill, this.ghostEdge);
    this.ghost.visible = false;

    this.offs.push(
      appBus.on('decorate', ({ on }) => this.setOn(on)),
      appBus.on('decorPick', ({ itemId }) => {
        this.picked = itemId;
        this.ghost.visible = false;
      }),
      appBus.on('decorSelect', ({ placedId }) => this.select(placedId, false)),
      appBus.on('decorDrag', ({ itemId, drop, client }) => {
        if (!this.active) return;
        const p = client ? this.world.clientToCanvas(client) : null;
        if (!p) {
          this.ghost.visible = false;
          return;
        }
        if (drop) this.placeFromTray(itemId, p);
        else this.showGhost(itemId, p, 0);
      }),
    );
  }

  dispose(): void {
    this.offs.forEach((off) => off());
    this.ghost.removeFromParent();
  }

  /** A press on a placed item (or bowl): select it, and drag to move it. */
  pressItem(target: Pickable, start: PointerSample): PressHandler {
    {
      const placed = this.session.sim.state.world.placedItems.find((i) => i.id === target.id);
      this.select(target.id, true);
      let moved = false;
      return {
        move: (p) => {
          if (!placed) return;
          if (!moved && Math.hypot(p.x - start.x, p.y - start.y) < MOVE_SLOP) return;
          moved = true;
          this.showGhost(placed.itemId, p, placed.rotation, placed.id);
        },
        up: (p) => {
          this.ghost.visible = false;
          if (!moved || !placed) return;
          const spot = this.spotFor(placed.itemId, p, placed.rotation);
          if (!spot) return;
          const result = this.session.sim.moveItem(placed.id, spot.tile);
          if (!result.ok) this.world.say(spot.point, result.reason, '#a33b22');
        },
        cancel: () => {
          this.ghost.visible = false;
        },
      };
    }
  }

  /** A tap on an empty spot: places the picked tray item there, or deselects. */
  tapEmpty(p: { x: number; y: number }): void {
    if (this.picked) this.placeFromTray(this.picked, p);
    else this.select(null, true);
  }

  /** A mouse moving over the room with an item picked: show where it would go. */
  hover(p: { x: number; y: number }): void {
    if (this.active && this.picked) this.showGhost(this.picked, p, 0);
  }

  /** Keeps the grid in step with the zone and the house's size. */
  update(): void {
    if (!this.active) return;
    const zone = this.world.zone();
    const floor = this.session.sim.gridSize(zone);
    const wall = this.session.sim.gridSize(zone, true);
    const key = `${zone}|${floor.cols}x${floor.rows}|${wall.cols}`;
    if (key === this.gridKey) return;
    this.gridKey = key;
    for (const z of ['yard', 'house'] as ViewZone[]) {
      this.grids[z]?.removeFromParent();
      this.grids[z]?.geometry.dispose();
      this.grids[z] = null;
    }
    const grid = new LineSegments(
      this.gridGeometry(zone, floor, zone === 'house' ? wall : null),
      new LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }),
    );
    grid.renderOrder = 15;
    this.grids[zone] = grid;
    this.world.zones[zone].add(grid);
    if (this.ghost.parent !== this.world.zones[zone]) this.world.zones[zone].add(this.ghost);
  }

  private setOn(on: boolean): void {
    this.active = on;
    this.picked = null;
    this.select(null, false);
    this.ghost.visible = false;
    this.gridKey = '';
    for (const z of ['yard', 'house'] as ViewZone[]) {
      if (this.grids[z]) this.grids[z]!.visible = on;
    }
    if (!on) {
      for (const z of ['yard', 'house'] as ViewZone[]) {
        this.grids[z]?.removeFromParent();
        this.grids[z] = null;
      }
    }
    this.world.changed(on);
  }

  private select(placedId: string | null, tell: boolean): void {
    if (placedId === this.selected && !tell) return;
    this.selected = placedId;
    this.onSelect(placedId);
    if (tell) appBus.emit('decorSelect', { placedId });
  }

  /** Where an item would go under a screen point: the tile, and a spot in 3D. */
  private spotFor(
    itemId: string,
    p: { x: number; y: number },
    rotation: PlacedItem['rotation'],
  ): Spot | null {
    const def = getItem(itemId);
    if (!def || !isPlaceable(def)) return null;
    const zone = this.world.zone();
    const wall = layerOf(def) === 'wall';
    if (wall && zone !== 'house') return null;
    const at = wall ? this.world.wallPoint(p) : this.world.floorPoint(p);
    if (!at) return null;
    const grid = this.session.sim.gridSize(zone, wall);
    const tile = tileAt(zone, grid, at, rotatedSize(def, rotation), wall);
    if (!tile) return null;
    const point = wall ? wallStripToWall(at) : { ...worldToGround(at), y: 0.3 };
    return { def, tile, rotation, point };
  }

  private showGhost(
    itemId: string,
    p: { x: number; y: number },
    rotation: PlacedItem['rotation'],
    movingId?: string,
  ): void {
    const spot = this.spotFor(itemId, p, rotation);
    if (!spot) {
      this.ghost.visible = false;
      return;
    }
    const zone = this.world.zone();
    const ok = this.session.sim.canPlace(itemId, zone, spot.tile, rotation, movingId).ok;
    const wall = layerOf(spot.def) === 'wall';
    const grid = this.session.sim.gridSize(zone, wall);
    const at = placeItem(spot.def, { zone, tile: spot.tile, rotation }, grid);
    const g = this.ghost;
    if (g.parent !== this.world.zones[zone]) this.world.zones[zone].add(g);
    g.visible = true;
    g.position.set(at.x, wall ? at.y : 0.03, wall ? at.z + 0.03 : at.z);
    g.rotation.set(0, wall ? 0 : at.yaw, 0);
    // The footprint lies flat on the floor, or stands on the wall.
    this.ghostFill.rotation.x = wall ? 0 : -Math.PI / 2;
    this.ghostEdge.rotation.x = this.ghostFill.rotation.x;
    this.ghostFill.scale.set(at.w * 0.98, at.d * 0.98, 1);
    this.ghostEdge.scale.copy(this.ghostFill.scale);
    (this.ghostFill.material as MeshBasicMaterial).color.set(ok ? 0x6cc46a : 0xef6f6f);
    (this.ghostEdge.material as LineBasicMaterial).color.set(ok ? 0x3f8f3d : 0xa33b22);
  }

  private placeFromTray(itemId: string, p: { x: number; y: number }): void {
    this.ghost.visible = false;
    const spot = this.spotFor(itemId, p, 0);
    if (!spot) return;
    const result = this.session.sim.placeItem(itemId, this.world.zone(), spot.tile);
    if (!result.ok) {
      this.world.say(spot.point, result.reason, '#a33b22');
      return;
    }
    if (!result.placedId) return;
    this.picked = null;
    appBus.emit('decorPlaced', { itemId, placedId: result.placedId });
    this.select(result.placedId, true);
    this.world.sparkle(spot.point);
  }

  /** Lines over the floor grid (and one row on the house's back wall). */
  private gridGeometry(
    zone: ViewZone,
    floor: { cols: number; rows: number },
    wall: { cols: number } | null,
  ): BufferGeometry {
    const pts: number[] = [];
    const a = gridArea(zone);
    const x0 = worldToGround({ x: a.x, y: a.y });
    const x1 = worldToGround({ x: a.x + a.w, y: a.y + a.h });
    const y = 0.025;
    for (let c = 0; c <= floor.cols; c++) {
      const x = x0.x + (c / floor.cols) * (x1.x - x0.x);
      pts.push(x, y, x0.z, x, y, x1.z);
    }
    for (let r = 0; r <= floor.rows; r++) {
      const z = x0.z + (r / floor.rows) * (x1.z - x0.z);
      pts.push(x0.x, y, z, x1.x, y, z);
    }
    if (wall) {
      const wa = gridArea('house', true);
      const top = wallStripToWall({ x: wa.x, y: wa.y });
      const bottom = wallStripToWall({ x: wa.x + wa.w, y: wa.y + wa.h });
      const z = top.z + 0.02;
      for (let c = 0; c <= wall.cols; c++) {
        const x = top.x + (c / wall.cols) * (bottom.x - top.x);
        pts.push(x, WALL_ART.bottom, z, x, WALL_ART.top, z);
      }
      for (const h of [WALL_ART.bottom, WALL_ART.top]) pts.push(top.x, h, z, bottom.x, h, z);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pts, 3));
    return g;
  }
}
