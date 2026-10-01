import { expect, test, type Page } from '@playwright/test';
import { tileRect } from '../../src/game/layout';
import type { PlacedItem, SimState } from '../../src/sim/types';
import { buildSave, canvasReady, press, seedSave } from './helpers';
import { tapAt, whereIs, whereWorld } from './helpers3d';

/** The avatar walks (legs and arms swinging) and sits on the armchair and sofa. */

const HOUSE_GRID = { cols: 8, rows: 6 };
const menu = (page: Page) => page.getByRole('navigation', { name: 'Menu' });
const avatar = (page: Page) => page.evaluate(() => window.meadow3d!.avatar());

function placed(id: string, itemId: string, x: number, y: number): PlacedItem {
  return { id, itemId, zone: 'house', tile: { x, y }, rotation: 0 };
}

async function start(page: Page, edit: (s: SimState) => void = () => {}) {
  await seedSave(
    page,
    buildSave((s, now) => {
      s.world.settings.sicknessEnabled = false;
      s.world.nextVisitorAt = now + 99 * 3_600_000;
      s.world.placedItems.push(placed('chair', 'armchair', 5, 1), placed('sofa', 'sofa', 1, 1));
      edit(s);
    }),
  );
  await page.goto('./');
  await canvasReady(page);
  await press(page, menu(page).getByRole('button', { name: /house/i }));
  await expect(page.getByTestId('game-canvas')).toHaveAttribute('data-scene', 'house');
}

/** Where a spot across the sofa is on the page (0 = its left end, 1 = its right end). */
async function sofaSpot(page: Page, across: number) {
  const r = tileRect('house', HOUSE_GRID, { x: 1, y: 1 }, { w: 2, h: 1 });
  return whereWorld(page, { x: r.x + r.w * across, y: r.y + r.h / 2 }, 0.3);
}

test.describe('the 3D avatar', () => {
  test.describe('with reduced motion', () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
    });

    test('tap the armchair: the avatar sits on it; tap the floor: it gets up', async ({ page }) => {
      await start(page);
      await tapAt(page, await whereIs(page, 'item', 'chair'));
      await expect.poll(async () => (await avatar(page)).sitting).toBe(true);
      expect((await avatar(page)).seat).toBe('chair:0');
      await tapAt(page, await whereWorld(page, { x: 400, y: 560 }));
      await expect.poll(async () => (await avatar(page)).sitting).toBe(false);
    });

    test('the sofa has two seats: the one nearer the tap', async ({ page }) => {
      await start(page);
      await tapAt(page, await sofaSpot(page, 0.2));
      await expect.poll(async () => (await avatar(page)).seat).toBe('sofa:0');
      await expect.poll(async () => (await avatar(page)).sitting).toBe(true);
      await tapAt(page, await sofaSpot(page, 0.8));
      await expect.poll(async () => (await avatar(page)).seat).toBe('sofa:1');
      await expect.poll(async () => (await avatar(page)).sitting).toBe(true);
    });

    test('moving the chair in Decorate mode gets the avatar up', async ({ page }) => {
      await start(page);
      await tapAt(page, await whereIs(page, 'item', 'chair'));
      await expect.poll(async () => (await avatar(page)).sitting).toBe(true);
      await press(page, menu(page).getByRole('button', { name: /decorate/i }));
      const bar = page.getByRole('region', { name: 'Decorate' });
      await tapAt(page, await whereIs(page, 'item', 'chair'));
      await press(page, bar.getByRole('button', { name: /turn/i }));
      await press(page, bar.getByRole('button', { name: /done/i }));
      await expect.poll(async () => (await avatar(page)).sitting).toBe(false);
    });
  });

  test('the avatar walks to a tap (with motion on)', async ({ page }) => {
    await start(page);
    const before = await avatar(page);
    await tapAt(page, await whereWorld(page, { x: 300, y: 600 }));
    await expect.poll(async () => (await avatar(page)).walking).toBe(true);
    await expect.poll(async () => (await avatar(page)).walking, { timeout: 5000 }).toBe(false);
    const after = await avatar(page);
    expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeGreaterThan(0.5);
  });

  test('nothing to sit on in the yard: tapping there just walks', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await start(page);
    await press(page, menu(page).getByRole('button', { name: /yard/i }));
    await tapAt(page, await whereWorld(page, { x: 640, y: 560 }));
    await expect.poll(async () => (await avatar(page)).zone).toBe('yard');
    expect((await avatar(page)).sitting).toBe(false);
  });
});
