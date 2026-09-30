import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/sim/rng';

const sample = (rng: Rng, n: number) => Array.from({ length: n }, () => rng.next());

describe('Rng', () => {
  it('produces the same sequence for the same seed', () => {
    expect(sample(new Rng(42), 50)).toEqual(sample(new Rng(42), 50));
  });

  it('produces different sequences for different seeds, including adjacent ones', () => {
    expect(sample(new Rng(1), 10)).not.toEqual(sample(new Rng(2), 10));
    expect(sample(new Rng(0), 10)).not.toEqual(sample(new Rng(1), 10));
  });

  it('matches a pinned sequence so saves stay reproducible across versions', () => {
    const rng = new Rng(12345);
    const first = Array.from({ length: 3 }, () => rng.nextUint32());
    // If this changes, every saved seed would replay differently. Don't change the algorithm
    // without a save migration.
    expect(first).toEqual(PINNED_12345);
  });

  it('next() stays in [0, 1)', () => {
    const rng = new Rng(7);
    for (let i = 0; i < 100_000; i++) {
      const x = rng.next();
      expect(x >= 0 && x < 1).toBe(true);
    }
  });

  it('round-trips state: a restored generator continues the same sequence', () => {
    const rng = new Rng(99);
    sample(rng, 17);
    const state = rng.getState();
    const expected = sample(rng, 20);
    expect(sample(Rng.fromState(state), 20)).toEqual(expected);
    // State survives JSON (it will live in save files).
    const viaJson = Rng.fromState(JSON.parse(JSON.stringify(state)));
    expect(sample(viaJson, 20)).toEqual(expected);
  });

  it('getState returns a copy that is not affected by later draws', () => {
    const rng = new Rng(5);
    const state = rng.getState();
    const copy = [...state];
    rng.next();
    expect(state).toEqual(copy);
  });

  it('rejects invalid states and seeds', () => {
    const rng = new Rng(1);
    expect(() => rng.setState([1, 2, 3] as unknown as [number, number, number, number])).toThrow();
    expect(() => rng.setState([1, 2, 3, -1])).toThrow();
    expect(() => rng.setState([1, 2, 3, 2 ** 32])).toThrow();
    expect(() => rng.setState([1, 2, 3, 1.5])).toThrow();
    expect(() => new Rng(Number.NaN)).toThrow();
    expect(() => new Rng(Infinity)).toThrow();
  });

  describe('int', () => {
    it('is inclusive on both ends and covers every value', () => {
      const rng = new Rng(3);
      const seen = new Set<number>();
      for (let i = 0; i < 10_000; i++) {
        const x = rng.int(1, 5);
        expect(Number.isInteger(x) && x >= 1 && x <= 5).toBe(true);
        seen.add(x);
      }
      expect([...seen].sort()).toEqual([1, 2, 3, 4, 5]);
    });

    it('handles a single-value range and negative ranges', () => {
      const rng = new Rng(3);
      expect(rng.int(4, 4)).toBe(4);
      for (let i = 0; i < 1000; i++) {
        const x = rng.int(-3, -1);
        expect(x >= -3 && x <= -1).toBe(true);
      }
    });

    it('rejects bad ranges', () => {
      const rng = new Rng(3);
      expect(() => rng.int(5, 1)).toThrow();
      expect(() => rng.int(0.5, 2)).toThrow();
    });
  });

  describe('range', () => {
    it('stays within [min, max)', () => {
      const rng = new Rng(8);
      for (let i = 0; i < 10_000; i++) {
        const x = rng.range(8, 14);
        expect(x >= 8 && x < 14).toBe(true);
      }
    });

    it('rejects bad ranges', () => {
      expect(() => new Rng(1).range(2, 1)).toThrow();
    });
  });

  describe('chance', () => {
    it('never fires at 0 and always fires at 1 (and clamps outside)', () => {
      const rng = new Rng(11);
      for (let i = 0; i < 1000; i++) {
        expect(rng.chance(0)).toBe(false);
        expect(rng.chance(-1)).toBe(false);
        expect(rng.chance(1)).toBe(true);
        expect(rng.chance(2)).toBe(true);
      }
    });

    it('fires at about the requested rate', () => {
      const rng = new Rng(11);
      const n = 100_000;
      let hits = 0;
      for (let i = 0; i < n; i++) if (rng.chance(0.3)) hits++;
      expect(hits / n).toBeGreaterThan(0.29);
      expect(hits / n).toBeLessThan(0.31);
    });

    it('rejects NaN', () => {
      expect(() => new Rng(1).chance(Number.NaN)).toThrow();
    });
  });

  describe('pick', () => {
    it('returns elements of the list and rejects an empty list', () => {
      const rng = new Rng(2);
      const items = ['a', 'b', 'c'];
      for (let i = 0; i < 100; i++) expect(items).toContain(rng.pick(items));
      expect(() => rng.pick([])).toThrow();
    });
  });

  describe('weighted', () => {
    it('matches the rarity base weights within ±1% over 100k rolls', () => {
      const rng = new Rng(2024);
      const entries = [
        ['common', 60],
        ['uncommon', 25],
        ['rare', 10],
        ['epic', 4],
        ['legendary', 1],
      ] as const;
      const counts: Record<string, number> = {};
      const n = 100_000;
      for (let i = 0; i < n; i++) {
        const k = rng.weighted(entries);
        counts[k] = (counts[k] ?? 0) + 1;
      }
      for (const [k, w] of entries) {
        expect(Math.abs((counts[k] ?? 0) / n - w / 100)).toBeLessThan(0.01);
      }
    });

    it('never picks a zero-weight entry', () => {
      const rng = new Rng(4);
      for (let i = 0; i < 10_000; i++) {
        expect(rng.weightedIndex([0, 5, 0, 1, 0])).not.toBe(0);
        expect(
          rng.weighted([
            ['x', 0],
            ['y', 1],
          ] as const),
        ).toBe('y');
      }
    });

    it('rejects empty, all-zero, negative, and non-finite weights', () => {
      const rng = new Rng(4);
      expect(() => rng.weightedIndex([])).toThrow();
      expect(() => rng.weightedIndex([0, 0])).toThrow();
      expect(() => rng.weightedIndex([1, -1])).toThrow();
      expect(() => rng.weightedIndex([1, Number.NaN])).toThrow();
      expect(() => rng.weightedIndex([1, Infinity])).toThrow();
    });
  });
});

// Recorded from the original implementation; see the "pinned sequence" test.
const PINNED_12345 = [2345461488, 1344865159, 2974739204];
