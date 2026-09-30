import type Phaser from 'phaser';
import type { SymptomFx } from '../../config/illnesses';
import { FONT, TEXT_RESOLUTION } from '../constants';

/**
 * Placeholder symptom looks (DESIGN 9.4 "visible symptoms"), drawn in critter space (see
 * critter.ts: head at (0, -32), body at (0, 0)). Decorations go on `layer`, which moves with the
 * animal; motion (limp, shiver) tweens `pose`. With reduced motion everything stays still.
 */
export interface SymptomTargets {
  scene: Phaser.Scene;
  /** Holds the drawings (spots, dots, drips). Cleared on stop. */
  layer: Phaser.GameObjects.Container;
  /** Tweened for body motion. Reset on stop. */
  pose: Phaser.GameObjects.Container;
  reducedMotion: boolean;
}

export interface SymptomHandle {
  stop(): void;
}

export function showSymptom(kind: SymptomFx, t: SymptomTargets): SymptomHandle {
  const { scene, layer, pose, reducedMotion } = t;
  const tweens: Phaser.Tweens.Tween[] = [];
  const timers: Phaser.Time.TimerEvent[] = [];
  const loop = (config: Phaser.Types.Tweens.TweenBuilderConfig) => {
    if (!reducedMotion) tweens.push(scene.tweens.add({ repeat: -1, yoyo: true, ...config }));
  };
  const every = (ms: number, fn: () => void) => {
    if (!reducedMotion) timers.push(scene.time.addEvent({ delay: ms, loop: true, callback: fn }));
  };
  const text = (x: number, y: number, s: string, size: number, color = '#4a3b33') =>
    scene.add
      .text(x, y, s, {
        fontFamily: FONT,
        fontSize: `${size}px`,
        fontStyle: '800',
        color,
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5);
  /** Something that drifts up from (x, y) and fades, then removes itself. */
  const puff = (x: number, y: number, s: string, size: number, color?: string, dx = 0) => {
    const label = text(x, y, s, size, color);
    layer.add(label);
    scene.tweens.add({
      targets: label,
      x: x + dx,
      y: y - 36,
      alpha: 0,
      duration: 1300,
      ease: 'Sine.easeOut',
      onComplete: () => label.destroy(),
    });
  };

  switch (kind) {
    case 'sneeze': {
      // Drippy nose, and a sneeze every few seconds.
      const drip = scene.add.ellipse(4, -20, 6, 10, 0x8fd6ff).setStrokeStyle(2, 0x4a90c0);
      layer.add(drip);
      loop({ targets: drip, y: -16, scaleY: 1.3, duration: 700, ease: 'Sine.easeInOut' });
      every(2600, () => {
        scene.tweens.add({
          targets: pose,
          scaleY: 0.86,
          scaleX: 1.08,
          duration: 110,
          yoyo: true,
          ease: 'Quad.easeOut',
        });
        puff(26, -30, 'achoo!', 14, '#4a90c0', 20);
      });
      if (reducedMotion) layer.add(text(34, -48, 'achoo!', 14, '#4a90c0'));
      break;
    }
    case 'wobble': {
      // Green cheeks and a rumbly, wobbly tummy.
      const g = scene.add.graphics();
      g.fillStyle(0x7ccf6a, 0.85);
      g.fillCircle(-16, -24, 7);
      g.fillCircle(16, -24, 7);
      g.lineStyle(3, 0x6aa85a, 1);
      g.beginPath();
      g.arc(-6, 6, 6, Math.PI * 0.1, Math.PI * 0.9);
      g.arc(6, 6, 6, Math.PI * 0.1, Math.PI * 0.9);
      g.strokePath();
      layer.add(g);
      loop({ targets: pose, angle: { from: -4, to: 4 }, duration: 260, ease: 'Sine.easeInOut' });
      every(3000, () => puff(-30, 0, '~', 22, '#6aa85a', -14));
      break;
    }
    case 'dots': {
      // Tiny bouncing dots in the fur, and a scratch now and then.
      const spots = [
        [-22, -8],
        [14, -14],
        [26, 6],
        [-8, 10],
        [-26, -40],
        [20, -48],
      ] as const;
      spots.forEach(([x, y], i) => {
        const dot = scene.add.circle(x, y, 2.5, 0x3a2e28);
        layer.add(dot);
        loop({ targets: dot, y: y - 8, duration: 180 + i * 37, ease: 'Quad.easeOut' });
      });
      every(2200, () =>
        scene.tweens.add({ targets: pose, x: 3, duration: 50, yoyo: true, repeat: 5 }),
      );
      break;
    }
    case 'limp': {
      // A sore paw (a pink puffy foot) and a limp.
      const paw = scene.add.ellipse(18, 22, 20, 12, 0xff9fb5).setStrokeStyle(3, 0xd46a86);
      layer.add(paw);
      if (reducedMotion) pose.setAngle(5);
      loop({ targets: pose, angle: 6, y: 3, duration: 420, ease: 'Sine.easeInOut' });
      break;
    }
    case 'spots': {
      // Red spots and a warm glow.
      const g = scene.add.graphics();
      g.fillStyle(0xff5a5a, 0.9);
      for (const [x, y] of [
        [-14, -44],
        [12, -40],
        [-2, -52],
        [-20, 2],
        [16, -4],
        [2, 12],
        [24, 10],
      ] as const) {
        g.fillCircle(x, y, 3.5);
      }
      const glow = scene.add.ellipse(0, -20, 100, 110, 0xff7a5a, 0.12);
      layer.addAt(glow, 0);
      layer.add(g);
      loop({ targets: glow, alpha: 0.28, duration: 800, ease: 'Sine.easeInOut' });
      break;
    }
    case 'zzz': {
      // Sleepy: heavy eyelids and floating Zzz.
      const g = scene.add.graphics();
      g.lineStyle(3, 0x4a3b33, 1);
      g.lineBetween(-14, -36, -4, -36);
      g.lineBetween(4, -36, 14, -36);
      layer.add(g);
      loop({ targets: pose, scaleY: 0.95, duration: 1600, ease: 'Sine.easeInOut' });
      if (reducedMotion) layer.add(text(30, -62, 'z z', 18, '#6d6aa8'));
      every(1400, () => puff(22, -56, 'z', 18, '#6d6aa8', 14));
      break;
    }
  }

  return {
    stop() {
      for (const tw of tweens) tw.remove();
      for (const tm of timers) tm.remove();
      // Also the one-off sneezes, scratches, and puffs still in flight.
      scene.tweens.killTweensOf([pose, ...layer.list]);
      layer.removeAll(true);
      pose.setAngle(0).setScale(1).setPosition(0, 0);
    },
  };
}
