import { expect, test, type Page } from '@playwright/test';
import { EXAM_TOOLS, ILLNESSES, getTreatment } from '../../src/config/illnesses';
import { VET_LAYOUT, WORLD_WIDTH, vetToolPoint } from '../../src/game/layout';
import type { Sickness } from '../../src/sim/types';
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

async function startWithSickBunny(page: Page, coins: number, sickness: Partial<Sickness> = {}) {
  await seedSave(
    page,
    buildSave((s, now) => {
      s.world.coins = coins;
      s.world.settings.sicknessEnabled = false; // Only the illness we set up.
      s.world.animals.push(
        testAnimal(now, { sickness: { illnessId: 'sniffles', since: now, ...sickness } }),
      );
    }),
  );
  await page.goto('./');
  await canvasReady(page);
}

async function openCard(page: Page) {
  await tapWorld(page, animalTapPoint(CENTER));
  const card = page.getByRole('complementary', { name: /bunny card/i });
  await expect(card).toBeVisible();
  return card;
}

async function openClinic(page: Page, button: RegExp) {
  const card = await openCard(page);
  await press(page, card.getByRole('button', { name: button }));
  await expect(page.getByTestId('game-canvas')).toHaveAttribute('data-scene', 'vet');
  const clinic = page.getByRole('complementary', { name: 'Vet Clinic' });
  await expect(clinic).toBeVisible();
  await page.waitForTimeout(200); // Let the scene take input.
  return clinic;
}

async function useTool(page: Page, toolId: string) {
  await tapWorld(page, vetToolPoint(EXAM_TOOLS.findIndex((t) => t.id === toolId)));
}

test.describe('health and vet', () => {
  test('a sick animal shows its symptom and can’t be sold', async ({ page }) => {
    await startWithSickBunny(page, 100);
    const card = await openCard(page);
    await expect(card.getByTestId('sick-status')).toContainText('Sneezing a lot');
    const sell = card.getByRole('button', { name: /sell for/i });
    await expect(sell).toHaveAttribute('aria-disabled', 'true');
    await press(page, sell, { force: true }); // Looks disabled, but explains why when tapped.
    await expect(card.getByText('Too sick to sell. Visit the vet!')).toBeVisible();
  });

  test('nothing covers the exam tools (the menu steps aside in the clinic)', async ({ page }) => {
    await startWithSickBunny(page, 100);
    await expect(page.getByRole('navigation', { name: 'Menu' })).toBeVisible();
    await openClinic(page, /go to vet for 20/i);
    await expect(page.getByRole('navigation', { name: 'Menu' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Settings' })).toBeHidden();
    // Every corner of every tool button is the game canvas, not a UI element on top.
    const box = (await page.locator('[data-testid="game-canvas"] canvas').boundingBox())!;
    const scale = box.width / WORLD_WIDTH;
    const { width, height } = VET_LAYOUT.tools;
    for (let i = 0; i < EXAM_TOOLS.length; i++) {
      const c = vetToolPoint(i);
      for (const [dx, dy] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ] as const) {
        const x = box.x + (c.x + dx * (width / 2 - 8)) * scale;
        const y = box.y + (c.y + dy * (height / 2 - 8)) * scale;
        const tag = await page.evaluate(
          ([px, py]) => document.elementFromPoint(px!, py!)?.tagName,
          [x, y],
        );
        expect(tag, `tool ${i} corner ${dx},${dy}`).toBe('CANVAS');
      }
    }
    // Back in the yard, the menu returns.
    await press(page, page.getByRole('button', { name: 'Back to the yard' }));
    await expect(page.getByRole('navigation', { name: 'Menu' })).toBeVisible();
  });

  test('pay the fee, find clues, a wrong treatment, then the cure', async ({ page }) => {
    await startWithSickBunny(page, 100);
    const clinic = await openClinic(page, /go to vet for 20/i);
    await expect(page.getByTestId('coins')).toHaveText('80');
    await expect(clinic.getByTestId('visit-type')).toContainText('Visit paid');

    await useTool(page, 'magnifier');
    await expect(clinic.getByText('A drippy nose')).toBeVisible();

    await press(page, clinic.getByRole('button', { name: 'Bandage' }));
    await expect(clinic.getByText('Hmm, that didn’t work. Look at the clues again.')).toBeVisible();
    await expect(page.getByTestId('coins')).toHaveText('70');

    await press(page, clinic.getByRole('button', { name: 'Medicine Drops' }));
    await expect(clinic.getByText('Bunny is all better!')).toBeVisible();
    await expect(page.getByTestId('coins')).toHaveText('60');

    await press(page, clinic.getByRole('button', { name: /back to the yard/i }));
    await expect(page.getByTestId('game-canvas')).toHaveAttribute('data-scene', 'yard');
    const card = await openCard(page);
    await expect(card.getByTestId('sick-status')).toBeHidden();
    await press(page, card.getByRole('button', { name: /sell for/i }));
    await expect(page.getByTestId('coins')).not.toHaveText('60');
  });

  test('a tricky case: two illnesses, found and fixed one at a time', async ({ page }) => {
    await startWithSickBunny(page, 200, { secondIllnessId: 'spotty_fever' });
    const card = await openCard(page);
    await expect(card.getByTestId('sick-status')).toContainText('and');
    await press(page, card.getByRole('button', { name: /go to vet for 20/i }));
    const clinic = page.getByRole('complementary', { name: 'Vet Clinic' });
    await expect(clinic.getByTestId('tricky-case')).toContainText('Two things are wrong');
    await page.waitForTimeout(200);

    await useTool(page, 'magnifier');
    await expect(clinic.getByText('A drippy nose')).toBeVisible();
    await expect(clinic.getByText('Little red spots')).toBeVisible();

    await press(page, clinic.getByRole('button', { name: 'Cool Pack' }));
    await expect(clinic.getByText(/fixed one thing! One more to go/)).toBeVisible();
    await expect(clinic.getByTestId('tricky-case')).toBeHidden();
    // A fresh notebook: the red spots are gone, the drippy nose is still there.
    await useTool(page, 'magnifier');
    await expect(clinic.getByText('A drippy nose')).toBeVisible();
    await expect(clinic.getByText('Little red spots')).toBeHidden();

    await press(page, clinic.getByRole('button', { name: 'Medicine Drops' }));
    await expect(clinic.getByText('Bunny is all better!')).toBeVisible();
    await expect(page.getByTestId('coins')).toHaveText(String(200 - 20 - 2 * 10));
  });

  test('dragging a tool onto the patient examines it; dropping it elsewhere does not', async ({
    page,
  }) => {
    await startWithSickBunny(page, 100, { illnessId: 'spotty_fever' });
    const clinic = await openClinic(page, /go to vet for 20/i);
    const box = (await page.locator('[data-testid="game-canvas"] canvas').boundingBox())!;
    const scale = box.width / WORLD_WIDTH;
    const toScreen = (p: { x: number; y: number }) => ({
      x: box.x + p.x * scale,
      y: box.y + p.y * scale,
    });
    const drag = async (from: { x: number; y: number }, to: { x: number; y: number }) => {
      const a = toScreen(from);
      const b = toScreen(to);
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      await page.mouse.move(b.x, b.y, { steps: 12 });
      await page.mouse.up();
    };
    const thermometer = vetToolPoint(EXAM_TOOLS.findIndex((t) => t.id === 'thermometer'));
    // Dropped in an empty corner: goes back to the tray, no clue.
    await drag(thermometer, { x: 60, y: 760 });
    await page.waitForTimeout(400);
    await expect(clinic.getByText('Very hot!')).toBeHidden();
    // Dropped on the patient.
    const { x, y } = VET_LAYOUT.patient;
    await drag(thermometer, { x, y: y - 60 });
    await expect(clinic.getByText('Very hot!')).toBeVisible();
  });

  test('a paid visit survives a reload (no second fee)', async ({ page }) => {
    await startWithSickBunny(page, 100);
    await openClinic(page, /go to vet for 20/i);
    await expect(page.getByTestId('coins')).toHaveText('80');
    await page.reload();
    await canvasReady(page);
    const clinic = await openClinic(page, /back to the vet/i);
    await expect(page.getByTestId('coins')).toHaveText('80');
    await useTool(page, 'thermometer');
    await expect(clinic.getByText('Just a tiny bit warm')).toBeVisible();
  });

  test('Free Clinic at 0 coins: a short wait, then free treatments', async ({ page }) => {
    await startWithSickBunny(page, 0);
    const clinic = await openClinic(page, /free clinic/i);
    await expect(clinic.getByTestId('clinic-waiting')).toBeVisible();
    await expect(clinic.getByTestId('visit-type')).toContainText('Free Clinic');
    await useTool(page, 'magnifier');
    await expect(clinic.getByText(/still in the waiting room/i)).toBeVisible();
    await expect(page.getByTestId('coins')).toHaveText('0');
  });

  test('when the Free Clinic wait is over, the cure is free', async ({ page }) => {
    // Checked in at the Free Clinic a while ago; the vet is ready in 2 seconds.
    await startWithSickBunny(page, 0, { visit: 'free', atClinicUntil: Date.now() + 2000 });
    const clinic = await openClinic(page, /back to the vet/i);
    await expect(clinic.getByRole('button', { name: 'Medicine Drops' })).toBeVisible({
      timeout: 10_000,
    });
    await expect(clinic.getByText('Free', { exact: true })).toBeVisible();
    await press(page, clinic.getByRole('button', { name: 'Medicine Drops' }));
    await expect(clinic.getByText('Bunny is all better!')).toBeVisible();
    await expect(page.getByTestId('coins')).toHaveText('0');
  });

  for (const illness of ILLNESSES) {
    test(`diagnose and cure ${illness.name} from the clues`, async ({ page }) => {
      await startWithSickBunny(page, 1000, { illnessId: illness.id });
      const clinic = await openClinic(page, /go to vet/i);
      const clueList = clinic.getByRole('region', { name: 'Clues' }).getByRole('listitem');
      for (const [i, tool] of EXAM_TOOLS.entries()) {
        await useTool(page, tool.id);
        await expect(clueList).toHaveCount(
          EXAM_TOOLS.slice(0, i + 1).reduce((n, t) => n + illness.clues[t.id]!.length, 0),
        );
      }
      // Like a player: match what the clues say against what each illness looks like.
      const seen = new Set((await clueList.allTextContents()).map((t) => t.trim()));
      const diagnosis = ILLNESSES.filter((i) =>
        EXAM_TOOLS.every((t) =>
          i.clues[t.id]!.every((c) => [...seen].some((s) => s.endsWith(c.text))),
        ),
      );
      expect(diagnosis.map((d) => d.id)).toEqual([illness.id]);
      const cure = getTreatment(diagnosis[0]!.treatmentId)!;
      await press(page, clinic.getByRole('button', { name: cure.name }));
      await expect(clinic.getByText('Bunny is all better!')).toBeVisible();
    });
  }
});
