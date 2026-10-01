import { expect, test, type Page } from './fixtures2d';
import {
  animalTapPoint,
  bowlTapPoint,
  buildSave,
  canvasReady,
  holdWorld,
  poopTapPoint,
  press,
  seedSave,
  tapWorld,
  testAnimal,
} from './helpers';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

const CENTER = { x: 0.5, y: 0.5 };

async function openCard(page: Page, name = /bunny card/i) {
  await tapWorld(page, animalTapPoint(CENTER));
  const card = page.getByRole('complementary', { name });
  await expect(card).toBeVisible();
  return card;
}

test.describe('care', () => {
  test('press and hold pets an animal (+happiness); a tap opens the card', async ({ page }) => {
    await seedSave(
      page,
      buildSave((s, now) =>
        s.world.animals.push(testAnimal(now, { needs: { hunger: 100, happiness: 40 } })),
      ),
    );
    await page.goto('./');
    await canvasReady(page);
    await holdWorld(page, animalTapPoint(CENTER));
    await expect(page.getByRole('complementary')).toBeHidden(); // a hold is not a tap
    const card = await openCard(page);
    const happy = card.getByRole('meter', { name: 'Happy' });
    expect(Number(await happy.getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(54);
  });

  test('tapping poop cleans it and the zone gets cleaner', async ({ page }) => {
    const poopAt = { x: 0.15, y: 0.85 };
    await seedSave(
      page,
      buildSave((s, now) => {
        s.world.animals.push(testAnimal(now));
        s.world.poops.push(
          { id: 'p1', zone: 'yard', position: poopAt, createdAt: now },
          { id: 'p2', zone: 'yard', position: { x: 0.85, y: 0.85 }, createdAt: now },
        );
      }),
    );
    await page.goto('./');
    await canvasReady(page);
    const card = await openCard(page);
    const clean = card.getByRole('meter', { name: 'Clean' });
    await expect(clean).toHaveAttribute('aria-valuenow', '60');
    await tapWorld(page, poopTapPoint(poopAt));
    await expect(clean).toHaveAttribute('aria-valuenow', '80');
  });

  test('tapping an empty bowl refills it and a hungry animal eats', async ({ page }) => {
    await seedSave(
      page,
      buildSave((s, now) => {
        s.world.placedItems.find((p) => p.itemId === 'food_bowl')!.servings = 0;
        s.world.animals.push(testAnimal(now, { needs: { hunger: 20, happiness: 100 } }));
      }),
    );
    await page.goto('./');
    await canvasReady(page);
    const card = await openCard(page);
    const food = card.getByRole('meter', { name: 'Food' });
    expect(Number(await food.getAttribute('aria-valuenow'))).toBeLessThan(25);
    await tapWorld(page, bowlTapPoint());
    await expect(food).toHaveAttribute('aria-valuenow', /^(9\d|100)$/);
  });

  test('a treat costs coins and cheers the animal up', async ({ page }) => {
    await seedSave(
      page,
      buildSave((s, now) =>
        s.world.animals.push(testAnimal(now, { needs: { hunger: 80, happiness: 30 } })),
      ),
    );
    await page.goto('./');
    await canvasReady(page);
    const card = await openCard(page);
    await press(page, card.getByRole('button', { name: /treat for 5/i }));
    await expect(page.getByTestId('coins')).toHaveText('95');
    const happy = card.getByRole('meter', { name: 'Happy' });
    expect(Number(await happy.getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(54);
  });

  test('neglect lowers the price and care raises it', async ({ page }) => {
    await seedSave(
      page,
      buildSave((s, now) => {
        // An empty bowl, or the starving animal would (rightly) walk off to eat.
        s.world.placedItems.find((p) => p.itemId === 'food_bowl')!.servings = 0;
        s.world.animals.push(
          testAnimal(now, {
            rarity: 'rare',
            careHistory: [0, 0, 0],
            needs: { hunger: 0, happiness: 0 },
          }),
        );
      }),
    );
    await page.goto('./');
    await canvasReady(page);
    const card = await openCard(page);
    await expect(card.getByRole('button', { name: /sell for 80/i })).toBeVisible();
    await expect(card.getByTestId('care-bonus')).toContainText('Needs care -20%');
  });

  test('names an animal; the name is checked and survives a reload', async ({ page }) => {
    await seedSave(
      page,
      buildSave((s, now) => s.world.animals.push(testAnimal(now))),
    );
    await page.goto('./');
    await canvasReady(page);
    let card = await openCard(page);
    await press(page, card.getByRole('button', { name: /tap to rename/i }));
    const input = card.getByRole('textbox', { name: 'New name' });
    await input.fill('Stupid');
    await press(page, card.getByRole('button', { name: 'Save name' }));
    await expect(card.getByText('Let’s pick a kinder name!')).toBeVisible();
    await input.fill('Biscuit');
    await press(page, card.getByRole('button', { name: 'Save name' }));
    card = page.getByRole('complementary', { name: /biscuit card/i });
    await expect(card).toBeVisible();
    await expect(card.getByText('Bunny', { exact: true })).toBeVisible();

    await page.waitForTimeout(300); // renames save right away
    await page.reload();
    await canvasReady(page);
    await openCard(page, /biscuit card/i);
  });
});
