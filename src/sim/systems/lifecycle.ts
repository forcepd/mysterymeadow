import type { SimContext } from '../context';
import type { Ms } from '../types';

/**
 * DESIGN 7.2 and 7.4: babies grow up and hold timers finish. Both are plain timestamps, so this
 * only announces the moment each one crosses during the tick (prev, t].
 */
export function tickLifecycle(ctx: SimContext, prev: Ms, t: Ms): void {
  for (const animal of ctx.state.world.animals) {
    if (animal.grownAt !== undefined && prev < animal.grownAt && animal.grownAt <= t) {
      ctx.summary.grewUp += 1;
      ctx.emit('animalGrew', { animal });
    }
    if (!animal.isKept && prev < animal.holdUntil && animal.holdUntil <= t) {
      ctx.summary.readyToSell += 1;
      ctx.emit('readyToSell', { animal });
    }
  }
}
