import { BALANCE } from '../../config/balance';
import { minutes, nextId, type SimContext } from '../context';
import type { CommandResult, Ms } from '../types';

function nextPoopDelay(ctx: SimContext): Ms {
  return minutes(ctx.rng.range(BALANCE.poop.minMinutes, BALANCE.poop.maxMinutes));
}

/**
 * DESIGN 8.3: each animal poops every 8-14 min at its current spot. Offline, nobody poops:
 * timers that come due are just rescheduled, so coming back never means a pile of poop.
 */
export function tickPoop(ctx: SimContext, t: Ms): void {
  const world = ctx.state.world;
  for (const animal of world.animals) {
    if (t < animal.nextPoopAt) continue;
    animal.nextPoopAt = t + nextPoopDelay(ctx);
    if (ctx.offline) continue;
    const poop = {
      id: nextId(ctx, 'p'),
      zone: animal.zone,
      position: { x: animal.position.x, y: Math.min(1, animal.position.y + 0.03) },
      createdAt: t,
    };
    world.poops.push(poop);
    ctx.emit('poopAppeared', { poop, animalId: animal.id });
  }
}

export function cleanPoop(ctx: SimContext, poopId: string): CommandResult {
  const world = ctx.state.world;
  const poop = world.poops.find((p) => p.id === poopId);
  if (!poop) return { ok: false, reason: 'Already clean!' };
  world.poops = world.poops.filter((p) => p !== poop);
  ctx.emit('poopCleaned', { poop });
  return { ok: true };
}
