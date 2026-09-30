import { BALANCE } from '../../config/balance';
import { minutes, nextId, type SimContext } from '../context';
import type { CommandResult, FindKind, Ms } from '../types';
import { addCoins } from './economy';

/** When the next yard find is due: a random wait between minMinutes and maxMinutes. */
function nextFindDelay(ctx: SimContext): Ms {
  const f = BALANCE.finds;
  return Math.round(minutes(ctx.rng.range(f.minMinutes, f.maxMinutes)));
}

/**
 * Little things to tap in the yard (early-game pass): a coin, a lucky clover, or a butterfly
 * shows up now and then, and floats off after a while if nobody taps it (no harm done).
 * Online only: nothing piles up while the player is away.
 */
export function tickFinds(ctx: SimContext, t: Ms): void {
  if (ctx.offline) return;
  const world = ctx.state.world;
  const gone = world.finds.filter((f) => t >= f.expiresAt);
  if (gone.length > 0) {
    world.finds = world.finds.filter((f) => t < f.expiresAt);
    for (const find of gone) ctx.emit('findGone', { find });
  }
  if (t < world.nextFindAt) return;
  // Back after a break: start a fresh wait instead of making up for lost time.
  world.nextFindAt = t + nextFindDelay(ctx);
  if (world.finds.length >= BALANCE.finds.maxAtOnce) return;
  const kinds = Object.entries(BALANCE.finds.kinds).map(
    ([kind, def]) => [kind as FindKind, def.weight] as const,
  );
  const find = {
    id: nextId(ctx, 'f'),
    kind: ctx.rng.weighted(kinds),
    // Keep away from the very edges, so it's easy to reach.
    position: { x: ctx.rng.range(0.08, 0.92), y: ctx.rng.range(0.1, 0.9) },
    expiresAt: t + minutes(BALANCE.finds.lifetimeMinutes),
  };
  world.finds.push(find);
  ctx.emit('findAppeared', { find });
}

/** The player taps a find: a few coins. */
export function collectFind(ctx: SimContext, findId: string): CommandResult {
  const world = ctx.state.world;
  const find = world.finds.find((f) => f.id === findId);
  if (!find) return { ok: false, reason: 'It floated away!' };
  world.finds = world.finds.filter((f) => f !== find);
  const coins = BALANCE.finds.kinds[find.kind].coins;
  addCoins(ctx, coins);
  ctx.emit('findCollected', { find, coins });
  return { ok: true };
}
