import { expect, test } from '@playwright/test';
import { SPECIES } from '../../src/config/species';
import { buildSave, canvasReady, seedSave, testAnimal, testVisitor } from './helpers';
/**
 * Performance probe (DESIGN 18.5): a busy yard (24 animals, some in outfits or Sparkle, 3 gate
 * visitors, 6 poops), measuring frames for 5 seconds. Opt-in: `npm run perf`. THROTTLE=4 slows
 * Chromium's CPU (a rough stand-in for an older iPad); PROFILE=1 prints the hottest functions.
 * Headless browsers draw with a software GPU, so drawing costs far more here than on an iPad.
 */
test.skip(!process.env.PERF, 'Run with npm run perf');

test('a busy yard keeps up', async ({ page }, info) => {
  await seedSave(
    page,
    buildSave((s, now) => {
      s.world.settings.sicknessEnabled = false;
      s.world.nextVisitorAt = now + 99 * 3_600_000;
      for (let i = 0; i < 24; i++) {
        const sp = SPECIES[i % SPECIES.length]!;
        s.world.animals.push(
          testAnimal(now, {
            id: 'a' + i,
            speciesId: sp.id,
            variantId: sp.variants[0]!.id,
            isSparkle: i % 5 === 0,
            position: { x: (i % 8) / 7, y: Math.floor(i / 8) / 2 },
            outfit: i % 3 ? {} : { head: 'party_hat', body: 'hero_cape' },
            nextWanderAt: now + 1000 * i,
            needs: { hunger: i % 4 ? 100 : 10, happiness: 100 },
          }),
        );
      }
      for (let i = 0; i < 3; i++) s.world.gateQueue.push(testVisitor(now, { id: 'v' + i }));
      for (let i = 0; i < 6; i++)
        s.world.poops.push({
          id: 'p' + i,
          zone: 'yard',
          position: { x: i / 6, y: 0.8 },
          createdAt: now,
        });
    }),
  );
  await page.goto('./');
  await canvasReady(page);
  if (process.env.THROTTLE && info.project.name.includes('chromium')) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.THROTTLE) });
  }
  await page.waitForTimeout(1500);
  const stats = await page.evaluate(
    () =>
      new Promise<{ fps: number; worst: number; p95: number }>((resolve) => {
        const times: number[] = [];
        let last = performance.now();
        const start = last;
        const loop = (t: number) => {
          times.push(t - last);
          last = t;
          if (t - start < 5000) requestAnimationFrame(loop);
          else {
            const sorted = [...times].sort((a, b) => a - b);
            resolve({
              fps: times.length / 5,
              worst: sorted[sorted.length - 1]!,
              p95: sorted[Math.floor(sorted.length * 0.95)]!,
            });
          }
        };
        requestAnimationFrame(loop);
      }),
  );
  if (process.env.PROFILE && info.project.name.includes('chromium')) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
    await cdp.send('Profiler.start');
    await page.waitForTimeout(4000);
    const { profile } = await cdp.send('Profiler.stop');
    const self = new Map<string, number>();
    const byId = new Map(profile.nodes.map((n) => [n.id, n]));
    const counts = new Map<number, number>();
    for (const s of profile.samples ?? []) counts.set(s, (counts.get(s) ?? 0) + 1);
    let total = 0;
    for (const [id, c] of counts) {
      const n = byId.get(id)!;
      const cf = n.callFrame;
      const key = `${cf.functionName || '(anon)'} ${cf.url.split('/').pop()}:${cf.lineNumber}`;
      self.set(key, (self.get(key) ?? 0) + c);
      total += c;
    }
    const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);
    for (const [k, c] of top) console.log(((c / total) * 100).toFixed(1).padStart(5), k);
  }
  const heap = await page.evaluate(
    () =>
      (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ??
      0,
  );
  console.log(info.project.name, JSON.stringify(stats), 'heapMB', Math.round(heap / 1e6));
  if (!process.env.THROTTLE) expect(stats.fps).toBeGreaterThan(50);
});
