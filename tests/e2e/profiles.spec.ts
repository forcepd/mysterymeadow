import { expect, test, type Page } from './fixtures2d';
import { numberInWords } from '../../src/profile/pin';
import type { DeviceRecord } from '../../src/save/device';
import type { SaveFile } from '../../src/save/schema';
import {
  TEST_PIN,
  animalTapPoint,
  bowlTapPoint,
  buildSave,
  canvasReady,
  gateTapPoint,
  poopTapPoint,
  press,
  seedSave,
  tapWorld,
} from './helpers';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

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

async function typePin(page: Page, pad: ReturnType<Page['getByRole']>, pin: string) {
  for (const d of pin) await press(page, pad.getByRole('button', { name: d, exact: true }));
}

async function onboard(page: Page, name: string) {
  await page.getByLabel('Nickname').fill(name);
  await press(page, page.getByRole('button', { name: /next/i }));
  await expect(page.getByRole('heading', { name: 'Make your look!' })).toBeVisible();
  await press(page, page.getByRole('tab', { name: /hair/i }));
  await press(page, page.getByRole('button', { name: 'Bob', exact: true }));
  await press(page, page.getByRole('button', { name: /next/i }));
  await expect(page.getByRole('heading', { name: 'Pick your house color' })).toBeVisible();
  await press(page, page.getByRole('radio', { name: 'Mint' }));
  await press(page, page.getByRole('button', { name: /let’s go/i }));
}

const coach = (page: Page) => page.getByRole('complementary', { name: 'Tutorial' });

test.describe('profiles, onboarding, and the tutorial', () => {
  test('a brand new player goes from first launch to their first sale (Phase 8 done-when)', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    // Real time flows; the test only skips ahead where the game makes you wait.
    await page.clock.install();
    await page.goto('./');

    // 1. First run on the device: a grown-up sets the Parent PIN.
    await typePin(page, page.getByRole('group', { name: 'Choose a PIN' }), '2468');
    await typePin(page, page.getByRole('group', { name: 'Type it again' }), '2468');

    // 2-3. Username, avatar, house color (DESIGN 5).
    await page.getByLabel('Nickname').fill('ab');
    await press(page, page.getByRole('button', { name: /next/i }));
    await expect(page.getByRole('alert')).toHaveText('Use 3 to 16 letters or numbers.');
    await onboard(page, 'Sunny_Fox');
    await canvasReady(page);

    // 4. The tutorial: the first visitor is already at the gate.
    await expect(coach(page)).toContainText('A mystery visitor is at the gate!');
    await expect(page.getByTestId('next-visitor')).toContainText('A visitor is at the gate!');
    await page.waitForTimeout(300); // Let it walk up to the gate.
    await tapWorld(page, gateTapPoint(0));
    await expect(coach(page)).toContainText('is hungry! Tap the food bowl');
    await tapWorld(page, bowlTapPoint());
    await expect(coach(page)).toHaveAttribute('data-step', 'poop');

    // It poops soon; the autosave (every 15 s) tells the test where.
    await page.clock.fastForward('00:40');
    await expect(coach(page)).toContainText('made a mess');
    const device = await readStore<DeviceRecord>(page, 'device');
    const id = device.profiles[0]!.id;
    await expect
      .poll(async () => (await readStore<SaveFile>(page, `profile:${id}`)).world.poops.length)
      .toBe(1);
    let save = await readStore<SaveFile>(page, `profile:${id}`);
    await tapWorld(page, poopTapPoint(save.world.poops[0]!.position));
    await expect(coach(page)).toHaveAttribute('data-step', 'card');

    // The coach tells the real wait: a new player's first animals are ready in 5 minutes.
    await expect(coach(page)).toContainText(/In [1-5] minutes? it’s ready for a new home!/);
    save = await readStore<SaveFile>(page, `profile:${id}`);
    const animal = save.world.animals[0]!;
    await tapWorld(page, animalTapPoint(animal.position));
    const card = page.getByRole('complementary', { name: / card$/ });
    await expect(card.getByTestId('hold-status')).toContainText('Ready to sell in');
    await expect(coach(page)).toContainText('Great job!');
    await press(page, coach(page).getByRole('button', { name: /let’s play/i }));
    await expect(coach(page)).toBeHidden();
    await press(page, card.getByRole('button', { name: 'Close' }));

    // Well past the wait, it's ready for a new home. (If the visitor was pregnant, its babies
    // sit right next to it and aren't ready yet: try each animal until one can be sold.)
    await page.clock.fastForward('21:00');
    await expect(page.getByTestId('coins')).toHaveText('100');
    await expect
      .poll(async () => (await readStore<SaveFile>(page, `profile:${id}`)).meta.lastSeenAt)
      .toBeGreaterThan(save.meta.lastSeenAt + 20 * 60_000);
    // The yard is busy by now (the new-player quick start brings visitors fast), and animals
    // wander: read fresh positions each round, try only animals that are ready, and give the
    // autosave a moment between rounds. A coin or clover on top of one just gets collected.
    let sold = false;
    for (let round = 0; round < 6 && !sold; round++) {
      save = await readStore<SaveFile>(page, `profile:${id}`);
      const now = save.meta.lastSeenAt;
      const ready = save.world.animals.filter(
        (a) => a.zone === 'yard' && a.holdUntil <= now && !(a.grownAt && a.grownAt > now),
      );
      for (const a of ready) {
        await tapWorld(page, animalTapPoint(a.position));
        const openCard = page.getByRole('complementary', { name: / card$/ });
        if (!(await openCard.isVisible())) continue;
        const sell = openCard.getByRole('button', { name: /sell for/i });
        if ((await sell.getAttribute('aria-disabled')) === 'false') {
          await press(page, sell);
          sold = true;
          break;
        }
        // Close it: an open card covers part of the yard.
        await press(page, openCard.getByRole('button', { name: 'Close' }));
      }
      if (!sold) await page.clock.fastForward('00:16');
    }
    expect(sold).toBe(true);
    await expect(page.getByText(/went to a loving new home/)).toBeVisible();
    await expect(page.getByTestId('coins')).not.toHaveText('100');
  });

  test('a second player, switching players, and skipping the tutorial', async ({ page }) => {
    await seedSave(
      page,
      buildSave(() => {}),
    );
    await page.goto('./');
    await expect(page.getByRole('button', { name: 'Play as Player' })).toBeVisible();
    await press(page, page.getByRole('button', { name: /new player/i }));
    await page.getByLabel('Nickname').fill('player');
    await press(page, page.getByRole('button', { name: /next/i }));
    await expect(page.getByRole('alert')).toHaveText('Someone here already uses that name!');
    await onboard(page, 'Pip_2');
    await canvasReady(page);
    await press(page, coach(page).getByRole('button', { name: /skip tutorial/i }));
    await expect(coach(page)).toBeHidden();

    await press(page, page.getByRole('button', { name: 'Settings' }));
    await press(page, page.getByRole('button', { name: /switch player/i }));
    await expect(page.getByRole('button', { name: 'Play as Pip_2' })).toBeVisible();
    await press(page, page.getByRole('button', { name: 'Play as Player' }));
    await canvasReady(page);
    await expect(coach(page)).toBeHidden();
    await expect(page.getByRole('button', { name: 'Player: my style' })).toBeVisible();
  });

  test('an install from before profiles keeps its save and asks for a PIN once', async ({
    page,
  }) => {
    await seedSave(
      page,
      buildSave((s) => (s.world.coins = 777)),
      { device: false },
    );
    await page.goto('./');
    await typePin(page, page.getByRole('group', { name: 'Choose a PIN' }), '1111');
    await typePin(page, page.getByRole('group', { name: 'Type it again' }), '1111');
    await canvasReady(page);
    await expect(page.getByTestId('coins')).toHaveText('777');
  });
});

test.describe('style and gems', () => {
  async function start(page: Page) {
    await seedSave(
      page,
      buildSave(() => {}),
    );
    await page.goto('./');
    await canvasReady(page);
    await press(page, page.getByRole('button', { name: 'Player: my style' }));
    return page.getByRole('dialog', { name: 'My style' });
  }

  test('Boutique: try on and buy with gems; it goes in the Wardrobe', async ({ page }) => {
    const style = await start(page);
    await press(page, style.getByRole('tab', { name: /boutique/i }));
    await press(page, style.getByRole('tab', { name: /hair/i }));
    await press(page, style.getByRole('button', { name: 'Space buns' }));
    await press(page, style.getByRole('button', { name: /buy space buns 💎30/i }));
    await expect(style.getByText('💎 It’s yours: Space buns!')).toBeVisible();
    await expect(page.getByTestId('gems')).toHaveText('20');
    await press(page, style.getByRole('tab', { name: /wardrobe/i }));
    await press(page, style.getByRole('tab', { name: /hair/i }));
    await expect(style.getByRole('button', { name: 'Space buns' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('Wardrobe: change looks for free and keep a favorite', async ({ page }) => {
    const style = await start(page);
    await press(page, style.getByRole('tab', { name: /clothes/i }));
    await press(page, style.getByRole('button', { name: 'Sundress' }));
    await press(page, style.getByRole('button', { name: /wear it/i }));
    await expect(style.getByText('✨ Looking great!')).toBeVisible();
    await press(page, style.getByRole('button', { name: /save 1/i }));
    await expect(style.getByRole('button', { name: 'Wear favorite 1' })).toBeVisible();
    await expect(page.getByTestId('gems')).toHaveText('50');
  });

  test('Get Gems asks a grown-up for the PIN', async ({ page }) => {
    const style = await start(page);
    await press(page, style.getByRole('tab', { name: /boutique/i }));
    await press(page, style.getByRole('button', { name: /get gems/i }));
    const pad = style.getByRole('group', { name: /ask a grown-up/i });
    await typePin(page, pad, '9999');
    await expect(pad.getByRole('alert')).toHaveText('That’s not the PIN.');
    await typePin(page, pad, TEST_PIN);
    await press(page, style.getByRole('button', { name: '💎 50', exact: true }));
    await expect(page.getByTestId('gems')).toHaveText('100');
  });

  test('Forgot PIN: the grown-up check sets a new one', async ({ page }) => {
    const style = await start(page);
    await press(page, style.getByRole('tab', { name: /boutique/i }));
    await press(page, style.getByRole('button', { name: /get gems/i }));
    await press(page, style.getByRole('button', { name: /forgot pin/i }));
    const words = (await style.getByTestId('pin-challenge').textContent())!.trim();
    let n = 1000;
    while (numberInWords(n) !== words) n++;
    await style.getByLabel('The number in digits').fill(String(n));
    await press(page, style.getByRole('button', { name: 'Check' }));
    await typePin(page, style.getByRole('group', { name: 'Choose a PIN' }), '5555');
    await typePin(page, style.getByRole('group', { name: 'Type it again' }), '5555');
    await press(page, style.getByRole('button', { name: '💎 10', exact: true }));
    await expect(page.getByTestId('gems')).toHaveText('60');
  });
});

test.describe('Parent Mode', () => {
  async function openParentMode(page: Page) {
    await seedSave(
      page,
      buildSave(() => {}),
    );
    await page.goto('./');
    await canvasReady(page);
    await press(page, page.getByRole('button', { name: 'Settings' }));
    const screen = page.getByRole('dialog', { name: 'Settings' });
    await press(page, screen.getByRole('button', { name: /parent mode/i }));
    await typePin(page, screen.getByRole('group', { name: 'Parent Mode' }), TEST_PIN);
    await expect(screen.getByRole('heading', { name: '🔒 Parent Mode' })).toBeVisible();
    return screen;
  }

  test('grant gems, see activity, change settings', async ({ page }) => {
    const screen = await openParentMode(page);
    await press(
      page,
      screen.getByRole('region', { name: 'Gems' }).getByRole('button', { name: '💎 100' }),
    );
    await expect(page.getByTestId('gems')).toHaveText('150');
    await expect(screen.getByRole('region', { name: 'Recent activity' })).toContainText(
      'A grown-up gave 100 gems',
    );
    const sick = screen.getByLabel('🤒 Animals can get sick');
    await expect(sick).toBeChecked();
    await press(page, sick);
    await expect(sick).not.toBeChecked();
    await page.waitForTimeout(300); // Settings save right away.
    await page.reload();
    await canvasReady(page);
    const reopened = await (async () => {
      await press(page, page.getByRole('button', { name: 'Settings' }));
      const s = page.getByRole('dialog', { name: 'Settings' });
      await press(page, s.getByRole('button', { name: /parent mode/i }));
      await typePin(page, s.getByRole('group', { name: 'Parent Mode' }), TEST_PIN);
      return s;
    })();
    await expect(reopened.getByLabel('🤒 Animals can get sick')).not.toBeChecked();
  });

  test('rename a player', async ({ page }) => {
    const screen = await openParentMode(page);
    await press(page, screen.getByRole('button', { name: /rename/i }));
    await screen.getByLabel('New name for Player').fill('Captain_Paws');
    await press(page, screen.getByRole('button', { name: 'Save', exact: true }));
    await expect(screen.getByText('✏️ Renamed to Captain_Paws.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Captain_Paws: my style' })).toBeVisible();
  });

  test('save a backup and load it again', async ({ page }) => {
    const screen = await openParentMode(page);
    const download = page.waitForEvent('download');
    await press(page, screen.getByRole('button', { name: /save a backup/i }));
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^mystery-meadow-backup-\d{4}-\d\d-\d\d\.json$/);
    const backup = JSON.parse(
      await (await file.createReadStream()).toArray().then((c) => Buffer.concat(c).toString()),
    );
    expect(backup.saves).toHaveLength(1);
    expect(JSON.stringify(backup)).not.toContain(TEST_PIN);

    // Change the backup (as if it were an older copy with more coins) and load it.
    backup.saves[0].world.coins = 4321;
    await screen.getByLabel('Backup file').setInputFiles({
      name: 'backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(backup)),
    });
    await expect(screen.getByText(/Load Player from the backup\?/)).toBeVisible();
    await press(page, screen.getByRole('button', { name: 'Load backup' }));
    // Back to the picker (the running game was replaced), then into the restored meadow.
    await expect(page.getByRole('button', { name: 'Play as Player' })).toBeVisible();
    await canvasReady(page);
    await expect(page.getByTestId('coins')).toHaveText('4321');
  });

  test('a file that isn’t a backup is refused', async ({ page }) => {
    const screen = await openParentMode(page);
    await screen.getByLabel('Backup file').setInputFiles({
      name: 'notes.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"hello":1}'),
    });
    await expect(screen.getByText('That file isn’t a Mystery Meadow backup.')).toBeVisible();
  });
});

test('onboarding screens meet the 48x48 touch target minimum', async ({ page }) => {
  await page.goto('./');
  const check = async () => {
    await page.waitForTimeout(200); // Let the screen settle.
    const small = await page.evaluate(() =>
      [...document.querySelectorAll('button, input')]
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 0 && r.height > 0 && (r.width < 48 || r.height < 48))
        .map(
          ({ el, r }) =>
            `${el.textContent || el.getAttribute('aria-label')}: ${r.width}x${r.height}`,
        ),
    );
    expect(small).toEqual([]);
  };
  await check(); // PIN pad
  await typePin(page, page.getByRole('group', { name: 'Choose a PIN' }), '1234');
  await typePin(page, page.getByRole('group', { name: 'Type it again' }), '1234');
  await check(); // Nickname
  await page.getByLabel('Nickname').fill('Tester');
  await press(page, page.getByRole('button', { name: /next/i }));
  await check(); // Avatar
  await press(page, page.getByRole('button', { name: /next/i }));
  await check(); // House color
});
