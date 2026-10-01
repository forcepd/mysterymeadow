/**
 * Keeps the 3D world smooth on older iPads (DESIGN 18.5: 60 fps on an A13-class iPad): if
 * frames run slow for a couple of seconds, draw at a lower resolution (the pixel ratio); if
 * they run fast for a while, step back up. Pure, so it's unit-tested.
 */

/** Pixel ratios to step through, sharpest first (capped by the screen's own). */
export const QUALITY_STEPS = [2, 1.5, 1.25, 1] as const;
/** Slower than this on average (ms per frame, about 45 fps) means too slow. */
const SLOW_MS = 22;
/** Faster than this on average (about 70 fps headroom at 60 Hz) means room to sharpen. */
const FAST_MS = 14;
/** How long frames must stay slow (or fast) before changing (ms). */
const SLOW_FOR = 2000;
const FAST_FOR = 6000;
/** After a change, wait this long before judging again (the new setting needs to settle). */
const SETTLE = 2500;
/** Gaps longer than this aren't frames (the tab was hidden, a pause): ignored. */
const IGNORE_OVER = 250;

export class QualityGovernor {
  private step: number;
  private average = 16;
  private slowFor = 0;
  private fastFor = 0;
  private settling = 0;

  /** `screenRatio`: the device's pixel ratio (steps above it are skipped). */
  constructor(private readonly screenRatio: number) {
    this.step = QUALITY_STEPS.findIndex((r) => r <= Math.max(1, screenRatio));
    if (this.step < 0) this.step = QUALITY_STEPS.length - 1;
  }

  /** The pixel ratio to draw at now. */
  get pixelRatio(): number {
    return Math.min(QUALITY_STEPS[this.step]!, Math.max(1, this.screenRatio));
  }

  /** Feeds one frame's duration. Returns the new pixel ratio when it changes, else null. */
  frame(ms: number): number | null {
    if (ms <= 0 || ms > IGNORE_OVER) return null;
    this.average += (ms - this.average) * 0.1;
    if (this.settling > 0) {
      this.settling -= ms;
      return null;
    }
    this.slowFor = this.average > SLOW_MS ? this.slowFor + ms : 0;
    this.fastFor = this.average < FAST_MS ? this.fastFor + ms : 0;
    if (this.slowFor >= SLOW_FOR && this.step < QUALITY_STEPS.length - 1) return this.change(1);
    const sharper = QUALITY_STEPS[this.step - 1];
    if (
      this.fastFor >= FAST_FOR &&
      sharper !== undefined &&
      sharper <= Math.max(1, this.screenRatio)
    ) {
      return this.change(-1);
    }
    return null;
  }

  private change(by: number): number {
    this.step += by;
    this.slowFor = 0;
    this.fastFor = 0;
    this.settling = SETTLE;
    return this.pixelRatio;
  }
}
