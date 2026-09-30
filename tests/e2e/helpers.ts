import { expect, type Locator, type Page } from '@playwright/test';
import { gateSlot, tileToWorld, yardToWorld, WORLD_WIDTH } from '../../src/game/layout';
import { DEFAULT_PROFILE } from '../../src/bridge/gameSession';
import { makePin } from '../../src/profile/pin';
import type { DeviceRecord } from '../../src/save/device';
import { toSaveFile, type SaveFile } from '../../src/save/schema';
import { FakeClock } from '../../src/sim/clock';
import { GameSim } from '../../src/sim/GameSim';
import type { Animal, SimState, Visitor } from '../../src/sim/types';

/** Taps with touch on touch devices (iPad projects) and clicks with a mouse elsewhere. */
export async function press(
  page: Page,
  target: Locator,
  options: { position?: { x: number; y: number }; force?: boolean } = {},
) {
  const hasTouch = await page.evaluate(() => navigator.maxTouchPoints > 0);
  if (hasTouch) {
    await target.tap(options);
    return;
  }
  await target.click(options);
}

/** Waits for the world. Taps the profile first if the profile picker is showing. */
export async function canvasReady(page: Page) {
  const canvas = page.locator('[data-testid="game-canvas"] canvas');
  const firstProfile = page.getByRole('button', { name: /^Play as / }).first();
  await expect(canvas.or(firstProfile)).toBeVisible();
  if (await firstProfile.isVisible()) await press(page, firstProfile);
  await expect(canvas).toBeVisible();
  // Give Phaser a moment to boot its input system.
  await page.waitForFunction(() => {
    const c = document.querySelector('[data-testid="game-canvas"] canvas') as HTMLCanvasElement;
    return c && c.width > 0 && c.getBoundingClientRect().width > 0;
  });
  await expect(page.getByTestId('game-canvas')).toHaveAttribute('data-world-ready', 'true');
  await page.waitForTimeout(200);
}

/** Taps the canvas at a world coordinate (the 1280x800 logical world). */
export async function tapWorld(page: Page, world: { x: number; y: number }) {
  const canvas = page.locator('[data-testid="game-canvas"] canvas');
  const box = (await canvas.boundingBox())!;
  const scale = box.width / WORLD_WIDTH;
  await press(page, canvas, { position: { x: world.x * scale, y: world.y * scale } });
}

/** Presses and holds at a world coordinate (tap-and-hold). Uses the mouse on every device. */
export async function holdWorld(page: Page, world: { x: number; y: number }, ms = 800) {
  const canvas = page.locator('[data-testid="game-canvas"] canvas');
  const box = (await canvas.boundingBox())!;
  const scale = box.width / WORLD_WIDTH;
  const x = box.x + world.x * scale;
  const y = box.y + world.y * scale;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

export function bowlTapPoint(tile = { x: 1, y: 0 }) {
  const w = tileToWorld(tile);
  return { x: w.x, y: w.y + 5 };
}

export function poopTapPoint(p: { x: number; y: number }) {
  return yardToWorld(p);
}

/** Where to tap an animal whose normalized yard position is `p` (a bit above its feet). */
export function animalTapPoint(p: { x: number; y: number }) {
  const w = yardToWorld(p);
  return { x: w.x, y: w.y - 20 };
}

export function gateTapPoint(index = 0) {
  const s = gateSlot(index);
  return { x: s.x, y: s.y - 20 };
}

/** Builds a save "now" (browser and test share the machine clock) and lets a test edit it. */
export function buildSave(edit: (state: SimState, now: number) => void) {
  const now = Date.now();
  const sim = GameSim.newGame({ clock: new FakeClock(now), seed: 1 });
  const state = sim.toState();
  edit(state, now);
  return toSaveFile(DEFAULT_PROFILE, state);
}

export function testAnimal(now: number, overrides: Partial<Animal> = {}): Animal {
  return {
    id: 'a900',
    speciesId: 'bunny',
    variantId: 'white',
    isSparkle: false,
    rarity: 'common',
    arrivedAt: now - 30 * 60_000,
    holdUntil: now - 10 * 60_000,
    zone: 'yard',
    position: { x: 0.5, y: 0.5 },
    needs: { hunger: 100, happiness: 100 },
    // A care average of 40 maps to exactly 1.0x, so prices equal the base price.
    careHistory: [40],
    immunities: {},
    isKept: false,
    outfit: {},
    tricks: { known: [], progress: {}, nextTrainAt: now },
    nextPoopAt: now + 60 * 60_000,
    nextWanderAt: now + 60 * 60_000,
    nextPetAt: now,
    ...overrides,
  };
}

export function testVisitor(now: number, overrides: Partial<Visitor> = {}): Visitor {
  return {
    id: 'v900',
    arrivedAtGate: now,
    autoRevealAt: now + 5 * 60_000,
    leavesAt: now + 10 * 60_000,
    revealed: false,
    roll: {
      speciesId: 'fox',
      variantId: 'red',
      isSparkle: false,
      rarity: 'uncommon',
      litterSize: 0,
    },
    ...overrides,
  };
}

/** The Parent PIN every seeded device uses. */
export const TEST_PIN = '1234';

/**
 * Writes a save into IndexedDB (the same database idb-keyval uses) before the game loads,
 * plus a device record listing that profile with the Parent PIN set to TEST_PIN (so the
 * first-run PIN setup is skipped). Visits the privacy page first: same origin, but it doesn't
 * start a game. Pass `device: false` to write only the save (an install from before profiles).
 */
export async function seedSave(page: Page, save: SaveFile, options: { device?: boolean } = {}) {
  const device: DeviceRecord = {
    version: 1,
    profiles: [
      {
        id: save.profile.id,
        username: save.profile.username,
        avatar: save.profile.avatar,
        lastPlayedAt: save.meta.lastSeenAt,
      },
    ],
    pin: makePin(TEST_PIN, 'test-salt'),
  };
  await page.goto('./privacy.html');
  await page.evaluate(
    ({ file, device }) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('mystery-meadow-3d');
        open.onupgradeneeded = () => open.result.createObjectStore('saves');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction('saves', 'readwrite');
          tx.objectStore('saves').put(file, `profile:${file.profile.id}`);
          if (device) tx.objectStore('saves').put(device, 'device');
          tx.oncomplete = () => {
            open.result.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    { file: save, device: options.device === false ? null : device },
  );
}

/** Opens the game with a brand new default save (no onboarding). */
export async function openGame(page: Page) {
  await seedSave(
    page,
    buildSave(() => {}),
  );
  await page.goto('./');
  await canvasReady(page);
}
