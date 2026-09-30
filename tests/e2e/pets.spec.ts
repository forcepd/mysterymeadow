import { expect, test, type Page } from '@playwright/test';
import { SPECIES } from '../../src/config/species';
import type { Animal, SimState } from '../../src/sim/types';
import {
  animalTapPoint,
  buildSave,
  canvasReady,
  press,
  seedSave,
  tapWorld,
  testAnimal,
} from './helpers';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

const CENTER = { x: 0.5, y: 0.5 };

/** Animals away from the center, so a tap at the center only hits the first one. */
function pet(now: number, id: string, name: string, extra: Partial<Animal> = {}): Animal {
  return testAnimal(now, {
    id,
    name,
    isKept: true,
    position: { x: 0.05 + Number(id.replace(/\D/g, '')) * 0.07, y: 0.95 },
    ...extra,
  });
}

async function start(page: Page, edit: (s: SimState, now: number) => void) {
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

async function openCard(page: Page, name: RegExp) {
  await tapWorld(page, animalTapPoint(CENTER));
  const card = page.getByRole('complementary', { name });
  await expect(card).toBeVisible();
  return card;
}

async function openPets(page: Page) {
  await press(
    page,
    page.getByRole('navigation', { name: 'Menu' }).getByRole('button', { name: /pets/i }),
  );
  const screen = page.getByRole('dialog', { name: 'Your pets' });
  await expect(screen).toBeVisible();
  return screen;
}

test.describe('keeping, storage, and the Dex', () => {
  test('keep from the card with a free slot', async ({ page }) => {
    await start(page, (s, now) => s.world.animals.push(testAnimal(now, { name: 'Biscuit' })));
    await expect(page.getByTestId('pet-slots')).toHaveText(/0\/2/);
    const card = await openCard(page, /biscuit card/i);
    await press(page, card.getByRole('button', { name: /keep as my pet/i }));
    await expect(page.getByTestId('pet-slots')).toHaveText(/1\/2/);
    await expect(card.getByRole('button', { name: /un-keep/i })).toBeVisible();
    await expect(card.getByText('Kept')).toBeVisible();
  });

  test('keep with full slots: the new pet takes a slot, bumping one into Storage', async ({
    page,
  }) => {
    await start(page, (s, now) => {
      s.world.animals.push(
        testAnimal(now, { name: 'Newbie' }),
        pet(now, 'a1', 'Pip'),
        pet(now, 'a2', 'Mochi'),
      );
    });
    const card = await openCard(page, /newbie card/i);
    await press(page, card.getByRole('button', { name: /keep as my pet/i }));
    const screen = page.getByRole('dialog', { name: 'Your pets' });
    await expect(screen.getByText('Keeping Newbie!')).toBeVisible();
    await press(
      page,
      screen.getByRole('region', { name: 'Pet Slots' }).getByRole('button', { name: 'Pip' }),
    );
    await expect(
      screen.getByText('Newbie is your pet now! Pip is resting in Storage.'),
    ).toBeVisible();
    await expect(screen.getByTestId('storage-count')).toHaveText('1/20');
    await expect(screen.getByTestId('slots-count')).toHaveText('2/2');
    await expect(
      screen.getByRole('region', { name: 'Pet Storage' }).getByRole('button', { name: 'Pip' }),
    ).toBeVisible();
  });

  test('a new pet can go straight into Storage', async ({ page }) => {
    await start(page, (s, now) => {
      s.world.animals.push(
        testAnimal(now, { name: 'Newbie' }),
        pet(now, 'a1', 'Pip'),
        pet(now, 'a2', 'Mochi'),
      );
    });
    const card = await openCard(page, /newbie card/i);
    await press(page, card.getByRole('button', { name: /keep as my pet/i }));
    const screen = page.getByRole('dialog', { name: 'Your pets' });
    await press(page, screen.getByRole('button', { name: /store here/i }));
    await expect(screen.getByText(/Newbie is your pet now, resting in Storage/)).toBeVisible();
    await expect(page.getByTestId('capacity')).toHaveText(/2\/6/);
  });

  test('drag a stored pet onto a slot pet to swap them', async ({ page }) => {
    await start(page, (s, now) => {
      s.world.animals.push(pet(now, 'a1', 'Pip'), pet(now, 'a2', 'Mochi'));
      s.world.petStorage.push({ animal: pet(now, 'a3', 'Luna'), storedAt: now });
    });
    const screen = await openPets(page);
    const luna = screen
      .getByRole('region', { name: 'Pet Storage' })
      .getByRole('button', { name: 'Luna' });
    const mochi = screen
      .getByRole('region', { name: 'Pet Slots' })
      .getByRole('button', { name: 'Mochi' });
    const from = (await luna.boundingBox())!;
    const to = (await mochi.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 });
    await page.mouse.up();
    await expect(screen.getByText('Luna and Mochi swapped places!')).toBeVisible();
    await expect(
      screen.getByRole('region', { name: 'Pet Slots' }).getByRole('button', { name: 'Luna' }),
    ).toBeVisible();
    await expect(
      screen.getByRole('region', { name: 'Pet Storage' }).getByRole('button', { name: 'Mochi' }),
    ).toBeVisible();
  });

  test('taking a pet out needs room in the house', async ({ page }) => {
    await start(page, (s, now) => {
      s.world.animals.push(pet(now, 'a1', 'Pip'));
      for (let i = 2; i <= 6; i++) {
        s.world.animals.push(testAnimal(now, { id: `b${i}`, position: { x: i * 0.1, y: 0.9 } }));
      }
      s.world.petStorage.push({ animal: pet(now, 'a7', 'Luna'), storedAt: now });
    });
    const screen = await openPets(page);
    await press(page, screen.getByRole('button', { name: 'Luna' }));
    await press(page, screen.getByRole('button', { name: /empty slot/i }));
    await expect(screen.getByText('Your house is full!')).toBeVisible();
    // Swapping with a pet that's out still works.
    await press(page, screen.getByRole('button', { name: 'Luna' }));
    await press(page, screen.getByRole('button', { name: 'Pip' }));
    await expect(screen.getByText('Luna and Pip swapped places!')).toBeVisible();
  });

  test('store a pet from its card; it stays stored after a reload', async ({ page }) => {
    await start(page, (s, now) =>
      s.world.animals.push(testAnimal(now, { name: 'Biscuit', isKept: true })),
    );
    const card = await openCard(page, /biscuit card/i);
    await press(page, card.getByRole('button', { name: /store/i }));
    await expect(card).toBeHidden();
    await expect(page.getByTestId('capacity')).toHaveText(/0\/6/);
    await page.reload();
    await canvasReady(page);
    await expect(page.getByTestId('capacity')).toHaveText(/0\/6/);
    const screen = await openPets(page);
    await expect(screen.getByTestId('storage-count')).toHaveText('1/20');
  });

  test('the Dex shows found animals and silhouettes for the rest', async ({ page }) => {
    await start(page, (s) => {
      s.world.discoveredDex = ['bunny:white', 'bunny:sparkle', 'fox:red'];
    });
    await press(
      page,
      page.getByRole('navigation', { name: 'Menu' }).getByRole('button', { name: /dex/i }),
    );
    const dex = page.getByRole('dialog', { name: 'Animal Dex' });
    await expect(dex.getByTestId('dex-progress')).toContainText(
      `2/${SPECIES.length} animals found`,
    );
    await expect(dex.getByRole('article', { name: 'Bunny' })).toBeVisible();
    await expect(dex.getByRole('article', { name: 'Fox' })).toBeVisible();
    await expect(dex.getByRole('article', { name: 'Undiscovered animal' })).toHaveCount(
      SPECIES.length - 2,
    );
    await expect(dex.getByText('Unicorn')).toHaveCount(0);
    await press(page, dex.getByRole('button', { name: 'Close' }));
    await expect(dex).toBeHidden();
  });
});
