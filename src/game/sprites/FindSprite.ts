import Phaser from 'phaser';
import { FIND_VIEW, findSvg } from '../../art/findSvg';
import { svgDataUri } from '../../art/svg';
import type { Vec2, YardFind } from '../../sim/types';
import { ensureTexture } from './svgTexture';

/** Above the animals, so a find is always tappable; below the effects (10 000). */
const FIND_DEPTH = 9_000;

/**
 * A coin, lucky clover, or butterfly in the yard (early-game pass). It bobs gently (butterflies
 * flap); tap it for coins. The tap target is 88 world px, over 48 CSS px on an iPad mini.
 */
export class FindSprite extends Phaser.GameObjects.Container {
  readonly findId: string;
  private readonly art: Phaser.GameObjects.Image;
  private leaving = false;

  constructor(
    scene: Phaser.Scene,
    find: YardFind,
    at: Vec2,
    private readonly reducedMotion: () => boolean,
  ) {
    super(scene, at.x, at.y);
    this.findId = find.id;
    const shadow = scene.add.ellipse(0, 26, 40, 10, 0x000000, 0.12);
    this.art = scene.add.image(0, 0, '__DEFAULT').setVisible(false);
    // Bobbing and flapping move this, so they never fight the picture's own size.
    const motion = scene.add.container(0, 0, [this.art]);
    this.add([shadow, motion]);
    this.setSize(88, 88);
    this.setInteractive({ useHandCursor: true });
    this.setDepth(FIND_DEPTH);
    scene.add.existing(this);

    const key = `find.${find.kind}`;
    ensureTexture(
      scene,
      key,
      () => svgDataUri(findSvg(find.kind)),
      FIND_VIEW,
      () => {
        if (!this.scene) return;
        this.art.setTexture(key).setDisplaySize(FIND_VIEW.w, FIND_VIEW.h).setVisible(true);
      },
    );

    if (reducedMotion()) return;
    this.setScale(0.2);
    scene.tweens.add({ targets: this, scale: 1, duration: 350, ease: 'Back.easeOut' });
    scene.tweens.add({
      targets: motion,
      y: -8,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    if (find.kind === 'butterfly') {
      scene.tweens.add({
        targets: motion,
        scaleX: { from: 1, to: 0.45 },
        duration: 220,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }

  /** Collected: a quick pop. */
  collect(): void {
    this.leave(this.reducedMotion() ? 0 : -20, 1.4);
  }

  /** Nobody tapped it: it floats (or flutters) away. */
  fadeAway(): void {
    this.leave(this.reducedMotion() ? 0 : -60, 0.8);
  }

  private leave(dy: number, scale: number): void {
    if (this.leaving) return;
    this.leaving = true;
    this.disableInteractive();
    this.scene.tweens.add({
      targets: this,
      y: this.y + dy,
      scale,
      alpha: 0,
      duration: 350,
      onComplete: () => this.destroy(),
    });
  }
}
