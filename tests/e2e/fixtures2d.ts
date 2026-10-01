import { test as base } from '@playwright/test';
import { WORLD_STYLE_KEY } from '../../src/ui/worldStyle';

export * from '@playwright/test';

/**
 * The original game's tests, run against the classic 2D world (`?2d`'s world): the device's
 * saved world choice is set to 2D before every page loads. The 3D world has its own specs.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript((key) => {
      try {
        localStorage.setItem(key, '2d');
      } catch {
        // No storage (shouldn't happen in tests).
      }
    }, WORLD_STYLE_KEY);
    await use(page);
  },
});
