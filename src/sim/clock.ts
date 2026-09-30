import type { Ms } from './types';

/** Source of "now" for the sim. Injected so tests and the dev time scale can control time. */
export interface Clock {
  now(): Ms;
}

/** Real wall-clock time. */
export const systemClock: Clock = {
  now: () => Date.now(),
};

/** Manually driven clock for tests. Time never moves unless told to. */
export class FakeClock implements Clock {
  private current: Ms;

  constructor(start: Ms = 0) {
    this.current = start;
  }

  now(): Ms {
    return this.current;
  }

  advance(ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) {
      throw new RangeError(`FakeClock can only move forward (got ${ms})`);
    }
    this.current += ms;
  }

  set(time: Ms): void {
    if (!Number.isFinite(time) || time < this.current) {
      throw new RangeError(`FakeClock can only move forward (from ${this.current} to ${time})`);
    }
    this.current = time;
  }
}

/**
 * Game clock on top of a source clock. Runs `scale` times faster (dev time scale); changing
 * the scale re-anchors so time never jumps or goes backwards. `startAt` lets the game resume
 * from a saved time that is ahead of the source (e.g. the device clock was set back).
 */
export class ScaledClock implements Clock {
  private anchorSource: Ms;
  private anchorScaled: Ms;
  private scale: number;

  constructor(
    private readonly source: Clock,
    scale = 1,
    startAt?: Ms,
  ) {
    ScaledClock.assertScale(scale);
    this.scale = scale;
    this.anchorSource = source.now();
    this.anchorScaled = startAt ?? this.anchorSource;
  }

  now(): Ms {
    return this.anchorScaled + (this.source.now() - this.anchorSource) * this.scale;
  }

  getScale(): number {
    return this.scale;
  }

  setScale(scale: number): void {
    ScaledClock.assertScale(scale);
    this.anchorScaled = this.now();
    this.anchorSource = this.source.now();
    this.scale = scale;
  }

  /** Skips forward (dev "advance time"). */
  jump(ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) throw new RangeError(`Can only jump forward (got ${ms})`);
    this.anchorScaled += ms;
  }

  private static assertScale(scale: number): void {
    if (!Number.isFinite(scale) || scale <= 0) {
      throw new RangeError(`Time scale must be a positive number (got ${scale})`);
    }
  }
}
