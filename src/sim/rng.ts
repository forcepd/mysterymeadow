/**
 * Seeded, serializable pseudo-random generator (sfc32, seeded via splitmix32).
 * Deterministic across platforms; state can be saved and restored exactly.
 */
export type RngState = readonly [number, number, number, number];

export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: number) {
    if (!Number.isFinite(seed)) throw new RangeError(`Seed must be a finite number (got ${seed})`);
    let s = seed >>> 0;
    const splitmix = (): number => {
      s = (s + 0x9e3779b9) | 0;
      let z = s;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
      z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
      return (z ^ (z >>> 16)) >>> 0;
    };
    this.a = splitmix();
    this.b = splitmix();
    this.c = splitmix();
    this.d = splitmix();
    // Warm up so nearby seeds diverge quickly.
    for (let i = 0; i < 12; i++) this.nextUint32();
  }

  static fromState(state: RngState): Rng {
    const rng = new Rng(0);
    rng.setState(state);
    return rng;
  }

  getState(): RngState {
    return [this.a, this.b, this.c, this.d];
  }

  setState(state: RngState): void {
    if (state.length !== 4 || state.some((n) => !Number.isInteger(n) || n < 0 || n > 0xffffffff)) {
      throw new RangeError('Invalid RNG state');
    }
    [this.a, this.b, this.c, this.d] = state;
  }

  nextUint32(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    this.a >>>= 0;
    this.b >>>= 0;
    this.c >>>= 0;
    this.d >>>= 0;
    return t >>> 0;
  }

  /** Float in [0, 1). */
  next(): number {
    return this.nextUint32() / 0x100000000;
  }

  /** Integer in [min, max], inclusive. */
  int(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
      throw new RangeError(`Invalid int range [${min}, ${max}]`);
    }
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) {
      throw new RangeError(`Invalid range [${min}, ${max})`);
    }
    return min + this.next() * (max - min);
  }

  /** True with probability p (clamped to [0, 1]). */
  chance(p: number): boolean {
    if (Number.isNaN(p)) throw new RangeError('Probability is NaN');
    if (p <= 0) return false;
    if (p >= 1) return true;
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError('Cannot pick from an empty list');
    return items[this.int(0, items.length - 1)] as T;
  }

  /** Index chosen with probability proportional to its weight. Zero weights are never chosen. */
  weightedIndex(weights: readonly number[]): number {
    let total = 0;
    for (const w of weights) {
      if (!Number.isFinite(w) || w < 0) throw new RangeError(`Invalid weight ${w}`);
      total += w;
    }
    if (total <= 0) throw new RangeError('Weights must include at least one positive value');
    let roll = this.next() * total;
    for (let i = 0; i < weights.length; i++) {
      const w = weights[i] as number;
      if (roll < w) return i;
      roll -= w;
    }
    // Floating-point edge: fall back to the last positive weight.
    for (let i = weights.length - 1; i >= 0; i--) if ((weights[i] as number) > 0) return i;
    throw new RangeError('unreachable');
  }

  /** Value chosen from [value, weight] pairs with probability proportional to weight. */
  weighted<T>(entries: readonly (readonly [T, number])[]): T {
    const i = this.weightedIndex(entries.map(([, w]) => w));
    return (entries[i] as readonly [T, number])[0];
  }
}
