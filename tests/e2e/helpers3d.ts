import { expect, type Page } from '@playwright/test';
import type { PickKind } from '../../src/world3d/pick';
import type {} from '../../src/world3d/testHooks';
import { press } from './helpers';

/** Helpers for the 3D world, where the camera can move: find things by projecting. */

export const canvas = (page: Page) => page.locator('[data-testid="game-canvas"] canvas');

/** Where something tappable is on the page right now. */
export async function whereIs(page: Page, kind: PickKind, id: string) {
  const p = await page.evaluate(([k, i]) => window.meadow3d!.projectObject(k, i), [kind, id] as [
    PickKind,
    string,
  ]);
  expect(p, `${kind} ${id} is on screen`).not.toBeNull();
  return p!;
}

/** Where a world-pixel spot (the original's 1280x800 layout) is on the page right now. */
export async function whereWorld(page: Page, p: { x: number; y: number }, height = 0) {
  const at = await page.evaluate(([q, h]) => window.meadow3d!.projectWorld(q, h), [p, height] as [
    { x: number; y: number },
    number,
  ]);
  expect(at, `${p.x},${p.y} is on screen`).not.toBeNull();
  return at!;
}

/** Taps a page point on the canvas (touch on iPads, mouse on desktop). */
export async function tapAt(page: Page, at: { x: number; y: number }) {
  const box = (await canvas(page).boundingBox())!;
  await press(page, canvas(page), { position: { x: at.x - box.x, y: at.y - box.y } });
}

/** Drags across the canvas with the mouse, in steps (pointer events on every device). */
export async function drag(
  page: Page,
  from: { x: number; y: number },
  by: { x: number; y: number },
) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(from.x + (by.x * i) / 10, from.y + (by.y * i) / 10);
  }
  await page.mouse.up();
}

/** Presses and holds with the mouse (pointer events on every device). */
export async function holdAt(page: Page, at: { x: number; y: number }, ms = 800) {
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

export const view = (page: Page) => page.evaluate(() => window.meadow3d!.view());

/** Empty grass in the middle of the yard, below the fence and between the animals. */
export async function emptyGround(page: Page) {
  return whereWorld(page, { x: 330, y: 620 });
}
