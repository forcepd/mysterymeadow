import { expect, test, type Page } from '@playwright/test';
import type {} from '../../src/world3d/testHooks';
import { buildSave, canvasReady, press, seedSave, testAnimal, testVisitor } from './helpers';

/** Phase 3D-0: the Three.js world behind `?3d`, its camera, and tapping things in it. */

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

const canvas = (page: Page) => page.locator('[data-testid="game-canvas"] canvas');

/** Where an animal or visitor is on the page right now (the camera can move). */
async function whereIs(page: Page, kind: 'animal' | 'visitor', id: string) {
  const p = await page.evaluate(([k, i]) => window.meadow3d!.projectObject(k, i), [kind, id] as [
    'animal' | 'visitor',
    string,
  ]);
  expect(p, `${kind} ${id} is on screen`).not.toBeNull();
  return p!;
}

/** Taps a page point on the canvas (touch on iPads, mouse on desktop). */
async function tapAt(page: Page, at: { x: number; y: number }) {
  const box = (await canvas(page).boundingBox())!;
  await press(page, canvas(page), { position: { x: at.x - box.x, y: at.y - box.y } });
}

/** Drags across the canvas with the mouse, in steps (pointer events on every device). */
async function drag(page: Page, from: { x: number; y: number }, by: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(from.x + (by.x * i) / 10, from.y + (by.y * i) / 10);
  }
  await page.mouse.up();
}

const view = (page: Page) => page.evaluate(() => window.meadow3d!.view());

/** Empty grass in the middle of the yard, below the fence and between the animals. */
async function emptyGround(page: Page) {
  return (await page.evaluate(() => window.meadow3d!.projectWorld({ x: 330, y: 620 })))!;
}

async function open3D(page: Page) {
  await seedSave(
    page,
    buildSave((s, now) => {
      s.world.animals.push(testAnimal(now, { id: 'a1', position: { x: 0.7, y: 0.4 } }));
      s.world.animals.push(
        testAnimal(now, { id: 'a2', zone: 'house', speciesId: 'kitten', variantId: 'orange' }),
      );
      s.world.gateQueue.push(testVisitor(now));
    }),
  );
  await page.goto('./?3d');
  await canvasReady(page);
}

test.describe('3D world (?3d)', () => {
  test('is used with ?3d; the original world is used (and Three.js not loaded) without', async ({
    page,
  }) => {
    const scripts: string[] = [];
    page.on('request', (r) => {
      if (r.resourceType() === 'script') scripts.push(r.url());
    });
    await seedSave(
      page,
      buildSave(() => {}),
    );
    await page.goto('./');
    await canvasReady(page);
    await expect(page.getByTestId('game-canvas')).not.toHaveAttribute('data-renderer', '3d');
    expect(scripts.some((u) => u.includes('GameCanvas3D'))).toBe(false);

    await page.goto('./?3d');
    await canvasReady(page);
    await expect(page.getByTestId('game-canvas')).toHaveAttribute('data-renderer', '3d');
    await expect(page.getByTestId('reset-view')).toBeHidden();
  });

  test('tapping an animal opens its card; tapping empty ground closes it', async ({ page }) => {
    await open3D(page);
    await tapAt(page, await whereIs(page, 'animal', 'a1'));
    const card = page.getByRole('complementary', { name: /bunny card/i });
    await expect(card).toBeVisible();
    await tapAt(page, await emptyGround(page));
    await expect(card).toBeHidden();
    // Neither tap moved the camera.
    expect((await view(page)).atHome).toBe(true);
  });

  test('tapping the mystery visitor reveals it and it comes in', async ({ page }) => {
    await open3D(page);
    await expect(page.getByTestId('capacity')).toHaveText('🐾2/6');
    await tapAt(page, await whereIs(page, 'visitor', 'v900'));
    await expect(page.getByTestId('capacity')).toHaveText('🐾3/6');
  });

  test('dragging empty ground orbits; the reset button brings the view back', async ({ page }) => {
    await open3D(page);
    const reset = page.getByTestId('reset-view');
    await expect(reset).toBeHidden();
    await drag(page, await emptyGround(page), { x: 220, y: -60 });
    const moved = await view(page);
    expect(moved.atHome).toBe(false);
    expect(Math.abs(moved.azimuth)).toBeGreaterThan(0.3);
    await expect(reset).toBeVisible();

    // Taps still find the animal from the new angle.
    await tapAt(page, await whereIs(page, 'animal', 'a1'));
    const card = page.getByRole('complementary', { name: /bunny card/i });
    await expect(card).toBeVisible();
    // (Empty ground may be under the menu from this angle: close with the ✕.)
    await press(page, card.getByRole('button', { name: 'Close' }));

    await press(page, reset);
    await expect(reset).toBeHidden();
    expect((await view(page)).atHome).toBe(true);
  });

  test('a drag that starts on an animal does not move the camera', async ({ page }) => {
    await open3D(page);
    await drag(page, await whereIs(page, 'animal', 'a1'), { x: 200, y: 0 });
    expect((await view(page)).atHome).toBe(true);
    // ...and isn't a tap either.
    await expect(page.getByRole('complementary', { name: /bunny card/i })).toBeHidden();
  });

  test('the mouse wheel zooms', async ({ page, isMobile }) => {
    test.skip(isMobile, 'no mouse wheel on iPads');
    await open3D(page);
    const at = await emptyGround(page);
    await page.mouse.move(at.x, at.y);
    await page.mouse.wheel(0, -400);
    await expect.poll(async () => (await view(page)).zoom).toBeLessThan(1);
    await expect(page.getByTestId('reset-view')).toBeVisible();
  });

  test('the House button shows the room, with its animals tappable', async ({ page }) => {
    await open3D(page);
    await press(page, page.getByRole('button', { name: /House/ }));
    await expect(page.getByTestId('game-canvas')).toHaveAttribute('data-scene', 'house');
    expect(await page.evaluate(() => window.meadow3d!.projectObject('animal', 'a1'))).toBeNull();
    await tapAt(page, await whereIs(page, 'animal', 'a2'));
    await expect(page.getByRole('complementary', { name: /kitten card/i })).toBeVisible();
    await press(page, page.getByRole('button', { name: /Yard/ }));
    await expect(page.getByTestId('game-canvas')).toHaveAttribute('data-scene', 'yard');
  });

  test('canvas taps count as world taps, and buttons do not fall through', async ({ page }) => {
    await open3D(page);
    const host = page.getByTestId('game-canvas');
    await tapAt(page, await emptyGround(page));
    await expect(host).toHaveAttribute('data-canvas-taps', '1');
    await press(page, page.getByRole('button', { name: /Dex/ }));
    await expect(host).toHaveAttribute('data-canvas-taps', '1');
  });
});
