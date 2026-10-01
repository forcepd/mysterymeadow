import { describe, expect, it } from 'vitest';
import { QualityGovernor } from '../../../src/world3d/quality';

/** Feeds `ms`-long frames for `forMs` and returns every change. */
function run(q: QualityGovernor, ms: number, forMs: number): number[] {
  const changes: number[] = [];
  for (let t = 0; t < forMs; t += ms) {
    const r = q.frame(ms);
    if (r !== null) changes.push(r);
  }
  return changes;
}

describe('quality governor', () => {
  it('starts as sharp as the screen allows (up to 2x)', () => {
    expect(new QualityGovernor(3).pixelRatio).toBe(2);
    expect(new QualityGovernor(2).pixelRatio).toBe(2);
    expect(new QualityGovernor(1).pixelRatio).toBe(1);
  });

  it('keeps full sharpness while frames are smooth', () => {
    const q = new QualityGovernor(2);
    expect(run(q, 16.7, 20_000)).toEqual([]);
    expect(q.pixelRatio).toBe(2);
  });

  it('steps down when frames stay slow, one step at a time, settling in between', () => {
    const q = new QualityGovernor(2);
    // A short hiccup doesn't count.
    expect(run(q, 40, 1000)).toEqual([]);
    expect(run(q, 40, 3000)).toEqual([1.5]);
    // Still slow: the next step, but only after settling.
    expect(run(q, 40, 10_000)).toEqual([1.25, 1]);
    expect(q.pixelRatio).toBe(1);
    // Never below 1.
    expect(run(q, 40, 10_000)).toEqual([]);
  });

  it('steps back up when frames have been fast for a while', () => {
    const q = new QualityGovernor(2);
    run(q, 40, 4000);
    expect(q.pixelRatio).toBe(1.5);
    expect(run(q, 8, 12_000)).toEqual([2]);
    // Not past the screen's own sharpness.
    expect(run(q, 8, 20_000)).toEqual([]);
  });

  it('ignores long gaps (a hidden tab) and bad numbers', () => {
    const q = new QualityGovernor(2);
    for (let i = 0; i < 50; i++) expect(q.frame(5000)).toBeNull();
    expect(q.frame(0)).toBeNull();
    expect(q.frame(-5)).toBeNull();
    expect(q.pixelRatio).toBe(2);
  });
});
