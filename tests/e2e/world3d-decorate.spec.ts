import { expect, test, type Page } from '@playwright/test';
import { ROOM, tileRect } from '../../src/game/layout';
import type { PlacedItem, SimState } from '../../src/sim/types';
import { ITEMS, isPlaceable } from '../../src/config/items';
import { wallStripToWall } from '../../src/world3d/coords';
import { buildSave, canvasReady, press, seedSave, testAnimal } from './helpers';
import { tapAt, view, whereIs, whereWorld } from './helpers3d';

/** Phase 3D-4: the 3D room and Decorate mode, the original's decorate flows. */

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

const HOUSE_GRID = { cols: 8, rows: 6 };
const YARD_GRID = { cols: 12, rows: 5 };
const menu = (page: Page) => page.getByRole('navigation', { name: 'Menu' });
const decorateBar = (page: Page) => page.getByRole('region', { name: 'Decorate' });

function placed(
  id: string,
  itemId: string,
  zone: 'yard' | 'house',
  x: number,
  y: number,
): PlacedItem {
  return { id, itemId, zone, tile: { x, y }, rotation: 0 };
}

async function start(page: Page, edit: (s: SimState, now: number) => void = () => {}) {
  await seedSave(
    page,
    buildSave((s, now) => {
      s.world.settings.sicknessEnabled = false;
      s.world.nextVisitorAt = now + 99 * 3_600_000;
      s.world.coins = 1000;
      edit(s, now);
    }),
  );
  await page.goto('./');
  await canvasReady(page);
}

/** Where the middle of a floor tile is on the page now. */
async function tileOnPage(
  page: Page,
  zone: 'yard' | 'house',
  tile: { x: number; y: number },
  size = { w: 1, h: 1 },
) {
  const r = tileRect(zone, zone === 'yard' ? YARD_GRID : HOUSE_GRID, tile, size);
  return whereWorld(page, { x: r.x + r.w / 2, y: r.y + r.h / 2 });
}

async function dragPage(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}

test.describe('3D house and decorating', () => {
  test('buy a pet bed and place it with a tap', async ({ page }) => {
    await start(page);
    await press(page, menu(page).getByRole('button', { name: /store/i }));
    const store = page.getByRole('dialog', { name: 'Home Store' });
    await press(page, store.getByRole('tab', { name: /pet beds/i }));
    await press(page, store.getByRole('article', { name: 'Basic Bed' }).getByRole('button'));
    await press(page, store.getByRole('button', { name: /place it now/i }));
    await expect(page.getByTestId('game-canvas')).toHaveAttribute('data-scene', 'house');
    const bar = decorateBar(page);
    await press(page, bar.getByRole('listitem', { name: /basic bed/i }));
    await tapAt(page, await tileOnPage(page, 'house', { x: 2, y: 3 }));
    await expect(bar.getByTestId('house-stat')).toContainText('beds 1');
    await press(page, bar.getByRole('button', { name: /done/i }));
    await expect(bar).toBeHidden();
    await expect(page.getByTestId('indoor-count')).toHaveText(/0\/1/);
    // Back to the normal view after decorating.
    await expect.poll(async () => (await view(page)).atHome).toBe(true);
  });

  test('drag a lure from the tray into the yard: Lure Score goes up', async ({ page }) => {
    await start(page, (s) => (s.world.inventory = { carrot_patch: 1 }));
    await press(page, menu(page).getByRole('button', { name: /decorate/i }));
    const bar = decorateBar(page);
    await expect(bar.getByTestId('lure-stat')).toContainText('Lure 0 · slots 0/3');
    const item = bar.getByRole('listitem', { name: /carrot patch/i });
    const box = (await item.boundingBox())!;
    await dragPage(
      page,
      { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      await tileOnPage(page, 'yard', { x: 6, y: 2 }),
    );
    await expect(bar.getByTestId('lure-stat')).toContainText('Lure 4 · slots 1/3');
  });

  test('select a placed item to turn it or put it away', async ({ page }) => {
    await start(page, (s) => s.world.placedItems.push(placed('s1', 'sofa', 'house', 3, 2)));
    await press(page, menu(page).getByRole('button', { name: /house/i }));
    await press(page, menu(page).getByRole('button', { name: /decorate/i }));
    const bar = decorateBar(page);
    await expect(bar.getByTestId('house-stat')).toContainText('Cozy 12');
    await tapAt(page, await whereIs(page, 'item', 's1'));
    await expect(bar.getByText('Big Soft Sofa')).toBeVisible();
    await press(page, bar.getByRole('button', { name: /turn/i }));
    await expect(bar.getByRole('status')).toHaveCount(0);
    await press(page, bar.getByRole('button', { name: /put away/i }));
    await expect(bar.getByTestId('house-stat')).toContainText('Cozy 0');
    await expect(bar.getByRole('listitem', { name: /big soft sofa/i })).toBeVisible();
  });

  test('drag a placed item to move it', async ({ page }) => {
    await start(page, (s) => s.world.placedItems.push(placed('t1', 'side_table', 'house', 1, 1)));
    await press(page, menu(page).getByRole('button', { name: /house/i }));
    await press(page, menu(page).getByRole('button', { name: /decorate/i }));
    const from = await whereIs(page, 'item', 't1');
    const to = await tileOnPage(page, 'house', { x: 5, y: 3 });
    await dragPage(page, from, to);
    await expect
      .poll(async () => {
        const now = await whereIs(page, 'item', 't1');
        return Math.hypot(now.x - to.x, now.y - to.y);
      })
      .toBeLessThan(40);
    await expect(decorateBar(page).getByTestId('house-stat')).toContainText('Cozy 3');
  });

  test('hang a picture on the back wall', async ({ page }) => {
    await start(page, (s) => (s.world.inventory = { sun_picture: 1 }));
    await press(page, menu(page).getByRole('button', { name: /house/i }));
    await press(page, menu(page).getByRole('button', { name: /decorate/i }));
    const bar = decorateBar(page);
    await press(page, bar.getByRole('listitem', { name: /sunshine picture/i }));
    const r = tileRect('house', HOUSE_GRID, { x: 3, y: 0 }, { w: 1, h: 1 }, true);
    const middle = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
    const onWall = wallStripToWall(middle);
    await tapAt(page, await whereWorld(page, { x: middle.x, y: ROOM.wallBottom }, onWall.y));
    await expect(bar.getByTestId('house-stat')).toContainText('Cozy 4');
  });

  test('while decorating, animals and finds are out of the way', async ({ page }) => {
    await start(page, (s, now) => {
      s.world.animals.push(testAnimal(now, { id: 'a1', position: { x: 0.5, y: 0.6 } }));
      s.world.finds.push({
        id: 'f1',
        kind: 'coin',
        position: { x: 0.3, y: 0.3 },
        expiresAt: now + 600_000,
      });
    });
    await press(page, menu(page).getByRole('button', { name: /decorate/i }));
    await expect(decorateBar(page)).toBeVisible();
    expect(await page.evaluate(() => window.meadow3d!.projectObject('animal', 'a1'))).toBeNull();
    expect(await page.evaluate(() => window.meadow3d!.projectObject('find', 'f1'))).toBeNull();
    await press(page, decorateBar(page).getByRole('button', { name: /done/i }));
    await tapAt(page, await whereIs(page, 'animal', 'a1'));
    await expect(page.getByRole('complementary', { name: /bunny card/i })).toBeVisible();
  });

  test('the house layout survives a reload', async ({ page }) => {
    await start(page, (s) => (s.world.inventory = { armchair: 1 }));
    await press(page, menu(page).getByRole('button', { name: /house/i }));
    await press(page, menu(page).getByRole('button', { name: /decorate/i }));
    const bar = decorateBar(page);
    await press(page, bar.getByRole('listitem', { name: /armchair/i }));
    await tapAt(page, await tileOnPage(page, 'house', { x: 5, y: 4 }));
    await expect(bar.getByTestId('house-stat')).toContainText('Cozy 6');
    await page.waitForTimeout(300); // Placing saves right away.
    await page.reload();
    await canvasReady(page);
    await press(page, menu(page).getByRole('button', { name: /house/i }));
    await press(page, menu(page).getByRole('button', { name: /decorate/i }));
    await expect(decorateBar(page).getByTestId('house-stat')).toContainText('Cozy 6');
  });

  test('a furnished Manor room with ten animals stays within the iPad drawing budget', async ({
    page,
  }) => {
    await start(page, (s, now) => {
      s.world.house.tierId = 'manor';
      let x = 0;
      let y = 0;
      let n = 0;
      for (const def of ITEMS) {
        if (!isPlaceable(def) || def.category === 'lure' || def.category === 'bowl') continue;
        const wall = def.category === 'furniture' && def.layer === 'wall';
        s.world.placedItems.push(
          placed(`i${n++}`, def.id, 'house', wall ? n % 12 : x, wall ? 0 : y),
        );
        if (!wall) {
          x += 3;
          if (x > 11) {
            x = 0;
            y += 3;
          }
        }
      }
      for (let i = 0; i < 10; i++) {
        s.world.animals.push(
          testAnimal(now, {
            id: `a${i}`,
            zone: 'house',
            position: { x: (i % 5) / 5 + 0.1, y: 0.3 },
          }),
        );
      }
    });
    await press(page, menu(page).getByRole('button', { name: /house/i }));
    await expect(page.getByTestId('game-canvas')).toHaveAttribute('data-scene', 'house');
    await page.waitForTimeout(300);
    const stats = await page.evaluate(() => window.meadow3d!.stats());
    expect(stats.calls).toBeLessThan(150);
    expect(stats.triangles).toBeLessThan(300_000);
  });
});
