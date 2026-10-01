import { expect, test, type Page } from '@playwright/test';
import { BIRTHDAY } from '../../src/config/birthday';
import { buildSave, canvasReady, press, seedSave } from './helpers';

/** October 1: the birthday card on the first play of the day, and the birthday hat all day. */

const BIRTHDAY_MORNING = new Date(2026, BIRTHDAY.month - 1, BIRTHDAY.day, 9).getTime();
const DAY_AFTER = new Date(2026, BIRTHDAY.month - 1, BIRTHDAY.day + 1, 9).getTime();

const card = (page: Page) => page.getByRole('dialog', { name: /happy birthday grace/i });
const hat = (page: Page) => page.evaluate(() => window.meadow3d!.avatar().hat);

async function startAt(page: Page, now: number) {
  await page.clock.setSystemTime(now);
  await seedSave(
    page,
    buildSave((s) => {
      s.world.birthday.lastGreetedDay = '';
      s.world.dailyGift.lastDay = '2000-01-01';
      s.world.nextVisitorAt = now + 99 * 3_600_000;
    }, now),
  );
  await page.goto('./');
  await canvasReady(page);
}

test('on the birthday: the card shows once, then the present; the hat stays all day', async ({
  page,
}) => {
  await startAt(page, BIRTHDAY_MORNING);
  await expect(card(page)).toBeVisible();
  // The present waits for the birthday card.
  await expect(page.getByRole('dialog', { name: /a present for today/i })).toHaveCount(0);
  expect(await hat(page)).toBe(BIRTHDAY.hatItemId);

  await press(page, card(page).getByRole('button', { name: /thank you/i }));
  await expect(card(page)).toBeHidden();
  await expect(page.getByRole('dialog', { name: /a present for today/i })).toBeVisible();

  // Later the same day: no card again, but still the hat.
  await page.waitForTimeout(300);
  await page.reload();
  await canvasReady(page);
  await expect(page.getByRole('dialog', { name: /a present for today/i })).toBeVisible();
  await expect(card(page)).toHaveCount(0);
  expect(await hat(page)).toBe(BIRTHDAY.hatItemId);
});

test('any other day: no card and no birthday hat', async ({ page }) => {
  await startAt(page, DAY_AFTER);
  await expect(page.getByRole('dialog', { name: /a present for today/i })).toBeVisible();
  await expect(card(page)).toHaveCount(0);
  expect(await hat(page)).toBeNull();
});
