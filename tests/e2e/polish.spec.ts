import { expect, test } from './fixtures2d';
import {
  animalTapPoint,
  audit,
  buildSave,
  canvasReady,
  gateTapPoint,
  press,
  seedSave,
  tapWorld,
  testAnimal,
  testVisitor,
} from './helpers';

test.describe('sound (DESIGN 16.3)', () => {
  test('taps start the sound without errors; mute and volumes are saved', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await seedSave(
      page,
      buildSave(() => {}),
    );
    await page.goto('./');
    await canvasReady(page);
    // The first tap unlocks audio (iOS needs a user gesture).
    await tapWorld(page, { x: 640, y: 600 });

    await press(page, page.getByRole('button', { name: 'Settings' }));
    const screen = page.getByRole('dialog', { name: 'Settings' });
    const music = screen.getByLabel('🎵 Music');
    const sounds = screen.getByLabel('🔊 Sounds');
    await expect(music).toHaveValue('10');
    await music.fill('3');
    await sounds.fill('0');
    await expect(sounds).toHaveAttribute('aria-valuetext', 'Off');
    const mute = screen.getByLabel('🔇 All sounds off');
    await press(page, mute);
    await expect(mute).toBeChecked();
    await expect(music).toBeDisabled();
    await page.waitForTimeout(300); // Settings save right away.

    await page.reload();
    await canvasReady(page);
    await press(page, page.getByRole('button', { name: 'Settings' }));
    await expect(screen.getByLabel('🔇 All sounds off')).toBeChecked();
    await expect(screen.getByLabel('🎵 Music')).toHaveValue('3');
    await expect(screen.getByLabel('🔊 Sounds')).toHaveValue('0');
    expect(errors).toEqual([]);
  });

  test('audio starts on the first tap and a reveal makes a sound', async ({ page }) => {
    // Count what the game asks Web Audio for, without changing how it works.
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      const Base = window.AudioContext;
      w.__oscillators = 0;
      window.AudioContext = class extends Base {
        constructor(options?: AudioContextOptions) {
          super(options);
          w.__audio = this;
        }
        override createOscillator() {
          w.__oscillators = (w.__oscillators as number) + 1;
          return super.createOscillator();
        }
      };
    });
    await seedSave(
      page,
      buildSave((s, now) => {
        s.world.nextVisitorAt = now + 99 * 3_600_000;
        s.world.gateQueue.push(testVisitor(now));
      }),
    );
    await page.goto('./');
    await canvasReady(page);
    // Nothing plays before the first tap (iOS rule).
    expect(await page.evaluate(() => (window as unknown as { __audio?: unknown }).__audio)).toBe(
      undefined,
    );
    await tapWorld(page, gateTapPoint(0));
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as { __audio?: AudioContext }).__audio?.state),
      )
      .toBe('running');
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as { __oscillators: number }).__oscillators),
      )
      .toBeGreaterThan(3);
  });
});

test.describe('while you were away (DESIGN 14)', () => {
  test('coming back after a while shows good news, then play', async ({ page }) => {
    await seedSave(
      page,
      buildSave((s, now) => {
        // Last played 2 hours ago; a visitor was due right after.
        s.meta.lastSeenAt = now - 2 * 3_600_000;
        s.world.nextVisitorAt = now - 2 * 3_600_000 + 60_000;
      }),
    );
    await page.goto('./');
    await canvasReady(page);
    const card = page.getByRole('dialog', { name: /while you were away/i });
    await expect(card).toBeVisible();
    await expect(card).toContainText('You were gone 2 hours.');
    await expect(card).toContainText('waiting at the gate');
    await expect(card).toContainText('Nobody got hungry or sick');
    await press(page, card.getByRole('button', { name: /let’s play/i }));
    await expect(card).toBeHidden();
  });

  test('a quick reload shows no card', async ({ page }) => {
    await seedSave(
      page,
      buildSave(() => {}),
    );
    await page.goto('./');
    await canvasReady(page);
    await expect(page.getByRole('dialog', { name: /while you were away/i })).toHaveCount(0);
  });
});

test.describe('accessibility pass (DESIGN 17.5)', () => {
  test('main screens: big enough targets, every control named', async ({ page }) => {
    test.setTimeout(90_000); // It visits 9 screens.
    await seedSave(
      page,
      buildSave((s, now) => {
        s.world.coins = 500;
        s.world.settings.sicknessEnabled = false;
        s.world.animals.push(
          testAnimal(now, {
            isKept: true,
            tricks: { known: ['sit'], progress: {}, nextTrainAt: now },
            sickness: { illnessId: 'sniffles', since: now },
          }),
        );
      }),
    );
    await page.goto('./');
    await canvasReady(page);
    await audit(page, 'world');

    const menu = page.getByRole('navigation', { name: 'Menu' });
    const close = async () => {
      await press(page, page.getByRole('button', { name: 'Close' }).last());
    };
    for (const [button, where] of [
      [/pets/i, 'pets'],
      [/dex/i, 'dex'],
      [/store/i, 'store'],
      [/real estate/i, 'real estate'],
    ] as const) {
      await press(page, menu.getByRole('button', { name: button }));
      await audit(page, where);
      await close();
    }
    await press(page, page.getByRole('button', { name: 'Settings' }));
    await audit(page, 'settings');
    await close();
    await press(page, page.getByRole('button', { name: /my style/i }));
    await audit(page, 'style');
    await close();
    await press(page, page.getByTestId('goals-button'));
    await audit(page, 'goals');
    await close();

    await tapWorld(page, animalTapPoint({ x: 0.5, y: 0.5 }));
    const card = page.getByRole('complementary', { name: /bunny card/i });
    await expect(card).toBeVisible();
    await audit(page, 'animal card');
    await press(page, card.getByRole('button', { name: /go to vet/i }));
    await expect(page.getByRole('complementary', { name: 'Vet Clinic' })).toBeVisible();
    await audit(page, 'vet clinic');
  });

  test('the in-game "Less motion" setting calms the screens too', async ({ page }) => {
    await seedSave(
      page,
      buildSave((s) => {
        s.world.settings.reducedMotion = true;
      }),
    );
    await page.goto('./');
    await canvasReady(page);
    await expect(page.locator('[data-reduced-motion="true"]')).toHaveCount(1);
  });
});
