import { expect, test, type Page } from '@playwright/test';
import {
  HOUSE_DOOR,
  INSIDE_DOOR,
  WORLD_WIDTH,
  tileRect,
  yardToWorld,
  zoneToWorld,
} from '../../src/game/layout';
import type { PlacedItem, SimState } from '../../src/sim/types';
import { buildSave, canvasReady, press, seedSave, testAnimal } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

const HOUSE_GRID = { cols: 8, rows: 6 };

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

/** World point -> page point. In Decorate mode the camera zooms to 0.8 around (640, 500). */
async function toPage(page: Page, p: { x: number; y: number }, decorating = false) {
  const box = (await page.locator('[data-testid="game-canvas"] canvas').boundingBox())!;
  const scale = box.width / WORLD_WIDTH;
  const c = decorating ? { x: (p.x + 160) * 0.8, y: p.y * 0.8 } : p;
  return { x: box.x + c.x * scale, y: box.y + c.y * scale };
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}

async function tapAt(page: Page, p: { x: number; y: number }) {
  await page.mouse.click(p.x, p.y);
}

const menu = (page: Page) => page.getByRole('navigation', { name: 'Menu' });
const decorateBar = (page: Page) => page.getByRole('region', { name: 'Decorate' });

test.describe('house and decorating', () => {
  test('toggle between the yard and the house', async ({ page }) => {
    await start(page);
    const canvas = page.getByTestId('game-canvas');
    await press(page, menu(page).getByRole('button', { name: /house/i }));
    await expect(canvas).toHaveAttribute('data-scene', 'house');
    await press(page, menu(page).getByRole('button', { name: /yard/i }));
    await expect(canvas).toHaveAttribute('data-scene', 'yard');
  });

  test('buy a pet bed, place it in Decorate mode', async ({ page }) => {
    await start(page);
    await press(page, menu(page).getByRole('button', { name: /store/i }));
    const store = page.getByRole('dialog', { name: 'Home Store' });
    await press(page, store.getByRole('tab', { name: /pet beds/i }));
    await press(page, store.getByRole('article', { name: 'Basic Bed' }).getByRole('button'));
    await expect(store.getByText('You got the Basic Bed!')).toBeVisible();
    await expect(page.getByTestId('coins')).toHaveText('940');
    await press(page, store.getByRole('button', { name: /place it now/i }));

    await expect(page.getByTestId('game-canvas')).toHaveAttribute('data-scene', 'house');
    const bar = decorateBar(page);
    await press(page, bar.getByRole('listitem', { name: /basic bed/i }));
    const tile = tileRect('house', HOUSE_GRID, { x: 2, y: 3 }, { w: 1, h: 1 });
    await tapAt(page, await toPage(page, { x: tile.x + tile.w / 2, y: tile.y + tile.h / 2 }, true));
    await expect(bar.getByTestId('house-stat')).toContainText('beds 1');
    await press(page, bar.getByRole('button', { name: /done/i }));
    await expect(bar).toBeHidden();
    await expect(page.getByTestId('indoor-count')).toHaveText(/0\/1/);
  });

  test('drag an animal to the door: in with a free bed, and back out', async ({ page }) => {
    const at = { x: 0.3, y: 0.5 };
    await start(page, (s, now) => {
      s.world.animals.push(testAnimal(now, { position: at, nextWanderAt: now + 3_600_000 }));
      s.world.placedItems.push(placed('b1', 'bed_basic', 'house', 0, 5));
    });
    const animal = yardToWorld(at);
    await drag(
      page,
      await toPage(page, { x: animal.x, y: animal.y - 20 }),
      await toPage(page, HOUSE_DOOR),
    );
    await expect(page.getByTestId('indoor-count')).toHaveText(/1\/1/);
  });

  test('with no bed, an animal can’t go inside', async ({ page }) => {
    const at = { x: 0.3, y: 0.5 };
    await start(page, (s, now) =>
      s.world.animals.push(testAnimal(now, { position: at, nextWanderAt: now + 3_600_000 })),
    );
    const animal = yardToWorld(at);
    await drag(
      page,
      await toPage(page, { x: animal.x, y: animal.y - 20 }),
      await toPage(page, HOUSE_DOOR),
    );
    await page.waitForTimeout(300);
    await expect(page.getByTestId('indoor-count')).toHaveText(/0\/0/);
  });

  test('an animal inside comes out when dragged to the doormat', async ({ page }) => {
    const at = { x: 0.5, y: 0.4 };
    await start(page, (s, now) => {
      s.world.animals.push(
        testAnimal(now, { zone: 'house', position: at, nextWanderAt: now + 3_600_000 }),
      );
      s.world.placedItems.push(placed('b1', 'bed_basic', 'house', 0, 5));
    });
    await expect(page.getByTestId('indoor-count')).toHaveText(/1\/1/);
    await press(page, menu(page).getByRole('button', { name: /house/i }));
    await page.waitForTimeout(300);
    const animal = zoneToWorld('house', at);
    await drag(
      page,
      await toPage(page, { x: animal.x, y: animal.y - 20 }),
      await toPage(page, INSIDE_DOOR),
    );
    await expect(page.getByTestId('indoor-count')).toHaveText(/0\/1/);
  });

  test('drag a lure from the tray into the yard: Lure Score goes up', async ({ page }) => {
    await start(page, (s) => (s.world.inventory = { carrot_patch: 1 }));
    await press(page, menu(page).getByRole('button', { name: /decorate/i }));
    const bar = decorateBar(page);
    await expect(bar.getByTestId('lure-stat')).toContainText('Lure 0 · slots 0/3');
    const item = bar.getByRole('listitem', { name: /carrot patch/i });
    const box = (await item.boundingBox())!;
    const tile = tileRect('yard', { cols: 12, rows: 5 }, { x: 6, y: 2 }, { w: 1, h: 1 });
    await drag(
      page,
      { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      await toPage(page, { x: tile.x + tile.w / 2, y: tile.y + tile.h / 2 }, true),
    );
    await expect(bar.getByTestId('lure-stat')).toContainText('Lure 4 · slots 1/3');
    await expect(bar.getByText('Nothing to place here.', { exact: false })).toBeVisible();
  });

  test('select a placed item to turn it or put it away', async ({ page }) => {
    await start(page, (s) => s.world.placedItems.push(placed('s1', 'sofa', 'house', 3, 2)));
    await press(page, menu(page).getByRole('button', { name: /house/i }));
    await press(page, menu(page).getByRole('button', { name: /decorate/i }));
    const bar = decorateBar(page);
    await expect(bar.getByTestId('house-stat')).toContainText('Cozy 12');
    const r = tileRect('house', HOUSE_GRID, { x: 3, y: 2 }, { w: 2, h: 1 });
    await tapAt(page, await toPage(page, { x: r.x + r.w / 2, y: r.y + r.h / 2 }, true));
    await expect(bar.getByText('Big Soft Sofa')).toBeVisible();
    await press(page, bar.getByRole('button', { name: /turn/i }));
    await expect(bar.getByRole('status')).toHaveCount(0);
    await press(page, bar.getByRole('button', { name: /put away/i }));
    await expect(bar.getByTestId('house-stat')).toContainText('Cozy 0');
    await expect(bar.getByRole('listitem', { name: /big soft sofa/i })).toBeVisible();
  });

  test('buy wallpaper and put it up', async ({ page }) => {
    await start(page);
    await press(page, menu(page).getByRole('button', { name: /store/i }));
    const store = page.getByRole('dialog', { name: 'Home Store' });
    await press(page, store.getByRole('tab', { name: /walls/i }));
    await press(page, store.getByRole('article', { name: 'Sky and Clouds' }).getByRole('button'));
    await expect(
      store.getByRole('article', { name: 'Sky and Clouds' }).getByText('Yours!'),
    ).toBeVisible();
    await press(page, store.getByRole('button', { name: /use it now/i }));
    const bar = decorateBar(page);
    await press(page, bar.getByRole('tab', { name: /walls/i }));
    const sky = bar.getByRole('listitem').filter({ hasText: 'Sky and Clouds' });
    await press(page, sky);
    await expect(sky).toHaveAttribute('aria-pressed', 'true');
    await expect(bar.getByTestId('house-stat')).toContainText('Cozy 8');
  });

  test('the house layout survives a reload', async ({ page }) => {
    await start(page, (s) => (s.world.inventory = { armchair: 1 }));
    await press(page, menu(page).getByRole('button', { name: /house/i }));
    await press(page, menu(page).getByRole('button', { name: /decorate/i }));
    const bar = decorateBar(page);
    await press(page, bar.getByRole('listitem', { name: /armchair/i }));
    const tile = tileRect('house', HOUSE_GRID, { x: 5, y: 4 }, { w: 1, h: 1 });
    await tapAt(page, await toPage(page, { x: tile.x + tile.w / 2, y: tile.y + tile.h / 2 }, true));
    await expect(bar.getByTestId('house-stat')).toContainText('Cozy 6');
    await page.waitForTimeout(300); // Placing saves right away.
    await page.reload();
    await canvasReady(page);
    await press(page, menu(page).getByRole('button', { name: /house/i }));
    await press(page, menu(page).getByRole('button', { name: /decorate/i }));
    await expect(decorateBar(page).getByTestId('house-stat')).toContainText('Cozy 6');
  });
});
