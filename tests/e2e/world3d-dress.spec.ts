import { expect, test, type Page } from '@playwright/test';
import { SPECIES } from '../../src/config/species';
import type { SimState } from '../../src/sim/types';
import { buildSave, canvasReady, press, seedSave, testAnimal } from './helpers';
import { tapAt, whereIs } from './helpers3d';

/** Phase 3D-5: pet outfits, the 3D avatar, and 3D portraits in the menus. */

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

async function start(page: Page, url: string, edit: (s: SimState, now: number) => void) {
  await seedSave(
    page,
    buildSave((s, now) => {
      s.world.settings.sicknessEnabled = false;
      s.world.coins = 100;
      edit(s, now);
    }),
  );
  await page.goto(url);
  await canvasReady(page);
}

const portraitSrc = (card: ReturnType<Page['getByRole']>) =>
  card.locator('img').first().getAttribute('src');

test.describe('3D dress-up and portraits', () => {
  test('menus show 3D portraits in 3D, and the original pictures with ?2d', async ({ page }) => {
    await start(page, './', (s, now) => s.world.animals.push(testAnimal(now, { id: 'a1' })));
    await tapAt(page, await whereIs(page, 'animal', 'a1'));
    const card = page.getByRole('complementary', { name: /bunny card/i });
    await expect(card).toBeVisible();
    expect(await portraitSrc(card)).toMatch(/^data:image\/png/);
    // The HUD's avatar too.
    const me = page.getByRole('button', { name: /my style/i }).locator('img');
    expect(await me.getAttribute('src')).toMatch(/^data:image\/png/);

    await page.goto('./?2d');
    await canvasReady(page);
    const me2 = page.getByRole('button', { name: /my style/i }).locator('img');
    expect(await me2.getAttribute('src')).toMatch(/^data:image\/svg/);
  });

  test('dress a pet in the wardrobe: its portrait changes to show the outfit', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await start(page, './', (s, now) => {
      s.world.animals.push(testAnimal(now, { id: 'a1' }));
      s.world.inventory = { party_hat: 1 };
    });
    await tapAt(page, await whereIs(page, 'animal', 'a1'));
    const card = page.getByRole('complementary', { name: /bunny card/i });
    const before = await portraitSrc(card);
    await press(page, card.getByRole('button', { name: /dress/i }));
    const wardrobe = page.getByRole('dialog', { name: 'Pet wardrobe' });
    await press(
      page,
      wardrobe.getByRole('region', { name: 'Head' }).getByRole('button', { name: /party hat/i }),
    );
    await expect(wardrobe.getByLabel('Wearing')).toContainText('Party Hat');
    await press(page, wardrobe.getByRole('button', { name: 'Close' }));
    await tapAt(page, await whereIs(page, 'animal', 'a1'));
    await expect(card).toBeVisible();
    await expect.poll(() => portraitSrc(card)).not.toBe(before);
    expect(errors).toEqual([]);
  });

  test('every species wears every kind of outfit in 3D without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const outfits = [
      { head: 'party_hat', body: 'hero_cape', face: 'star_shades' },
      { head: 'pet_crown', body: 'cozy_sweater', face: 'bandana' },
      { head: 'big_bow', body: 'pet_tutu', face: 'round_specs' },
      { head: 'flower_clip', body: 'warm_scarf', face: 'round_specs' },
    ];
    await start(page, './', (s, now) =>
      SPECIES.forEach((sp, i) =>
        s.world.animals.push(
          testAnimal(now, {
            id: `s${i}`,
            speciesId: sp.id,
            variantId: sp.variants[0]!.id,
            position: { x: (i % 7) / 6.4 + 0.02, y: Math.floor(i / 7) / 2.2 + 0.05 },
            outfit: outfits[i % outfits.length]!,
          }),
        ),
      ),
    );
    await page.waitForTimeout(500);
    expect(errors).toEqual([]);
    const stats = await page.evaluate(() => window.meadow3d!.stats());
    expect(stats.triangles).toBeLessThan(350_000);
  });

  test('the Dex shows 3D shapes for animals not found yet', async ({ page }) => {
    await start(page, './', () => {});
    await press(page, page.getByRole('button', { name: /dex/i }));
    const dex = page.getByRole('dialog', { name: /dex/i });
    await expect(dex).toBeVisible();
    const img = dex.locator('img').first();
    expect(await img.getAttribute('src')).toMatch(/^data:image\/png/);
  });
});
