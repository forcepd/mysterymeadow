import { expect, test, type Page } from './fixtures2d';
import type { SimState } from '../../src/sim/types';
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

async function start(
  page: Page,
  coins: number,
  edit: (s: SimState, now: number) => void = () => {},
) {
  await seedSave(
    page,
    buildSave((s, now) => {
      s.world.settings.sicknessEnabled = false;
      s.world.nextVisitorAt = now + 99 * 3_600_000;
      s.world.coins = coins;
      edit(s, now);
    }),
  );
  await page.goto('./');
  await canvasReady(page);
}

async function openRealEstate(page: Page) {
  const menu = page.getByRole('navigation', { name: 'Menu' });
  await press(page, menu.getByRole('button', { name: /real estate/i }));
  const screen = page.getByRole('dialog', { name: 'Real Estate' });
  await expect(screen).toBeVisible();
  return screen;
}

test.describe('real estate and helpers', () => {
  test('upgrade to the Sunny Bungalow with a free new color', async ({ page }) => {
    await start(page, 2000);
    const screen = await openRealEstate(page);
    await expect(screen.getByTestId('house-tier')).toHaveText('Cozy Cottage');
    await expect(screen.getByText('Animals: 6 → 9')).toBeVisible();
    await press(page, screen.getByRole('button', { name: /upgrade for 1500/i }));
    const moveIn = screen.getByRole('region', { name: 'Move in' });
    await press(page, moveIn.getByRole('radio', { name: 'Mint' }));
    await press(page, moveIn.getByRole('button', { name: /move in/i }));
    await expect(screen.getByText('🎉 Welcome to your Sunny Bungalow!')).toBeVisible();
    await expect(screen.getByTestId('house-tier')).toHaveText('Sunny Bungalow');
    await expect(page.getByTestId('coins')).toHaveText('500'); // The color was free.
    await expect(page.getByTestId('capacity')).toHaveText(/0\/9/);
    await expect(
      screen.getByRole('region', { name: 'Paint the house' }).getByRole('radio', { name: 'Mint' }),
    ).toHaveAttribute('aria-checked', 'true');
  });

  test('not enough coins: the upgrade explains', async ({ page }) => {
    await start(page, 100);
    const screen = await openRealEstate(page);
    const upgrade = screen.getByRole('button', { name: /upgrade for 1500/i });
    await expect(upgrade).toHaveAttribute('aria-disabled', 'true');
    await press(page, upgrade, { force: true });
    await expect(screen.getByText('Not enough coins yet. Keep going!')).toBeVisible();
    await expect(screen.getByTestId('house-tier')).toHaveText('Cozy Cottage');
  });

  test('buy a room, a Pet Slot, more Storage, and paint', async ({ page }) => {
    await start(page, 1000);
    const screen = await openRealEstate(page);
    const extra = (name: string) => screen.getByRole('article', { name });
    await press(page, extra('Extra Room').getByRole('button', { name: /250/ }));
    await expect(page.getByTestId('capacity')).toHaveText(/0\/7/);
    await expect(screen.getByTestId('Extra Room-count')).toHaveText('1/2');
    await press(page, extra('Pet Slot').getByRole('button', { name: /300/ }));
    await expect(page.getByTestId('pet-slots')).toHaveText(/0\/3/);
    await press(page, extra('Pet Storage').getByRole('button', { name: /200/ }));
    await expect(screen.getByTestId('Pet Storage-count')).toHaveText('1/3');
    await press(
      page,
      screen.getByRole('region', { name: 'Paint the house' }).getByRole('radio', { name: 'Rose' }),
    );
    await expect(screen.getByText('🎨 Fresh paint!')).toBeVisible();
    await expect(page.getByTestId('coins')).toHaveText(String(1000 - 250 - 300 - 200 - 50));
  });

  test('the upgrade survives a reload', async ({ page }) => {
    await start(page, 1500);
    const screen = await openRealEstate(page);
    await press(page, screen.getByRole('button', { name: /upgrade for 1500/i }));
    await press(page, screen.getByRole('button', { name: /move in/i }));
    await expect(screen.getByTestId('house-tier')).toHaveText('Sunny Bungalow');
    await page.waitForTimeout(300); // Purchases save right away.
    await page.reload();
    await canvasReady(page);
    await expect(page.getByTestId('capacity')).toHaveText(/0\/9/);
  });

  test('Scoop Bot cleans up yard poop by itself', async ({ page }) => {
    await start(page, 1000, (s, now) => {
      // Helpers run on the minute: start 50 s into one, so the first run is ~10 s away.
      s.meta.createdAt = now - 50_000;
      s.world.animals.push(testAnimal(now));
      s.world.poops.push({ id: 'p1', zone: 'yard', position: { x: 0.9, y: 0.9 }, createdAt: now });
    });
    const card = page.getByRole('complementary', { name: /bunny card/i });
    await tapWorld(page, animalTapPoint({ x: 0.5, y: 0.5 }));
    await expect(card.getByRole('meter', { name: 'Clean' })).toHaveAttribute('aria-valuenow', '80');
    const menu = page.getByRole('navigation', { name: 'Menu' });
    await press(page, menu.getByRole('button', { name: /store/i }));
    const store = page.getByRole('dialog', { name: 'Home Store' });
    await press(page, store.getByRole('tab', { name: /helpers/i }));
    await press(page, store.getByRole('article', { name: 'Scoop Bot' }).getByRole('button'));
    await expect(store.getByText(/Scoop Bot is on the job/)).toBeVisible();
    await press(page, store.getByRole('button', { name: 'Close' }));
    await tapWorld(page, animalTapPoint({ x: 0.5, y: 0.5 }));
    const clean = card.getByRole('meter', { name: 'Clean' });
    await expect(clean).toHaveAttribute('aria-valuenow', '100', { timeout: 65_000 });
  });
});
