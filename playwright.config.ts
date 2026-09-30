import { defineConfig, devices } from '@playwright/test';

// Not vite preview's default (4173), so a preview you're running by hand is never reused.
const PORT = 4317;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // CI's runners draw without a GPU and are several times slower than a dev machine.
  timeout: process.env.CI ? 60_000 : 30_000,
  expect: { timeout: process.env.CI ? 10_000 : 5_000 },
  // CI's runner defaults to 1 worker (about 35 minutes for the suite); 2 roughly halves it.
  ...(process.env.CI ? { workers: 2 } : {}),
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: `http://localhost:${PORT}/` },
  // Smoke tests run against the production build, which is what ships.
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'ipad-webkit', use: { ...devices['iPad Mini landscape'] } },
    // Skipped on CI to keep it quick: it repeats WebKit at a larger size, and CI already covers
    // WebKit at the smallest target (iPad mini). Runs locally.
    ...(process.env.CI
      ? []
      : [{ name: 'ipad-pro-webkit', use: { ...devices['iPad Pro 11 landscape'] } }]),
  ],
});
