import type Phaser from 'phaser';
import { COLORS, WORLD_HEIGHT, WORLD_WIDTH } from '../constants';
import { LAYOUT } from '../layout';

/** Static yard scenery: grass, path, fence with gate, flowers. Drawn once. */
export function drawYard(scene: Phaser.Scene): void {
  scene.add.rectangle(0, 0, WORLD_WIDTH, WORLD_HEIGHT, COLORS.grass).setOrigin(0).setDepth(-1000);

  const g = scene.add.graphics().setDepth(-900);
  // Grass tufts.
  g.fillStyle(COLORS.grassDark, 0.35);
  for (let x = 40; x < WORLD_WIDTH; x += 150) {
    for (let y = 380; y < WORLD_HEIGHT; y += 110) {
      g.fillEllipse(x + ((y / 110) % 2) * 75, y, 34, 12);
    }
  }

  // Path from the top of the world down to the gate.
  const pathX = LAYOUT.gate.x + LAYOUT.gate.width / 2;
  g.fillStyle(COLORS.pathEdge, 1);
  g.fillRoundedRect(pathX - 62, -20, 124, LAYOUT.fenceY + 70, 40);
  g.fillStyle(COLORS.path, 1);
  g.fillRoundedRect(pathX - 54, -20, 108, LAYOUT.fenceY + 62, 36);

  // Flowers.
  const flowers: [number, number, number][] = [
    [480, 390, 0xff9fc4],
    [620, 760, 0xffe066],
    [150, 770, 0xb69bff],
    [980, 420, 0xff9fc4],
    [1230, 700, 0xffe066],
    [520, 120, 0xffffff],
    [760, 210, 0xff9fc4],
    [900, 90, 0xffe066],
  ];
  for (const [x, y, color] of flowers) {
    g.fillStyle(color, 1);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      g.fillCircle(x + Math.cos(a) * 7, y + Math.sin(a) * 7, 6);
    }
    g.fillStyle(0xffc93c, 1);
    g.fillCircle(x, y, 5);
  }

  // Fence with a gap for the gate.
  const f = scene.add.graphics().setDepth(LAYOUT.fenceY);
  const gateLeft = LAYOUT.gate.x;
  const gateRight = LAYOUT.gate.x + LAYOUT.gate.width;
  const railY = [LAYOUT.fenceY - 26, LAYOUT.fenceY - 8];
  f.fillStyle(COLORS.fence, 1).lineStyle(3, COLORS.fenceEdge, 1);
  for (const [from, to] of [
    [-10, gateLeft],
    [gateRight, WORLD_WIDTH + 10],
  ] as const) {
    for (const y of railY) {
      f.fillRect(from, y, to - from, 9).strokeRect(from, y, to - from, 9);
    }
    for (let x = from + 20; x < to - 10; x += 48) {
      f.fillRoundedRect(x - 8, LAYOUT.fenceY - 44, 16, 50, 6);
      f.strokeRoundedRect(x - 8, LAYOUT.fenceY - 44, 16, 50, 6);
    }
  }
  // Gate posts and the open gate panel.
  for (const x of [gateLeft, gateRight]) {
    f.fillRoundedRect(x - 12, LAYOUT.fenceY - 66, 24, 74, 8);
    f.strokeRoundedRect(x - 12, LAYOUT.fenceY - 66, 24, 74, 8);
    f.fillStyle(COLORS.roof, 1).fillCircle(x, LAYOUT.fenceY - 70, 10);
    f.fillStyle(COLORS.fence, 1);
  }
  f.fillRect(gateRight + 12, LAYOUT.fenceY - 30, 12, 34).strokeRect(
    gateRight + 12,
    LAYOUT.fenceY - 30,
    12,
    34,
  );
}

/**
 * The house exterior (redrawn when the color or tier changes). Placeholder art that gets
 * fancier per tier (0 Cottage .. 3 Manor): a porch, an attic window, then towers and a flag.
 */
export function drawHouse(g: Phaser.GameObjects.Graphics, wallColor: number, tier = 0): void {
  const { x, y, width, height } = LAYOUT.house;
  const roofH = 100;
  const wallTop = y + roofH - 10;
  g.clear();

  // Manor: towers with pointy roofs on both sides, behind the house.
  if (tier >= 3) {
    for (const tx of [x - 18, x + width - 42]) {
      g.fillStyle(wallColor, 1).lineStyle(5, COLORS.outline, 1);
      g.fillRoundedRect(tx, wallTop - 30, 60, height - roofH + 40, 8);
      g.strokeRoundedRect(tx, wallTop - 30, 60, height - roofH + 40, 8);
      g.fillStyle(0x8a6fc7, 1).lineStyle(5, 0x5f4a96, 1);
      g.fillTriangle(tx - 8, wallTop - 28, tx + 30, wallTop - 110, tx + 68, wallTop - 28);
      g.strokeTriangle(tx - 8, wallTop - 28, tx + 30, wallTop - 110, tx + 68, wallTop - 28);
      g.fillStyle(COLORS.window, 1).lineStyle(4, COLORS.outline, 1);
      g.fillRoundedRect(tx + 18, wallTop + 10, 24, 34, { tl: 12, tr: 12, bl: 2, br: 2 });
      g.strokeRoundedRect(tx + 18, wallTop + 10, 24, 34, { tl: 12, tr: 12, bl: 2, br: 2 });
    }
    // A flag on the left tower.
    g.lineStyle(4, COLORS.outline, 1).lineBetween(x + 12, wallTop - 110, x + 12, wallTop - 150);
    g.fillStyle(0xff6f9a, 1).fillTriangle(
      x + 14,
      wallTop - 150,
      x + 46,
      wallTop - 140,
      x + 14,
      wallTop - 130,
    );
  }

  // Chimney.
  g.fillStyle(COLORS.roofEdge, 1).fillRect(x + width - 90, y + 10, 34, 60);
  // Walls.
  g.fillStyle(wallColor, 1).lineStyle(5, COLORS.outline, 1);
  g.fillRoundedRect(x + 20, wallTop, width - 40, height - roofH + 10, 10);
  g.strokeRoundedRect(x + 20, wallTop, width - 40, height - roofH + 10, 10);
  // Roof.
  g.fillStyle(COLORS.roof, 1).lineStyle(5, COLORS.roofEdge, 1);
  g.fillTriangle(x, wallTop + 6, x + width / 2, y, x + width, wallTop + 6);
  g.strokeTriangle(x, wallTop + 6, x + width / 2, y, x + width, wallTop + 6);
  // Farmhouse and up: a round attic window.
  if (tier >= 2) {
    g.fillStyle(COLORS.window, 1).lineStyle(4, COLORS.outline, 1);
    g.fillCircle(x + width / 2, y + 58, 20).strokeCircle(x + width / 2, y + 58, 20);
    g.lineBetween(x + width / 2 - 20, y + 58, x + width / 2 + 20, y + 58);
  }
  // Door.
  const doorW = 62;
  const doorH = 92;
  const doorX = x + width / 2 - doorW / 2;
  const doorY = y + height - doorH;
  g.fillStyle(COLORS.door, 1).lineStyle(4, COLORS.outline, 1);
  g.fillRoundedRect(doorX, doorY, doorW, doorH, { tl: 28, tr: 28, bl: 0, br: 0 });
  g.strokeRoundedRect(doorX, doorY, doorW, doorH, { tl: 28, tr: 28, bl: 0, br: 0 });
  g.fillStyle(0xffd76a, 1).fillCircle(doorX + doorW - 14, doorY + doorH / 2 + 6, 5);
  // Windows.
  for (const wx of [x + 55, x + width - 115]) {
    g.fillStyle(COLORS.window, 1).lineStyle(4, COLORS.outline, 1);
    g.fillRoundedRect(wx, wallTop + 30, 60, 50, 6).strokeRoundedRect(wx, wallTop + 30, 60, 50, 6);
    g.lineStyle(3, COLORS.outline, 1).lineBetween(wx + 30, wallTop + 30, wx + 30, wallTop + 80);
    g.lineBetween(wx, wallTop + 55, wx + 60, wallTop + 55);
    // Bungalow and up: flower boxes.
    if (tier >= 1) {
      g.fillStyle(0x9b6a45, 1).fillRect(wx - 4, wallTop + 80, 68, 10);
      for (let i = 0; i < 5; i++) {
        g.fillStyle([0xff9fc4, 0xffe066, 0xb69bff][i % 3]!, 1).fillCircle(
          wx + 4 + i * 13,
          wallTop + 78,
          6,
        );
      }
    }
  }
  // Bungalow and up: a little porch roof over the door.
  if (tier >= 1) {
    g.fillStyle(COLORS.roof, 1).lineStyle(4, COLORS.roofEdge, 1);
    g.fillRoundedRect(doorX - 22, doorY - 16, doorW + 44, 14, 6);
    g.strokeRoundedRect(doorX - 22, doorY - 16, doorW + 44, 14, 6);
  }
}
