import { expect, test, type Page } from '@playwright/test';
import type { DeviceRecord } from '../../src/save/device';
import type { SaveFile } from '../../src/save/schema';
import type { PickKind } from '../../src/world3d/pick';
import {
  audit,
  buildSave,
  closeBirthdayCard,
  canvasReady,
  press,
  seedSave,
  testAnimal,
} from './helpers';
import { tapAt, whereIs } from './helpers3d';

/**
 * Phase 3D-6: the 3D world is the default, so the original's main flows are played in it end
 * to end: first launch to the first sale, keeping a pet, training a trick, and the a11y and
 * privacy checks. Plus the Settings switch to the classic 2D world.
 */

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

const menu = (page: Page) => page.getByRole('navigation', { name: 'Menu' });
const coach = (page: Page) => page.getByRole('complementary', { name: 'Tutorial' });

/** Reads a key from the game's IndexedDB store. */
async function readStore<T>(page: Page, key: string): Promise<T> {
  return page.evaluate(
    (k) =>
      new Promise<T>((resolve, reject) => {
        const open = indexedDB.open('mystery-meadow-3d');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const req = open.result.transaction('saves').objectStore('saves').get(k);
          req.onsuccess = () => {
            open.result.close();
            resolve(req.result as T);
          };
          req.onerror = () => reject(req.error);
        };
      }),
    key,
  );
}

/** Where something is on the page, or null if it's off screen right now. */
const onScreen = (page: Page, kind: PickKind, id: string) =>
  page.evaluate(([k, i]) => window.meadow3d!.projectObject(k, i), [kind, id] as [PickKind, string]);

async function typePin(page: Page, pad: ReturnType<Page['getByRole']>, pin: string) {
  for (const d of pin) await press(page, pad.getByRole('button', { name: d, exact: true }));
}

async function start(page: Page, edit: Parameters<typeof buildSave>[0] = () => {}) {
  await seedSave(
    page,
    buildSave((s, now) => {
      s.world.settings.sicknessEnabled = false;
      s.world.nextVisitorAt = now + 99 * 3_600_000;
      edit(s, now);
    }),
  );
  await page.goto('./');
  await canvasReady(page);
}

test.describe('the 3D world plays the whole game', () => {
  test('a brand new player goes from first launch to their first sale', async ({ page }) => {
    test.setTimeout(120_000);
    await page.clock.install();
    await page.goto('./');

    await typePin(page, page.getByRole('group', { name: 'Choose a PIN' }), '2468');
    await typePin(page, page.getByRole('group', { name: 'Type it again' }), '2468');
    await page.getByLabel('Nickname').fill('Sunny_Fox');
    await press(page, page.getByRole('button', { name: /next/i }));
    await press(page, page.getByRole('button', { name: /next/i }));
    await press(page, page.getByRole('radio', { name: 'Mint' }));
    await press(page, page.getByRole('button', { name: /let’s go/i }));
    await canvasReady(page);
    await expect(page.getByTestId('game-canvas')).toHaveAttribute('data-renderer', '3d');

    // The tutorial: the first visitor is at the gate.
    await expect(coach(page)).toContainText('A mystery visitor is at the gate!');
    const device = await readStore<DeviceRecord>(page, 'device');
    const id = device.profiles[0]!.id;
    const save = () => readStore<SaveFile>(page, `profile:${id}`);
    let s = await save();
    await page.waitForTimeout(300); // Let it walk up to the gate.
    const visitor = await page.evaluate(() => window.meadow3d!.pickableIds('visitor'));
    expect(visitor).toHaveLength(1);
    await tapAt(page, await whereIs(page, 'visitor', visitor[0]!));
    await expect(coach(page)).toContainText('is hungry! Tap the food bowl');
    const bowl = await page.evaluate(() => window.meadow3d!.pickableIds('bowl'));
    await tapAt(page, await whereIs(page, 'bowl', bowl[0]!));
    await expect(coach(page)).toHaveAttribute('data-step', 'poop');

    // It poops soon; the autosave (every 15 s) tells the test which one.
    await page.clock.fastForward('00:40');
    await expect(coach(page)).toContainText('made a mess');
    const poop = await page.evaluate(() => window.meadow3d!.pickableIds('poop'));
    expect(poop).toHaveLength(1);
    await tapAt(page, await whereIs(page, 'poop', poop[0]!));
    await expect(coach(page)).toHaveAttribute('data-step', 'card');

    const animal = await page.evaluate(() => window.meadow3d!.pickableIds('animal'));
    await tapAt(page, await whereIs(page, 'animal', animal[0]!));
    const card = page.getByRole('complementary', { name: / card$/ });
    await expect(card.getByTestId('hold-status')).toContainText('Ready to sell in');
    await expect(coach(page)).toContainText('Great job!');
    await press(page, coach(page).getByRole('button', { name: /let’s play/i }));
    await expect(coach(page)).toBeHidden();
    await closeBirthdayCard(page);
    await press(page, card.getByRole('button', { name: 'Close' }));

    // Well past the wait, sell an animal that's ready (try each, as they wander).
    await page.clock.fastForward('21:00');
    const seen = s.meta.lastSeenAt;
    await expect
      .poll(async () => (await save()).meta.lastSeenAt)
      .toBeGreaterThan(seen + 20 * 60_000);
    let sold = false;
    for (let round = 0; round < 6 && !sold; round++) {
      s = await save();
      const now = s.meta.lastSeenAt;
      const ready = s.world.animals.filter(
        (a) => a.zone === 'yard' && a.holdUntil <= now && !(a.grownAt && a.grownAt > now),
      );
      for (const a of ready) {
        const at = await onScreen(page, 'animal', a.id);
        if (!at) continue;
        await tapAt(page, at);
        const open = page.getByRole('complementary', { name: / card$/ });
        if (!(await open.isVisible())) continue;
        const sell = open.getByRole('button', { name: /sell for/i });
        if ((await sell.getAttribute('aria-disabled')) === 'false') {
          await press(page, sell);
          sold = true;
          break;
        }
        await press(page, open.getByRole('button', { name: 'Close' }));
      }
      if (!sold) await page.clock.fastForward('00:16');
    }
    expect(sold).toBe(true);
    await expect(page.getByText(/went to a loving new home/)).toBeVisible();
  });

  test('keep a pet from its card; it shows on the Pets screen', async ({ page }) => {
    await start(page, (s, now) =>
      s.world.animals.push(testAnimal(now, { id: 'a1', name: 'Biscuit' })),
    );
    await expect(page.getByTestId('pet-slots')).toHaveText(/0\/2/);
    await tapAt(page, await whereIs(page, 'animal', 'a1'));
    const card = page.getByRole('complementary', { name: /biscuit card/i });
    await press(page, card.getByRole('button', { name: /keep as my pet/i }));
    await expect(page.getByTestId('pet-slots')).toHaveText(/1\/2/);
    await press(page, card.getByRole('button', { name: 'Close' }));
    await press(page, menu(page).getByRole('button', { name: /pets/i }));
    const screen = page.getByRole('dialog', { name: 'Your pets' });
    await expect(screen).toContainText('Biscuit');
  });

  test('a kept pet performs a trick it knows for a happiness boost', async ({ page }) => {
    await start(page, (s, now) =>
      s.world.animals.push(
        testAnimal(now, {
          id: 'a1',
          name: 'Pip',
          isKept: true,
          needs: { hunger: 100, happiness: 50 },
          tricks: { known: ['spin'], progress: {}, nextTrainAt: 0 },
        }),
      ),
    );
    await tapAt(page, await whereIs(page, 'animal', 'a1'));
    const card = page.getByRole('complementary', { name: /pip card/i });
    const happy = card.getByRole('meter', { name: 'Happy' });
    const before = Number(await happy.getAttribute('aria-valuenow'));
    await press(
      page,
      card.getByRole('group', { name: 'Perform a trick' }).getByRole('button', { name: /spin/i }),
    );
    await expect
      .poll(async () => Number(await happy.getAttribute('aria-valuenow')))
      .toBeGreaterThanOrEqual(before + 9);
    // The training screen opens over the 3D world too.
    await press(page, card.getByRole('button', { name: /train/i }));
    await expect(page.getByRole('dialog', { name: 'Training' })).toBeVisible();
  });

  test('every control is big enough and named (with the camera moved, too)', async ({ page }) => {
    await start(page, (s, now) => s.world.animals.push(testAnimal(now, { id: 'a1' })));
    await audit(page, '3d world');
    // Move the camera so the reset-view button shows, then check it too.
    const box = (await page.getByTestId('game-canvas').boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.8);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.75, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByTestId('reset-view')).toBeVisible();
    await audit(page, '3d world, camera moved');
    await tapAt(page, await whereIs(page, 'animal', 'a1'));
    await expect(page.getByRole('complementary', { name: /bunny card/i })).toBeVisible();
    await audit(page, '3d animal card');
  });

  test('makes no requests to other origins', async ({ page, baseURL }) => {
    const origin = new URL(baseURL!).origin;
    const external: string[] = [];
    page.on('request', (req) => {
      const url = new URL(req.url());
      if (url.protocol.startsWith('http') && url.origin !== origin) external.push(req.url());
    });
    await start(page, (s, now) => s.world.animals.push(testAnimal(now, { id: 'a1' })));
    await tapAt(page, await whereIs(page, 'animal', 'a1'));
    await page.waitForLoadState('networkidle');
    expect(external).toEqual([]);
  });
});

test.describe('the classic 2D world, for fun', () => {
  test('the Settings switch changes the world right away and is remembered', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await start(page, (s, now) => s.world.animals.push(testAnimal(now, { id: 'a1' })));
    const host = page.getByTestId('game-canvas');
    await expect(host).toHaveAttribute('data-renderer', '3d');

    await press(page, page.getByRole('button', { name: 'Settings' }));
    const settings = page.getByRole('dialog', { name: 'Settings' });
    const classic = settings.getByLabel(/classic 2d world/i);
    await expect(classic).not.toBeChecked();
    await press(page, classic);
    await expect(classic).toBeChecked();
    await press(page, settings.getByRole('button', { name: 'Close' }));
    await canvasReady(page);
    await expect(host).not.toHaveAttribute('data-renderer', '3d');

    await page.reload();
    await canvasReady(page);
    await expect(host).not.toHaveAttribute('data-renderer', '3d');
    // The game itself carries on the same (same save, same animals).
    await expect(page.getByTestId('capacity')).toHaveText(/🐾1\//);

    // And back to 3D.
    await press(page, page.getByRole('button', { name: 'Settings' }));
    await press(page, settings.getByLabel(/classic 2d world/i));
    await press(page, settings.getByRole('button', { name: 'Close' }));
    await expect(host).toHaveAttribute('data-renderer', '3d');
    await canvasReady(page);
    await expect(page.getByTestId('capacity')).toHaveText(/🐾1\//);
    expect(errors).toEqual([]);
  });
});
