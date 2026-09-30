import Phaser from 'phaser';
import type { Poop, Vec2 } from '../../sim/types';

/** A little swirl of poop. Tap to clean it (sparkle + pop). */
export class PoopSprite extends Phaser.GameObjects.Container {
  readonly poopId: string;

  constructor(scene: Phaser.Scene, poop: Poop, at: Vec2, animate: boolean) {
    super(scene, at.x, at.y);
    this.poopId = poop.id;
    const g = scene.add.graphics();
    g.fillStyle(0x000000, 0.12).fillEllipse(0, 10, 44, 12);
    g.lineStyle(3, 0x5a3a22, 1).fillStyle(0x8b5a33, 1);
    g.fillEllipse(0, 4, 40, 16).strokeEllipse(0, 4, 40, 16);
    g.fillEllipse(0, -6, 30, 14).strokeEllipse(0, -6, 30, 14);
    g.fillEllipse(2, -15, 18, 11).strokeEllipse(2, -15, 18, 11);
    g.fillStyle(0xffffff, 0.35).fillEllipse(-6, -8, 8, 4);
    // Wavy lines so it reads as "needs cleaning".
    g.lineStyle(2, 0x9a8a5a, 0.6);
    for (const x of [-14, 14]) {
      g.beginPath();
      g.moveTo(x, -22);
      g.lineTo(x + 3, -30);
      g.lineTo(x - 1, -38);
      g.strokePath();
    }
    this.add(g);
    this.setSize(72, 72);
    this.setInteractive({ useHandCursor: true });
    this.setDepth(at.y - 1);
    scene.add.existing(this);
    if (animate) {
      this.setScale(0.2);
      scene.tweens.add({ targets: this, scale: 1, duration: 300, ease: 'Back.easeOut' });
    }
  }

  /** Cleaned: shrinks away. */
  clean(): void {
    this.disableInteractive();
    this.scene.tweens.add({
      targets: this,
      scale: 0,
      duration: 220,
      ease: 'Back.easeIn',
      onComplete: () => this.destroy(),
    });
  }
}
