import { expect, test, type Page } from './fixtures2d';
import { SPECIES } from '../../src/config/species';
import { dayKey } from '../../src/sim/systems/tricks';
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
const CUE_NAMES: Record<string, string> = {
  left: 'Left',
  up: 'Up',
  right: 'Right',
  down: 'Down',
  tap: 'Star',
};

async function start(
  page: Page,
  animal: Partial<Animal> = {},
  edit: (s: SimState, now: number) => void = () => {},
) {
  await seedSave(
    page,
    buildSave((s, now) => {
      s.world.settings.sicknessEnabled = false;
      s.world.nextVisitorAt = now + 99 * 3_600_000;
      s.world.animals.push(
        testAnimal(now, { name: 'Pip', nextWanderAt: now + 3_600_000, ...animal }),
      );
      edit(s, now);
    }),
  );
  await page.goto('./');
  await canvasReady(page);
}

async function openCard(page: Page) {
  await tapWorld(page, animalTapPoint(CENTER));
  const card = page.getByRole('complementary', { name: /pip card/i });
  await expect(card).toBeVisible();
  return card;
}

async function openTraining(page: Page) {
  const card = await openCard(page);
  await press(page, card.getByRole('button', { name: /train/i }));
  const screen = page.getByRole('dialog', { name: 'Training' });
  await expect(screen).toBeVisible();
  return screen;
}

/** Plays one Simon-says round: watches the animal, then repeats (or fumbles) the cues. */
async function playRound(page: Page, screen: ReturnType<Page['getByRole']>, mistake = false) {
  await expect(screen.getByTestId('training-say')).toContainText('Your turn', { timeout: 15_000 });
  const sequence = (await screen.getByLabel('Cues').getAttribute('data-sequence'))!.split(',');
  expect(sequence.length).toBeGreaterThanOrEqual(3);
  expect(sequence.length).toBeLessThanOrEqual(5);
  for (const [i, cue] of sequence.entries()) {
    const pressCue = mistake && i === 0 ? (sequence[0] === 'up' ? 'down' : 'up') : cue;
    await press(page, screen.getByRole('button', { name: CUE_NAMES[pressCue!]!, exact: true }));
    if (mistake) break;
  }
  return sequence;
}

test.describe('tricks (DESIGN 11)', () => {
  test('train a trick over 3 sessions (5 minutes apart) and earn 5 gems', async ({ page }) => {
    test.setTimeout(90_000);
    await page.clock.install();
    await start(page);
    let screen = await openTraining(page);
    const lengths: number[] = [];
    for (let session = 1; session <= 3; session++) {
      await press(page, screen.getByRole('button', { name: /^Sit/ }));
      lengths.push((await playRound(page, screen)).length);
      if (session < 3) {
        await expect(screen.getByText(/Great job!/)).toContainText('needs a rest');
        await press(page, screen.getByRole('button', { name: 'Back to tricks' }));
        await expect(screen.getByText(/is resting/)).toBeVisible();
        await press(page, screen.getByRole('button', { name: 'Close' }));
        await page.clock.fastForward('05:01');
        screen = await openTraining(page);
      }
    }
    expect(lengths).toEqual([3, 4, 5]);
    await expect(screen.getByText('Pip learned Sit! +5 💎')).toBeVisible();
    await expect(page.getByTestId('gems')).toHaveText('55');
    await press(page, screen.getByRole('button', { name: 'Close' }));
    const card = await openCard(page);
    await expect(card.getByTestId('tricks-status')).toContainText('Tricks: Sit (1/2)');
  });

  test('a mistake: try again right away, no waiting', async ({ page }) => {
    await start(page);
    const screen = await openTraining(page);
    await press(page, screen.getByRole('button', { name: /^Wave/ }));
    await playRound(page, screen, true);
    await expect(screen.getByText(/Almost! Pip got mixed up/)).toBeVisible();
    await press(page, screen.getByRole('button', { name: /try again/i }));
    await playRound(page, screen);
    await expect(screen.getByText(/Great job!/)).toBeVisible();
  });

  test('the daily trick-gem cap: the trick is learned, but no gems today', async ({ page }) => {
    await start(
      page,
      { tricks: { known: [], progress: { jump: 2 }, nextTrainAt: 0 } },
      (s, now) => {
        s.meta.dailyTrickGems = { date: dayKey(now), earned: 40 };
      },
    );
    const screen = await openTraining(page);
    await expect(screen.getByTestId('trick-gems-left')).toContainText('0 trick gems left today');
    await press(page, screen.getByRole('button', { name: /^Jump/ }));
    await playRound(page, screen);
    await expect(screen.getByText(/Pip learned Jump! \(No more trick gems today/)).toBeVisible();
    await expect(page.getByTestId('gems')).toHaveText('50');
  });

  test('a sick animal can’t train', async ({ page }) => {
    await start(page, { sickness: { illnessId: 'sniffles', since: 0 } });
    const screen = await openTraining(page);
    const sit = screen.getByRole('button', { name: /^Sit/ });
    await expect(sit).toHaveAttribute('aria-disabled', 'true');
    await press(page, sit, { force: true }); // Looks disabled, but explains why when tapped.
    await expect(screen.getByText('Too sick to train. Visit the vet!')).toBeVisible();
  });

  test('a kept pet performs a trick it knows for a happiness boost', async ({ page }) => {
    await start(page, {
      isKept: true,
      needs: { hunger: 100, happiness: 50 },
      tricks: { known: ['spin'], progress: {}, nextTrainAt: 0 },
    });
    const card = await openCard(page);
    const happy = card.getByRole('meter', { name: 'Happy' });
    const before = Number(await happy.getAttribute('aria-valuenow'));
    await press(
      page,
      card.getByRole('group', { name: 'Perform a trick' }).getByRole('button', { name: /spin/i }),
    );
    await expect
      .poll(async () => Number(await happy.getAttribute('aria-valuenow')))
      .toBeGreaterThanOrEqual(before + 9);
  });
});

test.describe('pet outfits (DESIGN 10.3)', () => {
  test('buy in the Pet Boutique, dress a pet, and keep the outfit after a sale', async ({
    page,
  }) => {
    await start(page, {}, (s, now) =>
      s.world.animals.push(
        testAnimal(now, { id: 'a2', name: 'Moss', position: { x: 0.15, y: 0.9 } }),
      ),
    );
    await press(
      page,
      page.getByRole('navigation', { name: 'Menu' }).getByRole('button', { name: /store/i }),
    );
    const store = page.getByRole('dialog', { name: 'Home Store' });
    await press(page, store.getByRole('tab', { name: /pet boutique/i }));
    await press(page, store.getByRole('article', { name: 'Party Hat' }).getByRole('button'));
    await expect(store.getByText(/Party Hat is yours!/)).toBeVisible();
    await expect(page.getByTestId('coins')).toHaveText('60');
    await press(page, store.getByRole('button', { name: 'Close' }));

    let card = await openCard(page);
    await press(page, card.getByRole('button', { name: /dress/i }));
    const wardrobe = page.getByRole('dialog', { name: 'Pet wardrobe' });
    await press(
      page,
      wardrobe.getByRole('region', { name: 'Head' }).getByRole('button', { name: /party hat/i }),
    );
    await expect(wardrobe.getByLabel('Wearing')).toContainText('Party Hat');
    await press(page, wardrobe.getByRole('button', { name: 'Close' }));

    // Sell Pip: the hat is still yours, and Moss can wear it too.
    card = await openCard(page);
    await press(page, card.getByRole('button', { name: /sell for/i }));
    await expect(page.getByText(/went to a loving new home/)).toBeVisible();
    await tapWorld(page, animalTapPoint({ x: 0.15, y: 0.9 }));
    const moss = page.getByRole('complementary', { name: /moss card/i });
    await press(page, moss.getByRole('button', { name: /dress/i }));
    await expect(
      wardrobe.getByRole('region', { name: 'Head' }).getByRole('button', { name: /party hat/i }),
    ).toBeVisible();
  });

  test('every species can wear every kind of outfit without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const outfits = [
      { head: 'party_hat', body: 'hero_cape', face: 'star_shades' },
      { head: 'pet_crown', body: 'cozy_sweater', face: 'bandana' },
      { head: 'big_bow', body: 'pet_tutu', face: 'round_specs' },
      { head: 'flower_clip', body: 'warm_scarf', face: 'round_specs' },
    ];
    await seedSave(
      page,
      buildSave((s, now) => {
        s.world.settings.sicknessEnabled = false;
        SPECIES.forEach((sp, i) =>
          s.world.animals.push(
            testAnimal(now, {
              id: `s${i}`,
              speciesId: sp.id,
              variantId: sp.variants[0]!.id,
              position: { x: (i % 7) / 6, y: Math.floor(i / 7) / 2 },
              outfit: outfits[i % outfits.length]!,
            }),
          ),
        );
      }),
    );
    await page.goto('./');
    await canvasReady(page);
    await page.waitForTimeout(500);
    expect(errors).toEqual([]);
  });
});
