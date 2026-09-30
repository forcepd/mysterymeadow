import { BALANCE } from '../../config/balance';
import { seconds, type SimContext } from '../context';
import type { Ms } from '../types';
import { randomPosition } from './animals';
import { maybeSwitchZone } from './zones';

/**
 * DESIGN 12.4 wander timer: every 60-120 s each animal may switch zones (yard <-> house, if a
 * bed is free), or else picks a new spot in its zone. Paused offline.
 */
export function tickWander(ctx: SimContext, t: Ms): void {
  const { minSeconds, maxSeconds } = BALANCE.wander;
  for (const animal of ctx.state.world.animals) {
    if (t < animal.nextWanderAt) continue;
    animal.nextWanderAt = t + seconds(ctx.rng.range(minSeconds, maxSeconds));
    // Offline, timers just roll forward so everyone doesn't move at once on return.
    if (ctx.offline) continue;
    if (!maybeSwitchZone(ctx, animal)) animal.position = randomPosition(ctx);
  }
}
