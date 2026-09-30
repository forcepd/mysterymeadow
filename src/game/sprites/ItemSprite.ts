import Phaser from 'phaser';
import { itemArt } from '../../assets/manifest';
import { layerOf, type PlaceableItemDef } from '../../config/items';
import type { PlacedItem } from '../../sim/types';
import type { Rect } from '../layout';
import { ensureTexture } from './svgTexture';

/** Depth bands: rugs lie under everything, wall art hangs behind the room. */
const RUG_DEPTH = -500;
const WALL_DEPTH = -600;

/**
 * A placed item, drawn from the asset manifest to fill its footprint. Positioned by its footprint
 * rectangle; floor items depth-sort by their bottom.
 */
export class ItemSprite extends Phaser.GameObjects.Container {
  readonly placedId: string;
  private readonly art: Phaser.GameObjects.Image;
  private artKey = '';
  private key = '';

  constructor(
    scene: Phaser.Scene,
    item: PlacedItem,
    private readonly def: PlaceableItemDef,
    rect: Rect,
  ) {
    super(scene, 0, 0);
    this.placedId = item.id;
    this.art = scene.add.image(0, 0, '__DEFAULT').setVisible(false);
    this.add(this.art);
    scene.add.existing(this);
    this.sync(item, rect);
  }

  sync(item: PlacedItem, rect: Rect): void {
    const key = `${rect.x},${rect.y},${rect.w},${rect.h},${item.rotation}`;
    if (key === this.key) return;
    this.key = key;
    this.setPosition(rect.x + rect.w / 2, rect.y + rect.h / 2);
    this.setSize(rect.w, rect.h);
    this.draw(rect.w, rect.h, item.rotation);
    const layer = layerOf(this.def);
    this.setDepth(layer === 'rug' ? RUG_DEPTH : layer === 'wall' ? WALL_DEPTH : rect.y + rect.h);
    // Hit area = the footprint (re-set because the size can change on rotation).
    this.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, rect.w, rect.h),
      Phaser.Geom.Rectangle.Contains,
    );
  }

  private draw(w: number, h: number, rotation: number): void {
    const art = itemArt(this.def, w, h, rotation);
    this.artKey = art.key;
    ensureTexture(this.scene, art.key, art.uri, art.size, (key) => {
      if (!this.scene || this.artKey !== key) return;
      this.art
        .setTexture(key)
        .setOrigin(art.origin.x, art.origin.y)
        .setDisplaySize(w, h)
        .setVisible(true);
    });
  }
}
