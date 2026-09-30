import Phaser from 'phaser';
import { avatarDataUri, avatarKey } from '../../art/avatarSvg';
import type { AvatarLoadout } from '../../profile/avatar';
import type { Rect } from '../layout';

/** Rendered at 2x for Retina screens, then shown at SCALE of that. */
const RESOLUTION = 2;
const SCALE = 0.9 / RESOLUTION;
const SIZE = { w: 132, h: 224 };
const SPEED = 260; // world px per second
const MAX_MS = 1800;
/** How far to the side of a tapped spot the avatar stops (world px). */
const STAND_BESIDE = 85;

/**
 * The player's avatar in the world (DESIGN 13.3): walks toward wherever the player taps, just
 * for flavor. Never interactive, so taps always reach animals, bowls, and poop underneath.
 */
export class PlayerAvatar extends Phaser.GameObjects.Container {
  private image: Phaser.GameObjects.Image | null = null;
  private key = '';
  private walk: Phaser.Tweens.Tween | undefined;
  private hop: Phaser.Tweens.Tween | undefined;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly bounds: Rect,
    private readonly reducedMotion: () => boolean,
  ) {
    super(scene, x, y);
    const shadow = scene.add.ellipse(0, 0, 60, 16, 0x000000, 0.14);
    this.add(shadow);
    scene.add.existing(this);
    this.setDepth(y);
  }

  /** Shows this outfit, rendering its texture the first time it's seen. */
  setLoadout(loadout: AvatarLoadout): void {
    const key = avatarKey(loadout);
    if (key === this.key) return;
    this.key = key;
    const textures = this.scene.textures;
    if (textures.exists(key)) {
      this.showTexture(key);
      return;
    }
    const img = new Image();
    img.onload = () => {
      if (!this.scene || this.key !== key) return;
      // Draw into a canvas of an exact size: browsers disagree on an SVG image's own size
      // (WebKit drew it small and offset when used as a texture directly).
      if (!textures.exists(key)) {
        const canvas = document.createElement('canvas');
        canvas.width = SIZE.w * RESOLUTION;
        canvas.height = SIZE.h * RESOLUTION;
        canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
        textures.addCanvas(key, canvas);
      }
      this.showTexture(key);
    };
    img.src = avatarDataUri(loadout);
  }

  private showTexture(key: string): void {
    if (this.image) this.image.setTexture(key);
    else {
      this.image = this.scene.add.image(0, 4, key).setOrigin(0.5, 1).setScale(SCALE);
      this.add(this.image);
    }
  }

  /**
   * Walks toward a tapped point (clamped to the walkable area), stopping beside it on the side
   * it came from, so it never stands on top of the animal or bowl that was tapped.
   */
  walkToward(target: { x: number; y: number }): void {
    const b = this.bounds;
    const side = this.x <= target.x ? -1 : 1;
    const x = Phaser.Math.Clamp(target.x + side * STAND_BESIDE, b.x, b.x + b.w);
    const y = Phaser.Math.Clamp(target.y + 30, b.y, b.y + b.h);
    this.walk?.stop();
    if (Math.abs(x - this.x) > 4) this.image?.setFlipX(x < this.x);
    if (this.reducedMotion()) {
      this.setPosition(x, y).setDepth(y);
      return;
    }
    const dist = Math.hypot(x - this.x, y - this.y);
    if (!this.hop?.isPlaying()) {
      this.hop = this.scene.tweens.add({
        targets: this.image,
        y: -4,
        duration: 140,
        yoyo: true,
        repeat: -1,
      });
    }
    this.walk = this.scene.tweens.add({
      targets: this,
      x,
      y,
      duration: Math.min(MAX_MS, Math.max(200, (dist / SPEED) * 1000)),
      ease: 'Sine.easeInOut',
      onUpdate: () => this.setDepth(this.y),
      onComplete: () => {
        this.hop?.stop();
        this.hop = undefined;
        this.image?.setY(4);
      },
    });
  }
}
