import { expect, test } from '@playwright/test';
import { BALANCE } from '../../src/config/balance';
import { yardToWorld } from '../../src/game/layout';
import { buildSave, canvasReady, press, seedSave, tapWorld } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test.describe('early game', () => {
  test('Meadow Goals: a finished goal glows in the HUD and pays out', async ({ page }) => {
    await seedSave(
      page,
      buildSave((s, now) => {
        s.world.nextVisitorAt = now + 99 * 3_600_000;
        s.world.goals.progress = { meet3: 3, pet5: 2 };
      }),
    );
    await page.goto('./');
    await canvasReady(page);
    const button = page.getByTestId('goals-button');
    await expect(button).toHaveAccessibleName('Goals: 1 ready to collect');
    await press(page, button);
    const screen = page.getByRole('dialog', { name: 'Goals' });
    await expect(screen.getByTestId('goals-progress')).toContainText('0/8 done');
    const meet = screen.getByRole('listitem', { name: 'Meet 3 mystery visitors' });
    const pet = screen.getByRole('listitem', { name: 'Pet animals 5 times' });
    await expect(pet).toContainText('2/5');
    await expect(pet.getByRole('button', { name: /collect/i })).toHaveCount(0);
    await press(page, meet.getByRole('button', { name: /collect/i }));
    await expect(page.getByTestId('coins')).toHaveText(String(100 + 20));
    await expect(meet).toContainText('✅');
    await expect(screen.getByTestId('goals-progress')).toContainText('1/8 done');
    await expect(button).toHaveAccessibleName('Goals');
  });

  test('a coin in the yard: tap it for coins', async ({ page }) => {
    const position = { x: 0.5, y: 0.5 };
    await seedSave(
      page,
      buildSave((s, now) => {
        s.world.nextVisitorAt = now + 99 * 3_600_000;
        s.world.nextFindAt = now + 99 * 3_600_000;
        s.world.finds.push({ id: 'f1', kind: 'coin', position, expiresAt: now + 3 * 60_000 });
      }),
    );
    await page.goto('./');
    await canvasReady(page);
    await tapWorld(page, yardToWorld(position));
    await expect(page.getByTestId('coins')).toHaveText(
      String(100 + BALANCE.finds.kinds.coin.coins),
    );
  });

  test('a present on a new day: open it, once', async ({ page }) => {
    await seedSave(
      page,
      buildSave((s) => {
        s.world.dailyGift.lastDay = '2000-01-01';
      }),
    );
    await page.goto('./');
    await canvasReady(page);
    const card = page.getByRole('dialog', { name: /a present for today/i });
    await expect(card).toBeVisible();
    await press(page, card.getByRole('button', { name: 'Open the present' }));
    const opened = page.getByRole('dialog', { name: /for you/i });
    await expect(opened.getByTestId('gift-reward')).toContainText(/🪙|💎|Carrot|Bird|Toy|Flower/);
    await press(page, opened.getByRole('button', { name: /yay/i }));
    await expect(opened).toBeHidden();
    await page.waitForTimeout(300);
    await page.reload();
    await canvasReady(page);
    await expect(page.getByRole('dialog', { name: /a present for today/i })).toHaveCount(0);
  });
});
