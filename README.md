# Mystery Meadow

A cozy, cartoon pet-collecting browser game for kids, in 3D (Three.js). The spec is in [`docs/DESIGN.md`](docs/DESIGN.md), the 3D decisions are in [`docs/DESIGN-3D.md`](docs/DESIGN-3D.md), and build status is in [`docs/PROGRESS.md`](docs/PROGRESS.md).

## The two worlds

The game opens in the **3D world**. The original's **classic 2D world** (Phaser) is still in, for fun: turn on **Settings → 🖼️ Classic 2D world**, which this device remembers, or open the game with `?2d`. (`?3d` forces 3D.) Both worlds play the same game from the same save; only the picture changes. Each world is its own lazy-loaded chunk, so a device only downloads the one it shows.

## Develop

Requires Node 24+ (see `.nvmrc`).

```sh
npm install
npx playwright install chromium webkit   # once, for e2e tests
npm run dev          # local dev server
npm test             # unit tests (Vitest)
npm run e2e          # e2e tests on desktop Chromium + iPad WebKit (builds first)
npm run perf         # frame-rate probe of a busy yard in both worlds (add --headed for a real GPU)
npm run build        # typecheck + production build into dist/
npm run lint         # ESLint
npm run format       # Prettier
npm run icons        # re-render PNG icons from public/icons/favicon.svg
```

To try it on an iPad on the same Wi-Fi: `npm run build && npx vite preview --host`, then open the printed network URL. The service worker and Home Screen install need HTTPS, so test those on the deployed site.

## Deploy

`.github/workflows/ci.yml` runs lint, format check, unit tests, build, and e2e on every push and PR. On pushes to `main` it also publishes `dist/` to GitHub Pages.

One-time setup:

1. Create a GitHub repo and push `main`.
2. In the repo, go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
3. (Optional) Custom domain: add it under Settings → Pages, create the DNS record, and turn on **Enforce HTTPS**.

The build uses relative paths (`base: './'`), so it works at `user.github.io/repo/`, on a custom domain, or on any other static HTTPS host (Netlify, Cloudflare Pages) without changes.
