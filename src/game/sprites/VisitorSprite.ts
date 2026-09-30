import Phaser from 'phaser';
import { RARITY_STYLE, starString } from '../../art/palette';
import { animalArt, mysteryArt, type ArtRequest } from '../../assets/manifest';
import { speciesName } from '../../bridge/describe';
import type { Vec2, Visitor } from '../../sim/types';
import { FONT, TEXT_RESOLUTION } from '../constants';
import { ensureTexture } from './svgTexture';

/**
 * A mystery visitor at the gate: a wobbling silhouette with a "?" bubble until revealed,
 * then the animal with its name and rarity stars (and "No room!" if it can't come in yet).
 */
export class VisitorSprite extends Phaser.GameObjects.Container {
  readonly visitorId: string;
  private readonly figure: Phaser.GameObjects.Container;
  private readonly art: Phaser.GameObjects.Image;
  private artKey = '';
  private readonly bubble: Phaser.GameObjects.Text;
  private readonly title: Phaser.GameObjects.Text;
  private wobble?: Phaser.Tweens.Tween;
  private revealed: boolean;
  private slot: Vec2;
  private leaving = false;

  constructor(
    scene: Phaser.Scene,
    visitor: Visitor,
    slot: Vec2,
    private readonly reducedMotion: () => boolean,
  ) {
    super(scene, slot.x, slot.y);
    this.visitorId = visitor.id;
    this.slot = slot;
    this.revealed = visitor.revealed;

    const shadow = scene.add.ellipse(0, 24, 76, 20, 0x000000, 0.12);
    this.art = scene.add.image(0, 0, '__DEFAULT').setVisible(false);
    this.figure = scene.add.container(0, 0, [this.art]);
    this.bubble = scene.add
      .text(0, -100, '?', {
        fontFamily: FONT,
        fontSize: '34px',
        fontStyle: '800',
        color: '#4b4560',
        backgroundColor: '#ffffff',
        padding: { x: 14, y: 2 },
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5);
    this.title = scene.add
      .text(0, 48, '', {
        fontFamily: FONT,
        fontSize: '18px',
        fontStyle: '800',
        align: 'center',
        color: '#2f3a2c',
        backgroundColor: 'rgba(255,253,246,0.9)',
        padding: { x: 8, y: 2 },
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5, 0)
      .setVisible(false);
    this.add([shadow, this.figure, this.bubble, this.title]);
    this.setSize(110, 150);
    this.setInteractive({ useHandCursor: true });
    this.setDepth(slot.y);
    scene.add.existing(this);

    this.draw(visitor);
    if (!visitor.revealed && !reducedMotion()) {
      this.wobble = scene.tweens.add({
        targets: this.figure,
        angle: { from: -7, to: 7 },
        duration: 380,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }

  get isRevealed(): boolean {
    return this.revealed;
  }

  sync(visitor: Visitor, slot: Vec2): void {
    if (this.leaving) return;
    if (slot.x !== this.slot.x || slot.y !== this.slot.y) {
      this.slot = slot;
      this.scene.tweens.add({ targets: this, x: slot.x, y: slot.y, duration: 400 });
      this.setDepth(slot.y);
    }
    if (visitor.revealed && !this.revealed) {
      this.revealed = true;
      this.draw(visitor);
      this.pop();
    }
  }

  /** It couldn't come in: waves and walks back up the path. */
  leave(): void {
    this.leaving = true;
    this.disableInteractive();
    this.bubble.setText('👋').setVisible(true);
    this.scene.tweens.add({
      targets: this,
      y: this.y - (this.reducedMotion() ? 0 : 120),
      alpha: 0,
      delay: 600,
      duration: 900,
      onComplete: () => this.destroy(),
    });
  }

  private draw(visitor: Visitor): void {
    if (!this.revealed) {
      this.show(mysteryArt());
      this.bubble.setText('?').setVisible(true);
      this.title.setVisible(false);
      return;
    }
    this.wobble?.stop();
    this.figure.setAngle(0);
    this.show(animalArt(visitor.roll));
    const style = RARITY_STYLE[visitor.roll.rarity];
    const sparkle = visitor.roll.isSparkle ? '✦ Sparkle ' : '';
    this.title
      .setText(
        `${sparkle}${speciesName(visitor.roll.speciesId)}\n${starString(visitor.roll.rarity)}`,
      )
      .setColor(style.color)
      .setVisible(true);
    // Shown until it walks in; if it has to wait, the kid knows why.
    this.bubble.setText('No room!').setFontSize(20).setVisible(true);
  }

  private show(art: ArtRequest): void {
    this.artKey = art.key;
    ensureTexture(this.scene, art.key, art.uri, art.size, (key) => {
      if (!this.scene || this.artKey !== key) return;
      this.art
        .setTexture(key)
        .setOrigin(art.origin.x, art.origin.y)
        .setDisplaySize(art.size.w, art.size.h)
        .setVisible(true);
    });
  }

  private pop(): void {
    if (this.reducedMotion()) return;
    this.figure.setScale(0.3);
    this.scene.tweens.add({
      targets: this.figure,
      scale: 1,
      duration: 500,
      ease: 'Back.easeOut',
    });
  }
}
