import {
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  Vector3,
  type Camera,
  type Object3D,
} from 'three';
import type { GameSession } from '../../bridge/gameSession';
import { getItem, isPlaceable } from '../../config/items';
import type { PlacedItem } from '../../sim/types';
import { animalMaterials } from '../animals/materials';
import { BACK_WALL_Z, type ViewZone } from '../coords';
import { pickKey, type Pickable } from '../pick';
import { itemModel, roundedRect, seatsFor } from './itemModels';
import type { Seat } from '../avatar/AvatarActor';
import { placeItem } from './placement3d';

interface Placed {
  root: Group;
  model: Object3D;
  zone: ViewZone;
  wall: boolean;
  look: string;
  height: number;
  /** Where someone can sit (item space), and which way the item faces. */
  seats: { x: number; y: number; z: number }[];
  yaw: number;
}

/**
 * Placed yard lures, furniture and pet beds in the 3D world (bowls are with the care things).
 * Rebuilt when an item moves, turns, or the house's grid changes. Only tappable in Decorate
 * mode, where the selected one gets a glowing outline.
 */
export class Items {
  private readonly placed = new Map<string, Placed>();
  private readonly highlight: LineSegments;
  private selectedId: string | null = null;
  decorating = false;

  constructor(
    private readonly session: GameSession,
    private readonly zones: Record<ViewZone, Group>,
  ) {
    this.highlight = new LineSegments(
      new EdgesGeometry(roundedRect(1, 1, 0.12)),
      new LineBasicMaterial({ color: 0xffe066, depthTest: false, transparent: true }),
    );
    this.highlight.renderOrder = 20;
    this.highlight.visible = false;
  }

  /**
   * In Decorate mode every placed item can be tapped (to move it). Otherwise only seats can:
   * tap the armchair or the sofa and the avatar sits on it.
   */
  *pickables(): Iterable<Pickable> {
    for (const [id, p] of this.placed) {
      if (!this.decorating && p.seats.length === 0) continue;
      yield { kind: 'item', id, zone: p.zone, object: p.root, height: p.wall ? 0 : p.height };
    }
  }

  /** The seats on a placed item, in the world (empty if it isn't a seat). */
  seatsOf(id: string): Seat[] {
    const p = this.placed.get(id);
    if (!p) return [];
    p.root.updateMatrixWorld(true);
    return p.seats.map((local, i) => {
      const at = p.root.localToWorld(new Vector3(local.x, local.y, local.z));
      return { key: `${id}:${i}`, x: at.x, y: at.y, z: at.z, yaw: p.yaw };
    });
  }

  /** A seat by its key (`placedId:index`), or null if it's gone. */
  seat(key: string): Seat | null {
    const i = key.lastIndexOf(':');
    return this.seatsOf(key.slice(0, i))[Number(key.slice(i + 1))] ?? null;
  }

  select(id: string | null): void {
    this.selectedId = id;
  }

  /** Where a placed item's root is (for effects over it). */
  root(id: string): Group | undefined {
    return this.placed.get(id)?.root;
  }

  update(camera: Camera): void {
    const { world } = this.session.sim.state;
    const seen = new Set<string>();
    for (const item of world.placedItems) {
      const def = getItem(item.itemId);
      if (!def || !isPlaceable(def) || def.category === 'bowl') continue;
      seen.add(item.id);
      this.sync(item);
    }
    for (const [id, p] of this.placed) {
      if (seen.has(id)) continue;
      p.root.removeFromParent();
      this.placed.delete(id);
    }
    // Wall art shows only from inside the room (the walls are cut away from outside).
    const inside = camera.position.z > BACK_WALL_Z;
    for (const p of this.placed.values()) if (p.wall) p.root.visible = inside;
    this.placeHighlight();
  }

  private sync(item: PlacedItem): void {
    const def = getItem(item.itemId);
    if (!def || !isPlaceable(def)) return;
    const grid = this.session.sim.gridSize(
      item.zone,
      def.category === 'furniture' && def.layer === 'wall',
    );
    const look = `${item.itemId}|${item.zone}|${item.tile.x},${item.tile.y}|${item.rotation}|${grid.cols}x${grid.rows}`;
    const existing = this.placed.get(item.id);
    if (existing?.look === look) return;
    existing?.root.removeFromParent();

    const at = placeItem(def, item, grid);
    const root = new Group();
    const model = itemModel(item.itemId, at.w, at.d, at.s);
    const box = model.geometry.boundingBox;
    root.add(model);
    root.position.set(at.x, at.y, at.z);
    root.rotation.y = at.yaw;
    if (at.mirror) root.scale.x = -1;
    // A generous tap volume over the footprint (Decorate mode only).
    const hit = new Mesh(animalMaterials().hitGeo, animalMaterials().hit);
    const wall = at.layer === 'wall';
    if (wall) {
      hit.scale.set(Math.max(0.2, at.w / 2), at.d, 0.1);
      hit.position.y = -at.d / 2;
    } else {
      hit.scale.set(at.w / 2, Math.max(0.3, box?.max.y ?? 0.3), at.d / 2);
    }
    hit.userData.pickKey = pickKey('item', item.id);
    root.add(hit);
    this.zones[item.zone].add(root);
    this.placed.set(item.id, {
      root,
      model,
      zone: item.zone,
      wall,
      look,
      height: box?.max.y ?? 0.3,
      seats: seatsFor(item.itemId, at.w, at.d, at.s),
      yaw: at.yaw,
    });
  }

  /** A glowing rounded outline around the selected item's footprint. */
  private placeHighlight(): void {
    const p = this.selectedId ? this.placed.get(this.selectedId) : undefined;
    const h = this.highlight;
    h.visible = this.decorating && !!p;
    if (!p || !h.visible) return;
    if (h.parent !== p.root) p.root.add(h);
    const box = p.model instanceof Mesh ? p.model.geometry.boundingBox : null;
    const w = box ? box.max.x - box.min.x + 0.12 : 1;
    const d = box ? (p.wall ? box.max.y - box.min.y : box.max.z - box.min.z) + 0.12 : 1;
    h.scale.set(w, d, 1);
    if (p.wall) {
      h.rotation.set(0, 0, 0);
      h.position.set(0, 0, 0.05);
    } else {
      h.rotation.set(-Math.PI / 2, 0, 0);
      h.position.set(0, 0.03, 0);
    }
  }
}
