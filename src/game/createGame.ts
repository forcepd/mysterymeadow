import Phaser from 'phaser';
import type { GameSession } from '../bridge/gameSession';
import { COLORS, WORLD_HEIGHT, WORLD_WIDTH } from './constants';
import { HouseScene } from './scenes/HouseScene';
import { VetScene } from './scenes/VetScene';
import { YardScene } from './scenes/YardScene';

export function createGame(parent: HTMLElement, session: GameSession): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO, // WebGL, falling back to Canvas
    // Sound is ours (src/audio), so Phaser never opens a second audio context.
    audio: { noAudio: true },
    parent,
    backgroundColor: COLORS.grass,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: WORLD_WIDTH,
      height: WORLD_HEIGHT,
    },
    input: { activePointers: 3 },
    banner: false,
    // The yard starts; the house and the Vet Clinic start when first shown. Whatever isn't
    // showing sleeps (keeps its sprites, ignores taps).
    scene: [new YardScene(session), new HouseScene(session), new VetScene(session)],
  });
}
