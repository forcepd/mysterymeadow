import { BALANCE } from '../../config/balance';
import { ITEMS, type HelperItemDef } from '../../config/items';
import { seconds, type SimContext } from '../context';
import type { Ms, WorldState } from '../types';
import { isBowl } from './feeding';

/** Helpers are bought once and live in the inventory (they're never placed). */
export function hasHelper(world: WorldState, helper: HelperItemDef['helper']): boolean {
  return ITEMS.some(
    (i) => i.category === 'helper' && i.helper === helper && (world.inventory[i.id] ?? 0) > 0,
  );
}

/** Runs on whole multiples of `everySeconds` since the game began, like the sickness roll. */
function due(ctx: SimContext, t: Ms, everySeconds: number): boolean {
  const every = seconds(everySeconds);
  return t % every === ctx.state.meta.createdAt % every;
}

/**
 * Online only, like the rest of care (poop doesn't happen offline, and nobody eats):
 * - Scoop Bot (DESIGN 8.3) cleans the oldest yard poop once a minute.
 * - Auto-Feeder refills every empty bowl once a minute.
 */
export function tickHelpers(ctx: SimContext, t: Ms): void {
  if (ctx.offline) return;
  const world = ctx.state.world;
  const { scoopEverySeconds, feedEverySeconds } = BALANCE.helpers;

  if (due(ctx, t, scoopEverySeconds) && hasHelper(world, 'scoopBot')) {
    const oldest = world.poops
      .filter((p) => p.zone === 'yard')
      .sort((a, b) => a.createdAt - b.createdAt)[0];
    if (oldest) {
      world.poops = world.poops.filter((p) => p !== oldest);
      ctx.emit('poopCleaned', { poop: oldest, by: 'scoopBot' });
    }
  }

  if (due(ctx, t, feedEverySeconds) && hasHelper(world, 'autoFeeder')) {
    for (const bowl of world.placedItems) {
      if (!isBowl(bowl) || (bowl.servings ?? 0) > 0) continue;
      bowl.servings = BALANCE.needs.bowlServings;
      ctx.emit('bowlRefilled', { bowlId: bowl.id, by: 'autoFeeder' });
    }
  }
}
