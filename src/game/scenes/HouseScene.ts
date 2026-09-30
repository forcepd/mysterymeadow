import Phaser from 'phaser';
import { parseHex } from '../../art/palette';
import type { GameSession } from '../../bridge/gameSession';
import { getItem } from '../../config/items';
import { COLORS, FONT, TEXT_RESOLUTION, WORLD_HEIGHT, WORLD_WIDTH } from '../constants';
import { INSIDE_DOOR, ROOM } from '../layout';
import { ZoneScene } from './ZoneScene';

/**
 * The house interior (DESIGN 12): wallpaper and flooring, placed furniture and beds, and the
 * animals inside. The doormat at the bottom is the way out.
 */
export class HouseScene extends ZoneScene {
  protected readonly zone = 'house';
  private room!: Phaser.GameObjects.Graphics;
  private surfaces = '';

  constructor(session: GameSession) {
    super({ key: 'House', active: false }, session);
  }

  protected drawBackground(): void {
    this.add.rectangle(0, 0, WORLD_WIDTH, WORLD_HEIGHT, 0x9a7b5f).setOrigin(0).setDepth(-1000);
    this.room = this.add.graphics().setDepth(-900);

    // The doormat and the way out.
    const mat = this.add.graphics().setDepth(-450);
    mat.fillStyle(0x8fbf6a, 1).fillRoundedRect(INSIDE_DOOR.x - 90, INSIDE_DOOR.y - 26, 180, 52, 14);
    mat
      .lineStyle(4, 0x5f8f4a, 1)
      .strokeRoundedRect(INSIDE_DOOR.x - 90, INSIDE_DOOR.y - 26, 180, 52, 14);
    this.add
      .text(INSIDE_DOOR.x, INSIDE_DOOR.y, '🌳 Outside', {
        fontFamily: FONT,
        fontSize: '20px',
        fontStyle: '800',
        color: '#ffffff',
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5)
      .setDepth(-440);
  }

  protected reconcileExtra(): void {
    const { wallpaperId, flooringId } = this.session.sim.state.world.house;
    const key = `${wallpaperId}|${flooringId}`;
    if (key === this.surfaces) return;
    this.surfaces = key;
    this.drawRoom(
      parseHex(getItem(wallpaperId)?.color ?? '#fbf1dc'),
      parseHex(getItem(flooringId)?.color ?? '#e3c08f'),
    );
  }

  private drawRoom(wall: number, floor: number): void {
    const g = this.room.clear();
    const { left, right, wallTop, wallBottom, floorBottom } = ROOM;
    const w = right - left;
    // Walls, with a soft stripe pattern.
    g.fillStyle(wall, 1).fillRect(left, wallTop - 40, w, wallBottom - wallTop + 40);
    g.fillStyle(0xffffff, 0.18);
    for (let x = left; x < right; x += 70)
      g.fillRect(x, wallTop - 40, 30, wallBottom - wallTop + 40);
    // Floor, with boards.
    g.fillStyle(floor, 1).fillRect(left, wallBottom, w, floorBottom - wallBottom + 70);
    g.lineStyle(2, 0x000000, 0.08);
    for (let y = wallBottom + 40; y < floorBottom + 70; y += 40) g.lineBetween(left, y, right, y);
    // Baseboard and room outline.
    g.fillStyle(0xffffff, 1).fillRect(left, wallBottom - 8, w, 10);
    g.lineStyle(6, COLORS.outline, 1).strokeRect(
      left,
      wallTop - 40,
      w,
      floorBottom - wallTop + 110,
    );
  }
}
