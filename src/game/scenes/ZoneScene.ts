import Phaser from 'phaser';
import { appBus } from '../../bridge/appBus';
import type { GameSession } from '../../bridge/gameSession';
import { getItem, isPlaceable, layerOf, type PlaceableItemDef } from '../../config/items';
import { getTrick } from '../../config/tricks';
import type { PlacedItem, Vec2, Zone } from '../../sim/types';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../constants';
import { Effects } from '../fx/effects';
import {
  DOOR_RADIUS,
  doorOf,
  HUD_COINS,
  gridArea,
  tileAt,
  tileCenterWorld,
  tileRect,
  zoneToWorld,
  type Grid,
} from '../layout';
import { AnimalSprite } from '../sprites/AnimalSprite';
import { BowlSprite } from '../sprites/BowlSprite';
import { ItemSprite } from '../sprites/ItemSprite';
import { PlayerAvatar } from '../sprites/PlayerAvatar';
import { PoopSprite } from '../sprites/PoopSprite';

/** Decorate mode's camera: the room shrinks toward the top, leaving room for the tray. */
const DECORATE_ZOOM = 0.8;
const DECORATE_CENTER = { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 / DECORATE_ZOOM };

/** Press this long on an animal to pet it (DESIGN 8.4); a shorter tap opens its card. */
const HOLD_MS = 450;
/** A press that drifts this far (world px) becomes a drag (drag-to-door). */
const PRESS_SLOP = 28;

interface Press {
  animalId: string;
  start: Vec2;
  timer: Phaser.Time.TimerEvent;
  held: boolean;
  dragging: boolean;
  /** Real time the press began (the game-loop timer lags when frames are slow). */
  startedAt: number;
}

interface ItemDrag {
  placedId: string;
  itemId: string;
  start: Vec2;
  moved: boolean;
}

type Spawn = { at: Vec2; kind: 'walk' | 'pop' };

/**
 * Shared world scene for one zone (yard or house). Render only: every frame it reconciles
 * sprites with sim state, and uses sim events just for flourishes. Taps go to sim commands or
 * the app bus. Handles animals (tap = card, hold = pet, drag to the door = other zone), bowls,
 * poop, placed items, and Decorate mode.
 */
export abstract class ZoneScene extends Phaser.Scene {
  protected abstract readonly zone: Zone;
  protected readonly animals = new Map<string, AnimalSprite>();
  private readonly bowls = new Map<string, BowlSprite>();
  private readonly items = new Map<string, ItemSprite>();
  private readonly poops = new Map<string, PoopSprite>();
  /** animalId -> where it should appear from (the gate, its mother, a door). */
  protected readonly spawnFrom = new Map<string, Spawn>();
  private readonly sold = new Map<string, number>();
  private readonly stored = new Set<string>();
  /** Animals leaving for the other zone: walk to the door on the way out. */
  private readonly exiting = new Set<string>();
  private selectedId: string | null = null;
  private press: Press | null = null;
  protected fx!: Effects;
  private systemReducedMotion = false;
  protected initialized = false;

  // Decorate mode.
  protected decorating = false;
  private pickItemId: string | null = null;
  private selectedPlacedId: string | null = null;
  private itemDrag: ItemDrag | null = null;
  private gridLayer!: Phaser.GameObjects.Graphics;
  private avatar!: PlayerAvatar;
  private ghost!: Phaser.GameObjects.Graphics;

  protected constructor(
    config: string | Phaser.Types.Scenes.SettingsConfig,
    protected readonly session: GameSession,
  ) {
    super(config);
  }

  /** Static background (grass and fence, or walls and floor). */
  protected abstract drawBackground(): void;
  /** Zone-specific sync each frame (visitors, house color, wallpaper...). */
  protected abstract reconcileExtra(): void;

  create(): void {
    this.systemReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.fx = new Effects(this, this.reducedMotion);
    this.drawBackground();
    this.gridLayer = this.add.graphics().setDepth(-400).setVisible(false);
    this.ghost = this.add.graphics().setDepth(20_000);
    // The player's avatar starts by this zone's door.
    const door = doorOf(this.zone);
    const walkable = gridArea(this.zone);
    this.avatar = new PlayerAvatar(
      this,
      door.x + 90,
      Phaser.Math.Clamp(door.y + 30, walkable.y + 40, walkable.y + walkable.h),
      walkable,
      this.reducedMotion,
    );
    this.avatar.setLoadout(this.session.shownAvatar);

    this.input.on(
      Phaser.Input.Events.POINTER_DOWN,
      (pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
        appBus.emit('canvasTap', { x: pointer.worldX, y: pointer.worldY });
        if (this.decorating) {
          // Animals, poop, and visitors don't count in Decorate mode: only items do.
          const onItem = over.some((o) => o instanceof ItemSprite || o instanceof BowlSprite);
          if (!onItem) this.decorTapEmpty({ x: pointer.worldX, y: pointer.worldY });
          return;
        }
        this.avatar.walkToward({ x: pointer.worldX, y: pointer.worldY });
        if (over.length === 0) {
          this.fx.ripple(pointer.worldX, pointer.worldY);
          appBus.emit('selectAnimal', { id: null });
        }
      },
    );
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) =>
      this.pointerMove({ x: pointer.worldX, y: pointer.worldY }),
    );
    this.input.on(Phaser.Input.Events.POINTER_UP, (pointer: Phaser.Input.Pointer) =>
      this.pointerUp({ x: pointer.worldX, y: pointer.worldY }, true),
    );
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, (pointer: Phaser.Input.Pointer) =>
      this.pointerUp({ x: pointer.worldX, y: pointer.worldY }, false),
    );

    const { events } = this.session.sim;
    const offs = [
      events.on('animalBorn', ({ mother, babies }) => {
        if (mother.zone !== this.zone) return;
        const mom = this.animals.get(mother.id);
        const at = mom ? { x: mom.x, y: mom.y } : zoneToWorld(this.zone, mother.position);
        for (const baby of babies) this.spawnFrom.set(baby.id, { at, kind: 'pop' });
        this.fx.hearts(at.x, at.y - 70, 5);
        this.fx.burst(at.x, at.y - 20, [0xffd84d, 0xff9fc4, 0xffffff]);
        this.fx.confetti(at.x, at.y - 40, 12);
        this.fx.floatText(
          at.x,
          at.y - 120,
          '🍼'.repeat(Math.min(babies.length, 4)),
          '#e0628b',
          34,
          250,
        );
      }),
      events.on('animalSold', ({ animal, price }) => this.sold.set(animal.id, price)),
      events.on('petStored', ({ animal }) => this.stored.add(animal.id)),
      events.on('animalMovedZone', ({ animal, from, to }) => {
        if (from === this.zone) this.exiting.add(animal.id);
        // Comes in through this zone's door.
        if (to === this.zone)
          this.spawnFrom.set(animal.id, { at: doorOf(this.zone), kind: 'walk' });
      }),
      events.on('trickPerformed', ({ animal, trickId }) => {
        const s = this.animals.get(animal.id);
        if (!s) return;
        s.perform(getTrick(trickId)?.move ?? 'jump');
        this.fx.floatText(s.x, s.y - 100, getTrick(trickId)?.icon ?? '⭐', '#e0628b', 36);
        this.fx.hearts(s.x, s.y - 70, 2);
      }),
      events.on('trickLearned', ({ animal }) => {
        const s = this.animals.get(animal.id);
        if (s) this.fx.burst(s.x, s.y - 50, [0xffd84d, 0xff9fc4, 0xffffff], 12);
      }),
      events.on('animalPetted', ({ animal }) => {
        const s = this.animals.get(animal.id);
        if (s) this.fx.hearts(s.x, s.y - 80, 4);
      }),
      events.on('treatGiven', ({ animal }) => {
        const s = this.animals.get(animal.id);
        if (!s) return;
        this.fx.floatText(s.x, s.y - 90, '🍪', '#c98a00', 36);
        this.fx.hearts(s.x, s.y - 70, 3);
      }),
      events.on('animalAte', ({ bowlId }) => {
        const b = this.bowls.get(bowlId);
        if (b) this.fx.floatText(b.x, b.y - 40, 'nom!', '#8b5a33', 24);
      }),
      events.on('bowlRefilled', ({ bowlId }) => {
        const b = this.bowls.get(bowlId);
        if (b) this.fx.burst(b.x, b.y - 10, [0xe0a868, 0xffd84d, 0xffffff], 8);
      }),
      appBus.on('selectAnimal', ({ id }) => this.select(id)),
      this.session.events.on('profileChanged', () =>
        this.avatar.setLoadout(this.session.shownAvatar),
      ),
      appBus.on('decorate', ({ on }) => this.setDecorating(on)),
      appBus.on('decorPick', ({ itemId }) => {
        this.pickItemId = itemId;
        this.ghost.clear();
      }),
      appBus.on('decorDrag', ({ itemId, at, drop }) => {
        if (!this.scene.isActive()) return;
        if (!at) {
          this.ghost.clear();
          return;
        }
        const w = this.cameras.main.getWorldPoint(at.x, at.y);
        if (drop) this.placeFromTray(itemId, { x: w.x, y: w.y });
        else this.showGhost(itemId, { x: w.x, y: w.y });
      }),
    ];
    const unsubscribe = () => offs.forEach((off) => off());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, unsubscribe);
    this.events.once(Phaser.Scenes.Events.DESTROY, unsubscribe);
    this.events.on(Phaser.Scenes.Events.WAKE, () => {
      this.reconcile();
      appBus.emit('sceneChanged', { scene: this.zone });
    });

    this.reconcile();
    this.initialized = true;
  }

  override update(): void {
    this.reconcile();
  }

  protected readonly reducedMotion = (): boolean =>
    this.systemReducedMotion || this.session.sim.state.world.settings.reducedMotion;

  protected grid(wall = false): Grid {
    return this.session.sim.gridSize(this.zone, wall);
  }

  private reconcile(): void {
    this.reconcileExtra();
    this.reconcileItems();
    this.reconcilePoops();
    this.reconcileAnimals();
  }

  private itemRect(item: PlacedItem, def: PlaceableItemDef) {
    const wall = layerOf(def) === 'wall';
    const size = rotated(def, item.rotation);
    return tileRect(this.zone, this.grid(wall), item.tile, size, wall);
  }

  private reconcileItems(): void {
    const seenBowls = new Set<string>();
    const seenItems = new Set<string>();
    for (const item of this.session.sim.state.world.placedItems) {
      if (item.zone !== this.zone) continue;
      const def = getItem(item.itemId);
      if (!def || !isPlaceable(def)) continue;
      if (def.category === 'bowl') {
        seenBowls.add(item.id);
        this.syncBowl(item);
        continue;
      }
      seenItems.add(item.id);
      const rect = this.itemRect(item, def);
      let sprite = this.items.get(item.id);
      if (!sprite) {
        sprite = new ItemSprite(this, item, def, rect);
        const id = item.id;
        sprite.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, (p: Phaser.Input.Pointer) =>
          this.itemPressed(id, item.itemId, { x: p.worldX, y: p.worldY }),
        );
        this.items.set(item.id, sprite);
      }
      sprite.sync(item, rect);
      sprite.setAlpha(this.decorating && this.selectedPlacedId === item.id ? 0.75 : 1);
    }
    for (const [id, sprite] of this.bowls) {
      if (seenBowls.has(id)) continue;
      this.bowls.delete(id);
      sprite.destroy();
    }
    for (const [id, sprite] of this.items) {
      if (seenItems.has(id)) continue;
      this.items.delete(id);
      sprite.destroy();
    }
  }

  private syncBowl(bowl: PlacedItem): void {
    const at = tileCenterWorld(this.zone, this.grid(), bowl.tile);
    let sprite = this.bowls.get(bowl.id);
    if (sprite && (sprite.x !== at.x || sprite.y !== at.y))
      sprite.setPosition(at.x, at.y).setDepth(at.y);
    if (!sprite) {
      sprite = new BowlSprite(this, bowl, at, this.reducedMotion);
      const s = sprite;
      s.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, (p: Phaser.Input.Pointer) => {
        if (this.decorating) {
          this.itemPressed(bowl.id, bowl.itemId, { x: p.worldX, y: p.worldY });
          return;
        }
        const result = this.session.sim.refillBowl(bowl.id);
        if (!result.ok) this.fx.floatText(s.x, s.y - 50, 'Full!', '#3f7fbf', 24);
      });
      this.bowls.set(bowl.id, sprite);
    }
    sprite.sync(bowl);
  }

  private reconcilePoops(): void {
    const seen = new Set<string>();
    for (const poop of this.session.sim.state.world.poops) {
      if (poop.zone !== this.zone) continue;
      seen.add(poop.id);
      if (this.poops.has(poop.id)) continue;
      const at = zoneToWorld(this.zone, poop.position);
      const sprite = new PoopSprite(this, poop, at, this.initialized);
      sprite.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
        if (!this.decorating) this.session.sim.cleanPoop(poop.id);
      });
      this.poops.set(poop.id, sprite);
    }
    for (const [id, sprite] of this.poops) {
      if (seen.has(id)) continue;
      this.poops.delete(id);
      this.fx.burst(sprite.x, sprite.y - 10, [0xffffff, 0x9fe7ff, 0xffe066], 8);
      sprite.clean();
    }
  }

  private reconcileAnimals(): void {
    const { sim } = this.session;
    const present = new Set<string>();
    for (const animal of sim.state.world.animals) {
      if (animal.zone !== this.zone) continue;
      present.add(animal.id);
      const home = zoneToWorld(this.zone, animal.position);
      let sprite = this.animals.get(animal.id);
      if (!sprite) {
        const from = this.spawnFrom.get(animal.id);
        this.spawnFrom.delete(animal.id);
        sprite = new AnimalSprite(this, animal, from?.at ?? home, home, this.reducedMotion);
        const s = sprite;
        const id = animal.id;
        s.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, (pointer: Phaser.Input.Pointer) =>
          this.startPress(id, pointer),
        );
        this.animals.set(animal.id, sprite);
        // Apply looks (e.g. baby size) before any spawn animation, which tweens toward them.
        sprite.sync(animal, sim.badges(animal.id), home);
        if (from?.kind === 'walk') sprite.walkTo(home);
        else if (from?.kind === 'pop') {
          sprite.popIn();
          sprite.walkTo(home);
        }
        sprite.setSelected(animal.id === this.selectedId);
      }
      sprite.sync(animal, sim.badges(animal.id), home);
      sprite.setAlpha(this.decorating ? 0.35 : 1);
    }
    for (const [id, sprite] of this.animals) {
      if (present.has(id)) continue;
      this.animals.delete(id);
      const price = this.sold.get(id);
      this.sold.delete(id);
      if (this.exiting.delete(id)) {
        sprite.exitThrough(doorOf(this.zone));
        continue;
      }
      if (this.stored.delete(id)) {
        this.fx.floatText(sprite.x, sprite.y - 90, '📦 Resting', '#8b5a33', 26);
        sprite.goodbye();
        continue;
      }
      if (price === undefined) {
        sprite.destroy();
        continue;
      }
      this.fx.floatText(sprite.x, sprite.y - 90, `+${price} 🪙`, '#c98a00', 34);
      this.fx.hearts(sprite.x, sprite.y - 60, 3);
      this.fx.coinShower(
        sprite.x,
        sprite.y - 40,
        HUD_COINS,
        Math.min(10, 3 + Math.floor(price / 40)),
      );
      sprite.goodbye();
    }
  }

  // ---- Animals: tap, hold, drag to the door --------------------------------------------------

  /** Pointer went down on an animal: a hold pets it, a quick tap (on release) opens its card. */
  private startPress(animalId: string, pointer: Phaser.Input.Pointer): void {
    if (this.decorating) return;
    this.cancelPress();
    const press: Press = {
      animalId,
      start: { x: pointer.worldX, y: pointer.worldY },
      held: false,
      dragging: false,
      startedAt: performance.now(),
      timer: this.time.delayedCall(HOLD_MS, () => {
        if (press.dragging) return;
        press.held = true;
        this.petAnimal(animalId);
      }),
    };
    this.press = press;
  }

  private pointerMove(p: Vec2): void {
    if (this.itemDrag) {
      this.dragItem(p);
      return;
    }
    if (this.decorating && this.pickItemId) {
      this.showGhost(this.pickItemId, p);
      return;
    }
    const press = this.press;
    if (!press || press.held) return;
    const sprite = this.animals.get(press.animalId);
    if (!press.dragging) {
      if (Math.hypot(p.x - press.start.x, p.y - press.start.y) <= PRESS_SLOP) return;
      press.dragging = true;
      press.timer.remove(false);
      sprite?.startDrag();
    }
    sprite?.dragTo(p.x, p.y);
  }

  private pointerUp(p: Vec2, inside: boolean): void {
    if (this.itemDrag) {
      this.dropItem(p);
      return;
    }
    const press = this.press;
    if (!press) return;
    this.press = null;
    press.timer.remove(false);
    if (press.dragging) {
      this.dropAnimal(press.animalId, p);
      return;
    }
    if (!inside || press.held) return;
    // Held long enough but the timer didn't get to fire (slow frames): still a pet, not a tap.
    if (performance.now() - press.startedAt >= HOLD_MS) this.petAnimal(press.animalId);
    else appBus.emit('selectAnimal', { id: press.animalId });
  }

  private cancelPress(): void {
    if (!this.press) return;
    this.press.timer.remove(false);
    if (this.press.dragging) this.animals.get(this.press.animalId)?.endDrag();
    this.press = null;
  }

  /** Dropped near the door: through it, if there's room on the other side. */
  private dropAnimal(animalId: string, p: Vec2): void {
    const sprite = this.animals.get(animalId);
    const door = doorOf(this.zone);
    if (Math.hypot(p.x - door.x, p.y - door.y) > DOOR_RADIUS) {
      sprite?.endDrag();
      return;
    }
    const to: Zone = this.zone === 'yard' ? 'house' : 'yard';
    const result = this.session.sim.moveAnimalToZone(animalId, to);
    if (result.ok) {
      sprite?.endDrag(false); // The animalMovedZone event walks it out.
      return;
    }
    sprite?.endDrag();
    this.fx.floatText(door.x, door.y - 110, result.reason, '#a33b22', 22);
  }

  private petAnimal(animalId: string): void {
    const result = this.session.sim.pet(animalId);
    if (result.ok) return; // The animalPetted event draws the hearts.
    const s = this.animals.get(animalId);
    if (s) this.fx.floatText(s.x, s.y - 90, '💕 Loved that!', '#e0628b', 22);
  }

  private select(id: string | null): void {
    this.animals.get(this.selectedId ?? '')?.setSelected(false);
    this.selectedId = id;
    this.animals.get(id ?? '')?.setSelected(true);
  }

  // ---- Decorate mode (DESIGN 12.3) -----------------------------------------------------------

  private setDecorating(on: boolean): void {
    this.decorating = on;
    this.pickItemId = null;
    this.selectPlaced(null);
    this.cancelPress();
    this.ghost.clear();
    this.drawGrid();
    this.gridLayer.setVisible(on);
    this.avatar.setVisible(!on);
    // Zoom out a little so the whole room fits above the Decorate tray.
    const cam = this.cameras.main;
    const zoom = on ? DECORATE_ZOOM : 1;
    const center = on ? DECORATE_CENTER : { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 };
    if (this.reducedMotion()) {
      cam.setZoom(zoom).centerOn(center.x, center.y);
    } else {
      cam.zoomTo(zoom, 250, 'Sine.easeInOut', true);
      cam.pan(center.x, center.y, 250, 'Sine.easeInOut', true);
    }
  }

  private drawGrid(): void {
    const g = this.gridLayer.clear();
    const walls = this.zone === 'house' ? [false, true] : [false];
    for (const wall of walls) {
      const area = gridArea(this.zone, wall);
      const { cols, rows } = this.grid(wall);
      const tw = area.w / cols;
      const th = area.h / rows;
      g.fillStyle(0xffffff, 0.12).fillRect(area.x, area.y, area.w, area.h);
      g.lineStyle(2, 0xffffff, 0.7);
      for (let c = 0; c <= cols; c++)
        g.lineBetween(area.x + c * tw, area.y, area.x + c * tw, area.y + area.h);
      for (let r = 0; r <= rows; r++)
        g.lineBetween(area.x, area.y + r * th, area.x + area.w, area.y + r * th);
    }
  }

  private selectPlaced(placedId: string | null): void {
    this.selectedPlacedId = placedId;
    appBus.emit('decorSelect', { placedId });
  }

  /** The anchor tile for an item held at world point `p`. */
  private tileFor(def: PlaceableItemDef, p: Vec2, rotation: PlacedItem['rotation'] = 0) {
    const wall = layerOf(def) === 'wall';
    return tileAt(this.zone, this.grid(wall), p, rotated(def, rotation), wall);
  }

  private showGhost(
    itemId: string,
    p: Vec2,
    rotation: PlacedItem['rotation'] = 0,
    movingId?: string,
  ): void {
    const def = getItem(itemId);
    this.ghost.clear();
    if (!def || !isPlaceable(def)) return;
    const tile = this.tileFor(def, p, rotation);
    if (!tile) return;
    const ok = this.session.sim.canPlace(itemId, this.zone, tile, rotation, movingId).ok;
    const wall = layerOf(def) === 'wall';
    const r = tileRect(this.zone, this.grid(wall), tile, rotated(def, rotation), wall);
    this.ghost
      .fillStyle(ok ? 0x6cc46a : 0xef6f6f, 0.45)
      .fillRoundedRect(r.x, r.y, r.w, r.h, 10)
      .lineStyle(4, ok ? 0x3f8f3d : 0xa33b22, 1)
      .strokeRoundedRect(r.x, r.y, r.w, r.h, 10);
  }

  /** A tap on an empty spot: places the picked tray item there, or deselects. */
  private decorTapEmpty(p: Vec2): void {
    if (this.pickItemId) this.placeFromTray(this.pickItemId, p);
    else this.selectPlaced(null);
  }

  private placeFromTray(itemId: string, p: Vec2): void {
    this.ghost.clear();
    const def = getItem(itemId);
    if (!def || !isPlaceable(def)) return;
    const tile = this.tileFor(def, p);
    if (!tile) return;
    const result = this.session.sim.placeItem(itemId, this.zone, tile);
    if (!result.ok) {
      this.fx.floatText(p.x, p.y - 30, result.reason, '#a33b22', 22);
      return;
    }
    if (!result.placedId) return;
    this.pickItemId = null;
    appBus.emit('decorPlaced', { itemId, placedId: result.placedId });
    this.selectPlaced(result.placedId);
    this.fx.burst(p.x, p.y, [0xffd84d, 0xffffff, 0x9fe7ff], 8);
  }

  private itemPressed(placedId: string, itemId: string, p: Vec2): void {
    if (!this.decorating) return;
    this.selectPlaced(placedId);
    this.itemDrag = { placedId, itemId, start: p, moved: false };
  }

  private dragItem(p: Vec2): void {
    const drag = this.itemDrag!;
    if (!drag.moved && Math.hypot(p.x - drag.start.x, p.y - drag.start.y) < 12) return;
    drag.moved = true;
    const item = this.session.sim.state.world.placedItems.find((i) => i.id === drag.placedId);
    if (item) this.showGhost(drag.itemId, p, item.rotation, item.id);
  }

  private dropItem(p: Vec2): void {
    const drag = this.itemDrag!;
    this.itemDrag = null;
    this.ghost.clear();
    if (!drag.moved) return;
    const item = this.session.sim.state.world.placedItems.find((i) => i.id === drag.placedId);
    const def = getItem(drag.itemId);
    if (!item || !def || !isPlaceable(def)) return;
    const tile = this.tileFor(def, p, item.rotation);
    if (!tile) return;
    const result = this.session.sim.moveItem(item.id, tile);
    if (!result.ok) this.fx.floatText(p.x, p.y - 30, result.reason, '#a33b22', 22);
  }
}

function rotated(def: PlaceableItemDef, rotation: PlacedItem['rotation']) {
  return rotation === 90 || rotation === 270 ? { w: def.size.h, h: def.size.w } : def.size;
}
