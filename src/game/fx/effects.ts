import type Phaser from 'phaser';
import { FONT, TEXT_RESOLUTION, WORLD_WIDTH } from '../constants';
import { ParticleBudget } from './budget';

/**
 * Most particles alive at once in a scene (DESIGN 18.5: cap particles). Effects past the cap are
 * trimmed, never queued, so a burst of events can't pile up work on an older iPad.
 */
export const MAX_PARTICLES = 90;

const CONFETTI = [0xff8fc4, 0xffd84d, 0x8fd6ff, 0x9ff0c8, 0xb69bff, 0xff9f5a];

/** Short-lived celebration effects. All respect reduced motion (they fade in place). */
export class Effects {
  private readonly budget = new ParticleBudget(MAX_PARTICLES);

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly reducedMotion: () => boolean,
  ) {}

  private take(want: number): number {
    return this.budget.take(want);
  }

  private done(obj: Phaser.GameObjects.GameObject): void {
    this.budget.release();
    obj.destroy();
  }

  /** Particles alive right now (for the performance pass). */
  get particleCount(): number {
    return this.budget.count;
  }

  /** Stars bursting outward (reveal, birth). */
  burst(x: number, y: number, colors: readonly number[], count = 10): void {
    const still = this.reducedMotion();
    const n = this.take(count);
    for (let i = 0; i < n; i++) {
      const angle = (i / n) * Math.PI * 2;
      const color = colors[i % colors.length] ?? 0xffffff;
      const star = this.scene.add.star(x, y, 5, 5, 11, color).setDepth(10_000);
      const dist = still ? 0 : 60 + (i % 3) * 18;
      this.scene.tweens.add({
        targets: star,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        alpha: 0,
        scale: still ? 1 : 0.4,
        duration: 650,
        ease: 'Cubic.easeOut',
        onComplete: () => this.done(star),
      });
    }
  }

  /** Paper confetti popping up and fluttering down (reveals, births, big moments). */
  confetti(x: number, y: number, count = 18): void {
    const n = this.take(count);
    const still = this.reducedMotion();
    for (let i = 0; i < n; i++) {
      const color = CONFETTI[i % CONFETTI.length]!;
      const piece = this.scene.add
        .rectangle(x, y, 9, 14, color)
        .setDepth(10_000)
        .setAngle((i * 47) % 360);
      if (still) {
        piece.setPosition(x + ((i % 6) - 2.5) * 16, y - 20 + Math.floor(i / 6) * 14);
        this.scene.tweens.add({
          targets: piece,
          alpha: 0,
          duration: 900,
          onComplete: () => this.done(piece),
        });
        continue;
      }
      const spread = ((i / (n - 1 || 1)) * 2 - 1) * 150;
      const peak = y - 90 - (i % 4) * 25;
      this.scene.tweens.chain({
        targets: piece,
        tweens: [
          { x: x + spread * 0.6, y: peak, duration: 320, ease: 'Quad.easeOut' },
          {
            x: x + spread,
            y: y + 60 + (i % 3) * 20,
            angle: piece.angle + 540,
            scaleX: { from: 1, to: 0.2 },
            alpha: 0,
            duration: 1100,
            ease: 'Sine.easeIn',
          },
        ],
        onComplete: () => this.done(piece),
      });
    }
  }

  /** Coins that hop up and fly to the coin counter (sales). */
  coinShower(x: number, y: number, target: { x: number; y: number }, count = 8): void {
    const n = this.take(count);
    const still = this.reducedMotion();
    for (let i = 0; i < n; i++) {
      const coin = this.scene.add.container(x, y).setDepth(10_002);
      coin.add([
        this.scene.add.circle(0, 0, 11, 0xf5b93a).setStrokeStyle(3, 0xc98a00),
        this.scene.add.circle(-3, -3, 3, 0xfff3c4),
      ]);
      if (still) {
        this.scene.tweens.add({
          targets: coin,
          alpha: 0,
          duration: 700,
          onComplete: () => this.done(coin),
        });
        continue;
      }
      const dx = (i - (n - 1) / 2) * 16;
      this.scene.tweens.chain({
        targets: coin,
        tweens: [
          { x: x + dx, y: y - 50 - (i % 3) * 14, duration: 260, ease: 'Quad.easeOut' },
          {
            x: target.x,
            y: target.y,
            scale: 0.6,
            duration: 520,
            delay: i * 45,
            ease: 'Cubic.easeIn',
          },
        ],
        onComplete: () => this.done(coin),
      });
    }
  }

  /** Hearts floating up (births, petting, treats). */
  hearts(x: number, y: number, count = 4): void {
    for (let i = 0; i < count; i++) {
      this.floatText(x + (i - (count - 1) / 2) * 22, y - i * 6, '♥', '#ff6f9a', 34, i * 90);
    }
  }

  /** A soft puff of cloud (the mystery visitor turning into an animal). */
  puff(x: number, y: number): void {
    const n = this.take(7);
    const still = this.reducedMotion();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const cloud = this.scene.add
        .circle(x + Math.cos(a) * 20, y + Math.sin(a) * 14, 22, 0xffffff, 0.9)
        .setDepth(10_000);
      this.scene.tweens.add({
        targets: cloud,
        x: x + Math.cos(a) * (still ? 20 : 70),
        y: y + Math.sin(a) * (still ? 14 : 45),
        scale: still ? 1 : 1.6,
        alpha: 0,
        duration: 600,
        ease: 'Cubic.easeOut',
        onComplete: () => this.done(cloud),
      });
    }
  }

  /** Text that rises and fades (e.g. "+45" coins). Text doesn't count toward the cap. */
  floatText(x: number, y: number, text: string, color: string, size = 30, delay = 0): void {
    const label = this.scene.add
      .text(x, y, text, {
        fontFamily: FONT,
        fontSize: `${size}px`,
        fontStyle: '800',
        color,
        stroke: '#ffffff',
        strokeThickness: 6,
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5)
      .setDepth(10_001)
      .setAlpha(0);
    this.scene.tweens.add({
      targets: label,
      alpha: { from: 1, to: 0 },
      y: y - (this.reducedMotion() ? 0 : 90),
      delay,
      duration: 1100,
      ease: 'Sine.easeOut',
      onComplete: () => label.destroy(),
    });
  }

  /** A big title that pops in and floats away ("Sparkle!", "Legendary!"). */
  banner(x: number, y: number, text: string, color: string): void {
    const label = this.scene.add
      .text(Math.min(Math.max(x, 200), WORLD_WIDTH - 200), y, text, {
        fontFamily: FONT,
        fontSize: '40px',
        fontStyle: '800',
        color,
        stroke: '#ffffff',
        strokeThickness: 8,
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5)
      .setDepth(10_003);
    if (this.reducedMotion()) {
      this.scene.tweens.add({
        targets: label,
        alpha: 0,
        delay: 1200,
        duration: 400,
        onComplete: () => label.destroy(),
      });
      return;
    }
    label.setScale(0.2);
    this.scene.tweens.chain({
      targets: label,
      tweens: [
        { scale: 1, duration: 380, ease: 'Back.easeOut' },
        { y: y - 50, alpha: 0, delay: 900, duration: 500, ease: 'Sine.easeIn' },
      ],
      onComplete: () => label.destroy(),
    });
  }

  ripple(x: number, y: number): void {
    const ring = this.scene.add.circle(x, y, 22).setStrokeStyle(5, 0xffffff).setDepth(9_999);
    this.scene.tweens.add({
      targets: ring,
      scale: this.reducedMotion() ? 1 : 2.2,
      alpha: 0,
      duration: 420,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
  }
}
