import { expect, test } from '@playwright/test';
import {
  animalTapPoint,
  buildSave,
  canvasReady,
  openGame,
  press,
  seedSave,
  tapWorld,
  testAnimal,
} from './helpers';

test.describe('foundation', () => {
  test('loads the world canvas with the HUD layered on top', async ({ page }) => {
    await openGame(page);
    await expect(page.getByLabel('100 coins')).toBeVisible();
    await expect(page.getByLabel('50 gems')).toBeVisible();
    await expect(page.getByTestId('rotate-screen')).toBeHidden();
  });

  test('a tap on the canvas reaches the world, and UI taps do not fall through', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await seedSave(
      page,
      buildSave((s, now) => s.world.animals.push(testAnimal(now))),
    );
    await page.goto('./');
    await canvasReady(page);
    const host = page.getByTestId('game-canvas');
    await tapWorld(page, animalTapPoint({ x: 0.5, y: 0.5 }));
    await expect(host).toHaveAttribute('data-canvas-taps', '1');
    const card = page.getByRole('complementary', { name: /bunny card/i });
    await expect(card).toBeVisible();
    // The close button sits over the canvas; tapping it must not count as a world tap.
    await press(page, card.getByRole('button', { name: 'Close' }));
    await expect(card).toBeHidden();
    await expect(host).toHaveAttribute('data-canvas-taps', '1');
  });

  test('interactive elements meet the 48x48 touch target minimum', async ({ page }) => {
    await openGame(page);
    const targets = page.locator('button, a');
    const count = await targets.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const box = (await targets.nth(i).boundingBox())!;
      expect(box.width, `target ${i} width`).toBeGreaterThanOrEqual(48);
      expect(box.height, `target ${i} height`).toBeGreaterThanOrEqual(48);
    }
  });

  test('portrait shows the rotate screen', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('./');
    await expect(page.getByTestId('rotate-screen')).toBeVisible();
    await expect(page.getByText(/turn your screen sideways/i)).toBeVisible();
    await page.setViewportSize({ width: 1024, height: 768 });
    await expect(page.getByTestId('rotate-screen')).toBeHidden();
  });

  test('has the iPad viewport and touch settings', async ({ page }) => {
    await openGame(page);
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
      'content',
      'width=device-width, initial-scale=1, viewport-fit=cover',
    );
    const touchAction = await page
      .locator('[data-testid="game-canvas"] canvas')
      .evaluate((el) => getComputedStyle(el).touchAction);
    expect(touchAction).toBe('none');
  });

  test('makes no requests to other origins', async ({ page, baseURL }) => {
    const origin = new URL(baseURL!).origin;
    const external: string[] = [];
    page.on('request', (req) => {
      const url = new URL(req.url());
      if (url.protocol.startsWith('http') && url.origin !== origin) external.push(req.url());
    });
    await openGame(page);
    await page.goto('./privacy.html');
    await page.waitForLoadState('networkidle');
    expect(external).toEqual([]);
  });

  test('uses the self-hosted font', async ({ page }) => {
    await openGame(page);
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.fonts.check('800 20px Nunito'))).toBe(true);
  });

  test('serves an installable landscape web app manifest', async ({ page, request }) => {
    await page.goto('./');
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href).toBeTruthy();
    const res = await request.get(new URL(href!, page.url()).toString());
    expect(res.ok()).toBe(true);
    const manifest = await res.json();
    expect(manifest.display).toBe('standalone');
    expect(manifest.orientation).toBe('landscape');
    const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', /.png$/);
  });

  test('registers a service worker for offline play', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'Playwright WebKit does not expose service workers.');
    await page.goto('./');
    const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
    expect(scope).toContain(new URL(page.url()).origin);
  });

  test('has a privacy page linked from the game', async ({ page }) => {
    await openGame(page);
    await press(page, page.getByRole('link', { name: 'Privacy' }));
    await expect(page).toHaveURL(/privacy\.html$/);
    await expect(
      page.getByText(
        "This game stores everything on your device. We don't collect any information.",
      ),
    ).toBeVisible();
  });
});
