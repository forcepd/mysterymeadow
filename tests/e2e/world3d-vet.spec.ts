import { expect, test, type Page } from '@playwright/test';
import type { Sickness } from '../../src/sim/types';
import { buildSave, canvasReady, press, seedSave, testAnimal } from './helpers';
import { tapAt, whereIs } from './helpers3d';

/** Phase 3D-5: the Vet Clinic in 3D (`?3d`), the original's vet flows. */

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

async function startWithSickBunny(page: Page, coins: number, sickness: Partial<Sickness> = {}) {
  await seedSave(
    page,
    buildSave((s, now) => {
      s.world.coins = coins;
      s.world.settings.sicknessEnabled = false;
      s.world.animals.push(
        testAnimal(now, { id: 'a1', sickness: { illnessId: 'sniffles', since: now, ...sickness } }),
      );
    }),
  );
  await page.goto('./?3d');
  await canvasReady(page);
}

async function openCard(page: Page) {
  await tapAt(page, await whereIs(page, 'animal', 'a1'));
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
  return clinic;
}

const tool = (page: Page, id: string) => page.getByTestId(`vet-tool-${id}`);

test.describe('3D Vet Clinic', () => {
  test('pay the fee, find clues with a tool, a wrong treatment, then the cure', async ({
    page,
  }) => {
    await startWithSickBunny(page, 100);
    const clinic = await openClinic(page, /go to vet for 20/i);
    await expect(page.getByTestId('coins')).toHaveText('80');
    // The patient is on the table.
    expect(await page.evaluate(() => window.meadow3d!.projectPatient())).not.toBeNull();

    await press(page, tool(page, 'magnifier'));
    await expect(clinic.getByText('A drippy nose')).toBeVisible();

    await press(page, clinic.getByRole('button', { name: 'Bandage' }));
    await expect(clinic.getByText('Hmm, that didn’t work. Look at the clues again.')).toBeVisible();
    await press(page, clinic.getByRole('button', { name: 'Medicine Drops' }));
    await expect(clinic.getByText('Bunny is all better!')).toBeVisible();
    await expect(page.getByTestId('coins')).toHaveText('60');

    await press(page, clinic.getByRole('button', { name: /back to the yard/i }));
    await expect(page.getByTestId('game-canvas')).toHaveAttribute('data-scene', 'yard');
    await expect(tool(page, 'magnifier')).toBeHidden();
    expect(await page.evaluate(() => window.meadow3d!.projectPatient())).toBeNull();
    const card = await openCard(page);
    await expect(card.getByTestId('sick-status')).toBeHidden();
  });

  test('dragging a tool onto the patient examines it; dropping it elsewhere does not', async ({
    page,
  }) => {
    await startWithSickBunny(page, 100, { illnessId: 'spotty_fever' });
    const clinic = await openClinic(page, /go to vet for 20/i);
    const box = (await tool(page, 'thermometer').boundingBox())!;
    const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const drag = async (to: { x: number; y: number }) => {
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(to.x, to.y, { steps: 10 });
      await page.mouse.up();
    };
    // Dropped out on the floor, well away from the patient: it goes back, nothing found.
    const patient = (await page.evaluate(() => window.meadow3d!.projectPatient()))!;
    await drag({ x: patient.x + 330, y: from.y - 30 });
    await page.waitForTimeout(400);
    await expect(clinic.getByText('Very hot!')).toBeHidden();
    // Dropped on the patient: examined.
    await drag(patient);
    await expect(clinic.getByText('Very hot!')).toBeVisible();
  });

  test('nothing covers the exam tools, and they are big enough to tap', async ({ page }) => {
    await startWithSickBunny(page, 100);
    await openClinic(page, /go to vet for 20/i);
    await expect(page.getByRole('navigation', { name: 'Menu' })).toBeHidden();
    for (const id of ['stethoscope', 'thermometer', 'magnifier']) {
      const t = tool(page, id);
      await expect(t).toBeVisible();
      const b = (await t.boundingBox())!;
      expect(b.width).toBeGreaterThanOrEqual(48);
      expect(b.height).toBeGreaterThanOrEqual(48);
      const onTop = await page.evaluate(
        ([x, y]) =>
          document.elementFromPoint(x!, y!)?.closest('[data-testid]')?.getAttribute('data-testid'),
        [b.x + b.width / 2, b.y + b.height / 2],
      );
      expect(onTop).toBe(`vet-tool-${id}`);
    }
  });

  test('Free Clinic at 0 coins: while waiting, the tools rest', async ({ page }) => {
    await startWithSickBunny(page, 0);
    const clinic = await openClinic(page, /free clinic/i);
    await expect(clinic.getByTestId('clinic-waiting')).toBeVisible();
    await expect(tool(page, 'magnifier')).toHaveAttribute('data-dim', 'true');
    await press(page, tool(page, 'magnifier'));
    await expect(clinic.getByText(/still in the waiting room/i)).toBeVisible();
  });
});
