import Phaser from 'phaser';
import { BALANCE } from '../../config/balance';
import type { PlacedItem, Vec2 } from '../../sim/types';
import { COLORS, FONT, TEXT_RESOLUTION } from '../constants';

/** A food bowl: shows how much food is left; wobbles with "!" when empty. Tap to refill. */
export class BowlSprite extends Phaser.GameObjects.Container {
  readonly bowlId: string;
  private readonly art: Phaser.GameObjects.Graphics;
  private readonly alert: Phaser.GameObjects.Text;
  private servings = -1;
  private alertTween: Phaser.Tweens.Tween | undefined;

  constructor(
    scene: Phaser.Scene,
    bowl: PlacedItem,
    at: Vec2,
    private readonly reducedMotion: () => boolean,
  ) {
    super(scene, at.x, at.y);
    this.bowlId = bowl.id;
    this.art = scene.add.graphics();
    this.alert = scene.add
      .text(0, -52, '!', {
        fontFamily: FONT,
        fontSize: '30px',
        fontStyle: '800',
        color: '#ffffff',
        backgroundColor: '#e0628b',
        padding: { x: 12, y: 0 },
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5)
      .setVisible(false);
    this.add([this.art, this.alert]);
    this.setSize(96, 80);
    this.setInteractive({ useHandCursor: true });
    this.setDepth(at.y);
    scene.add.existing(this);
    this.sync(bowl);
  }

  sync(bowl: PlacedItem): void {
    const servings = bowl.servings ?? 0;
    if (servings === this.servings) return;
    this.servings = servings;
    this.draw(servings);
    const empty = servings === 0;
    this.alert.setVisible(empty);
    this.alertTween?.stop();
    this.alertTween = undefined;
    this.alert.setScale(1);
    if (empty && !this.reducedMotion()) {
      this.alertTween = this.scene.tweens.add({
        targets: this.alert,
        scale: 1.2,
        duration: 450,
        yoyo: true,
        repeat: -1,
      });
    }
  }

  private draw(servings: number): void {
    const g = this.art.clear();
    const fill = servings / BALANCE.needs.bowlServings;
    g.fillStyle(0x000000, 0.12).fillEllipse(0, 20, 84, 18);
    // Food mound, taller when fuller.
    if (fill > 0) {
      g.fillStyle(0xc98a4b, 1).fillEllipse(0, -2 - 8 * fill, 60, 14 + 16 * fill);
      g.fillStyle(0xe0a868, 1);
      for (let i = 0; i < Math.ceil(fill * 6); i++) g.fillCircle(-20 + i * 8, -6 - 8 * fill, 4);
    }
    // Bowl.
    g.lineStyle(4, COLORS.outline, 1).fillStyle(0x7fb8e6, 1);
    g.fillRoundedRect(-38, -4, 76, 26, { tl: 4, tr: 4, bl: 16, br: 16 });
    g.strokeRoundedRect(-38, -4, 76, 26, { tl: 4, tr: 4, bl: 16, br: 16 });
    g.fillStyle(0xffffff, 0.6).fillEllipse(-18, 6, 14, 5);
  }
}
