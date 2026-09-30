/**
 * A cap on live particles (DESIGN 18.5: cap particles). Effects ask for what they want and get
 * what fits; anything over the cap is trimmed, never queued. Pure, so it's unit-tested.
 */
export class ParticleBudget {
  private live = 0;

  constructor(readonly max: number) {}

  /** Reserves up to `want` particles; returns how many were granted. */
  take(want: number): number {
    const granted = Math.max(0, Math.min(Math.floor(want), this.max - this.live));
    this.live += granted;
    return granted;
  }

  /** One particle finished. */
  release(): void {
    this.live = Math.max(0, this.live - 1);
  }

  get count(): number {
    return this.live;
  }
}
