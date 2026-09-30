import { expect, test, type Page } from '@playwright/test';
import { HOUSE_DOOR, INSIDE_DOOR } from '../../src/game/layout';
import type { PlacedItem, SimState } from '../../src/sim/types';
import { buildSave, canvasReady, press, seedSave, testAnimal, testVisitor } from './helpers';
import { drag, holdAt, tapAt, whereIs, whereWorld } from './helpers3d';

/** Phase 3D-3: care and effects in the 3D world (`?3d`). */

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

const world = (page: Page) => page.getByTestId('game-canvas');

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
      edit(s, now);
    }),
  );
  await page.goto('./?3d');
  await canvasReady(page);
}

const bowlId = (s: SimState) => s.world.placedItems.find((p) => p.itemId === 'food_bowl')!.id;

test.describe('3D care and effects', () => {
  test('an empty bowl shows "!", and a tap fills it; a full bowl says "Full!"', async ({
    page,
  }) => {
    let id = '';
    await start(page, (s) => {
      id = bowlId(s);
      s.world.placedItems.find((p) => p.id === id)!.servings = 0;
    });
    await expect(world(page).getByText('!', { exact: true })).toBeVisible();
    await tapAt(page, await whereIs(page, 'bowl', id));
    await expect(world(page).getByText('!', { exact: true })).toBeHidden();
    await tapAt(page, await whereIs(page, 'bowl', id));
    await expect(world(page).getByText('Full!')).toBeVisible();
  });

  test('tapping poop cleans it up', async ({ page }) => {
    await start(page, (s) => {
      s.world.poops.push({ id: 'p1', zone: 'yard', position: { x: 0.4, y: 0.6 } } as never);
    });
    await tapAt(page, await whereIs(page, 'poop', 'p1'));
    await expect
      .poll(() => page.evaluate(() => window.meadow3d!.projectObject('poop', 'p1')))
      .toBeNull();
  });

  test('poop right under its animal: tapping the poop cleans it, tapping the animal opens its card', async ({
    page,
  }) => {
    // Poop lands where the animal stands, so their tap areas overlap.
    await start(page, (s, now) => {
      s.world.animals.push(testAnimal(now, { id: 'a1', position: { x: 0.4, y: 0.6 } }));
      s.world.poops.push(
        { id: 'p1', zone: 'yard', position: { x: 0.4, y: 0.6 } } as never,
        { id: 'p2', zone: 'yard', position: { x: 0.4, y: 0.6 } } as never,
      );
    });
    await tapAt(page, await whereIs(page, 'poop', 'p1'));
    await expect
      .poll(() => page.evaluate(() => window.meadow3d!.projectObject('poop', 'p1')))
      .toBeNull();
    await expect(page.getByRole('complementary', { name: /bunny card/i })).toBeHidden();
    // p2 is still there under it; the animal's own middle picks the animal.
    await tapAt(page, await whereIs(page, 'animal', 'a1'));
    await expect(page.getByRole('complementary', { name: /bunny card/i })).toBeVisible();
    expect(await page.evaluate(() => window.meadow3d!.projectObject('poop', 'p2'))).not.toBeNull();
  });

  test('tapping a coin in the yard adds coins, and coins fly to the counter', async ({ page }) => {
    await start(page, (s, now) => {
      s.world.finds.push({
        id: 'f1',
        kind: 'coin',
        position: { x: 0.5, y: 0.4 },
        expiresAt: now + 600_000,
      });
    });
    await expect(page.getByTestId('coins')).toHaveText('100');
    // Flying coins are brief: note any that appear, whenever they do.
    await page.evaluate(() => {
      const w = window as unknown as { coinsFlew: number };
      w.coinsFlew = 0;
      new MutationObserver((changes) => {
        for (const c of changes) {
          for (const n of c.addedNodes) {
            if (n instanceof HTMLElement && n.dataset.fx === 'coin') w.coinsFlew++;
          }
        }
      }).observe(document.body, { childList: true, subtree: true });
    });
    await tapAt(page, await whereIs(page, 'find', 'f1'));
    await expect(page.getByTestId('coins')).toHaveText('103');
    await expect(world(page).getByText('+3 🪙')).toBeVisible();
    expect(
      await page.evaluate(() => (window as unknown as { coinsFlew: number }).coinsFlew),
    ).toBeGreaterThan(0);
  });

  test('holding an animal pets it (hearts), and again right away it "Loved that!"', async ({
    page,
  }) => {
    await start(page, (s, now) => s.world.animals.push(testAnimal(now, { id: 'a1' })));
    await holdAt(page, await whereIs(page, 'animal', 'a1'));
    expect(await page.evaluate(() => window.meadow3d!.particles())).toBeGreaterThan(0);
    // A hold isn't a tap: no card.
    await expect(page.getByRole('complementary', { name: /bunny card/i })).toBeHidden();
    await holdAt(page, await whereIs(page, 'animal', 'a1'));
    await expect(world(page).getByText('💕 Loved that!')).toBeVisible();
  });

  test('drag an animal to the door: in with a free bed, and back out from the doormat', async ({
    page,
  }) => {
    await start(page, (s, now) => {
      s.world.animals.push(testAnimal(now, { id: 'a1', position: { x: 0.3, y: 0.5 } }));
      s.world.placedItems.push(placed('b1', 'bed_basic', 'house', 0, 5));
    });
    await expect(page.getByTestId('indoor-count')).toHaveText(/0\/1/);
    const from = await whereIs(page, 'animal', 'a1');
    const door = await whereWorld(page, HOUSE_DOOR);
    await drag(page, from, { x: door.x - from.x, y: door.y - from.y });
    await expect(page.getByTestId('indoor-count')).toHaveText(/1\/1/);
    await expect
      .poll(() => page.evaluate(() => window.meadow3d!.projectObject('animal', 'a1')))
      .toBeNull();

    await press(page, page.getByRole('button', { name: /House/ }));
    await expect(world(page)).toHaveAttribute('data-scene', 'house');
    const inside = await whereIs(page, 'animal', 'a1');
    const mat = await whereWorld(page, INSIDE_DOOR);
    await drag(page, inside, { x: mat.x - inside.x, y: mat.y - inside.y });
    await expect(page.getByTestId('indoor-count')).toHaveText(/0\/1/);
  });

  test('with no bed, a dragged animal can’t go in, says why, and goes home', async ({ page }) => {
    await start(page, (s, now) =>
      s.world.animals.push(testAnimal(now, { id: 'a1', position: { x: 0.3, y: 0.5 } })),
    );
    const from = await whereIs(page, 'animal', 'a1');
    const door = await whereWorld(page, HOUSE_DOOR);
    await drag(page, from, { x: door.x - from.x, y: door.y - from.y });
    await expect(page.getByTestId('indoor-count')).toHaveText(/0\/0/);
    // Back home, where it started.
    await expect
      .poll(async () => {
        const back = await whereIs(page, 'animal', 'a1');
        return Math.hypot(back.x - from.x, back.y - from.y);
      })
      .toBeLessThan(5);
    // A drag isn't a tap either.
    await expect(page.getByRole('complementary', { name: /bunny card/i })).toBeHidden();
  });

  test('a sick animal shows its symptom', async ({ page }) => {
    await start(page, (s, now) => {
      s.world.animals.push(
        testAnimal(now, { id: 'a1', sickness: { illnessId: 'sniffles', since: now } }),
        testAnimal(now, {
          id: 'a2',
          position: { x: 0.8, y: 0.5 },
          sickness: { illnessId: 'sleepy_sickness', since: now },
        }),
      );
    });
    // Reduced motion: the words stay put instead of drifting.
    await expect(world(page).getByText('achoo!')).toBeVisible();
    await expect(world(page).getByText('z z')).toBeVisible();
  });

  test('a Sparkle visitor gets a banner when revealed', async ({ page }) => {
    await start(page, (s, now) =>
      s.world.gateQueue.push(
        testVisitor(now, { roll: { ...testVisitor(now).roll, isSparkle: true } }),
      ),
    );
    await tapAt(page, await whereIs(page, 'visitor', 'v900'));
    await expect(world(page).getByText('✦ Sparkle! ✦')).toBeVisible();
  });
});
