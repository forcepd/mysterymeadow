import { expect, test, type Page } from '@playwright/test';
import type {} from '../../src/world3d/testHooks';
import { SPECIES } from '../../src/config/species';
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
    // Only this zone's labels show.
    const world = page.getByTestId('game-canvas');
    await expect(world.getByText('Kitten', { exact: true })).toBeVisible();
    await expect(world.getByText('Bunny', { exact: true })).toBeHidden();
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

  test('scenery never takes taps: an animal by the house and fence, and from a low angle', async ({
    page,
  }) => {
    await seedSave(
      page,
      buildSave((s, now) => {
        s.world.house.tierId = 'manor';
        // Top-left corner of the yard: right below the house and the fence.
        s.world.animals.push(testAnimal(now, { id: 'a1', position: { x: 0.08, y: 0 } }));
      }),
    );
    await page.goto('./?3d');
    await canvasReady(page);
    const card = page.getByRole('complementary', { name: /bunny card/i });
    await tapAt(page, await whereIs(page, 'animal', 'a1'));
    await expect(card).toBeVisible();
    await press(page, card.getByRole('button', { name: 'Close' }));

    // Swing around to the lowest angle, looking past trees and fence at the yard.
    await drag(page, await emptyGround(page), { x: 150, y: -400 });
    expect((await view(page)).polar).toBeGreaterThan(1.3);
    await tapAt(page, await whereIs(page, 'animal', 'a1'));
    await expect(card).toBeVisible();
  });

  test('a full yard stays within the iPad drawing budget', async ({ page }) => {
    await seedSave(
      page,
      buildSave((s, now) => {
        s.world.house.tierId = 'manor';
        for (let i = 0; i < 16; i++) {
          s.world.animals.push(
            testAnimal(now, { id: `a${i}`, position: { x: (i % 4) / 4 + 0.1, y: (i >> 2) / 4 } }),
          );
        }
      }),
    );
    await page.goto('./?3d');
    await canvasReady(page);
    const stats = await page.evaluate(() => window.meadow3d!.stats());
    expect(stats.calls).toBeLessThan(150);
    expect(stats.triangles).toBeLessThan(300_000);
  });

  test('every species shows up in 3D, with its name under it', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await seedSave(
      page,
      buildSave((s, now) => {
        SPECIES.forEach((sp, i) => {
          s.world.animals.push(
            testAnimal(now, {
              id: `s${i}`,
              speciesId: sp.id,
              variantId: sp.variants[i % sp.variants.length]!.id,
              rarity: sp.rarity,
              isSparkle: i % 5 === 0,
              position: { x: (i % 7) / 6.4 + 0.02, y: Math.floor(i / 7) / 2.2 + 0.05 },
            }),
          );
        });
      }),
    );
    await page.goto('./?3d');
    await canvasReady(page);
    const world = page.getByTestId('game-canvas');
    for (const [i, sp] of SPECIES.entries()) {
      await whereIs(page, 'animal', `s${i}`);
      await expect(world.getByText(sp.name, { exact: true })).toBeVisible();
    }
    expect(errors).toEqual([]);
  });

  test('badges float over animals, and labels never block taps', async ({ page }) => {
    await seedSave(
      page,
      buildSave((s, now) => {
        s.world.animals.push(testAnimal(now, { id: 'a1', name: 'Biscuit' }));
      }),
    );
    await page.goto('./?3d');
    await canvasReady(page);
    const world = page.getByTestId('game-canvas');
    const name = world.getByText('Biscuit', { exact: true });
    await expect(name).toBeVisible();
    // Ready to sell: the coin badge.
    await expect(world.getByText('🪙')).toBeVisible();
    // Tapping right on the name label still reaches the animal.
    const box = (await name.boundingBox())!;
    await tapAt(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
    await expect(page.getByRole('complementary', { name: /biscuit card/i })).toBeVisible();
  });

  test('a mystery visitor shows "?", then its name and stars, and "No room!" in a full yard', async ({
    page,
  }) => {
    await seedSave(
      page,
      buildSave((s, now) => {
        for (let i = 0; i < 6; i++) {
          s.world.animals.push(testAnimal(now, { id: `a${i}`, position: { x: i / 6, y: 0.8 } }));
        }
        s.world.gateQueue.push(testVisitor(now));
      }),
    );
    await page.goto('./?3d');
    await canvasReady(page);
    const world = page.getByTestId('game-canvas');
    await expect(world.getByText('?', { exact: true })).toBeVisible();
    await tapAt(page, await whereIs(page, 'visitor', 'v900'));
    await expect(world.getByText('No room!')).toBeVisible();
    await expect(world.getByText(/Fox\s+★★/)).toBeVisible();
    await expect(world.getByText('?', { exact: true })).toBeHidden();
    await expect(page.getByTestId('capacity')).toHaveText('🐾6/6');
  });

  test('a sold animal says goodbye and leaves the yard', async ({ page }) => {
    await seedSave(
      page,
      buildSave((s, now) => s.world.animals.push(testAnimal(now, { id: 'a1' }))),
    );
    await page.goto('./?3d');
    await canvasReady(page);
    await tapAt(page, await whereIs(page, 'animal', 'a1'));
    const card = page.getByRole('complementary', { name: /bunny card/i });
    await press(page, card.getByRole('button', { name: /sell for 20/i }));
    await expect(page.getByTestId('coins')).toHaveText('120');
    await expect
      .poll(() => page.evaluate(() => window.meadow3d!.projectObject('animal', 'a1')))
      .toBeNull();
    await expect(page.getByTestId('game-canvas').getByText('Bunny', { exact: true })).toBeHidden();
  });
});
