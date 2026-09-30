import { BALANCE } from '../../config/balance';
import { minutes, nextId, seconds, type SimContext } from '../context';
import type { CommandResult, Ms, Visitor, VisitorRoll } from '../types';
import { createAnimal, discover, randomPosition } from './animals';
import { freeCapacity, isCrowded, visitorIntervalMinutes } from './housing';
import { rollVisitor } from './rarity';
import { applyQuickHold, applySurprise, takeVisitorGap } from './welcome';

/**
 * DESIGN 6.1 and 14. Online: the timer spawns a visitor at the gate unless the yard is Crowded
 * (over capacity). At capacity it still comes and waits. Offline: visitors queue at the gate,
 * up to maxGateQueue and never more than free capacity, and wait for the player to return.
 */
export function tickVisitorTimer(ctx: SimContext, t: Ms): void {
  const world = ctx.state.world;
  while (t >= world.nextVisitorAt) {
    const firedAt = world.nextVisitorAt;
    world.nextVisitorAt += minutes(takeVisitorGap(ctx, visitorIntervalMinutes(world)));
    if (ctx.offline) {
      const queue = world.gateQueue.length;
      if (queue < BALANCE.offline.maxGateQueue && queue < freeCapacity(world)) {
        spawnVisitor(ctx, firedAt);
      }
    } else if (isCrowded(world)) {
      ctx.emit('visitorSkipped', { reason: 'crowded' });
    } else {
      spawnVisitor(ctx, firedAt);
    }
  }
}

export function spawnVisitor(
  ctx: SimContext,
  at: Ms,
  roll: VisitorRoll = applySurprise(ctx, rollVisitor(ctx.rng, ctx.state.world)),
): Visitor {
  const visitor: Visitor = {
    id: nextId(ctx, 'v'),
    arrivedAtGate: at,
    autoRevealAt: at + seconds(BALANCE.visitor.autoRevealSeconds),
    leavesAt: at + minutes(BALANCE.visitor.gateWaitMinutes),
    revealed: false,
    roll,
  };
  ctx.state.world.gateQueue.push(visitor);
  ctx.emit('visitorArrived', { visitor });
  return visitor;
}

/** Online only: auto-reveal, let revealed visitors in while there's room, wave off the rest. */
export function tickGate(ctx: SimContext, t: Ms): void {
  if (ctx.offline) return;
  for (const visitor of ctx.state.world.gateQueue) {
    if (!visitor.revealed && t >= visitor.autoRevealAt) reveal(ctx, visitor, true);
  }
  admitVisitors(ctx, t);
  const world = ctx.state.world;
  const leaving = world.gateQueue.filter((v) => t >= v.leavesAt);
  if (leaving.length === 0) return;
  world.gateQueue = world.gateQueue.filter((v) => t < v.leavesAt);
  for (const visitor of leaving) ctx.emit('visitorLeft', { visitor });
}

/** Revealed visitors come in, oldest first, while there's free capacity. */
export function admitVisitors(ctx: SimContext, t: Ms): void {
  const world = ctx.state.world;
  const staying: Visitor[] = [];
  for (const visitor of world.gateQueue) {
    if (visitor.revealed && freeCapacity(world) > 0) {
      const { roll } = visitor;
      const animal = createAnimal(ctx, {
        speciesId: roll.speciesId,
        variantId: roll.variantId,
        isSparkle: roll.isSparkle,
        rarity: roll.rarity,
        zone: 'yard',
        position: randomPosition(ctx),
        at: t,
        isBaby: false,
        litterSize: roll.litterSize,
      });
      applyQuickHold(ctx, animal, t);
      world.animals.push(animal);
      ctx.emit('visitorEntered', { visitorId: visitor.id, animal });
    } else {
      staying.push(visitor);
    }
  }
  world.gateQueue = staying;
}

function reveal(ctx: SimContext, visitor: Visitor, auto: boolean): void {
  visitor.revealed = true;
  discover(ctx, visitor.roll.speciesId, visitor.roll.variantId, visitor.roll.isSparkle);
  ctx.emit('visitorRevealed', { visitor, auto });
}

/** Player taps a mystery visitor. It walks in right away if there's room. */
export function revealVisitor(ctx: SimContext, visitorId: string, t: Ms): CommandResult {
  const visitor = ctx.state.world.gateQueue.find((v) => v.id === visitorId);
  if (!visitor) return { ok: false, reason: 'That visitor is gone.' };
  if (visitor.revealed) return { ok: false, reason: 'Already revealed!' };
  reveal(ctx, visitor, false);
  admitVisitors(ctx, t);
  return { ok: true };
}

/** After offline catch-up, everyone at the gate gets a fresh wait so nobody leaves unseen. */
export function refreshGateTimers(ctx: SimContext, t: Ms): void {
  for (const visitor of ctx.state.world.gateQueue) {
    if (!visitor.revealed) visitor.autoRevealAt = t + seconds(BALANCE.visitor.autoRevealSeconds);
    visitor.leavesAt = t + minutes(BALANCE.visitor.gateWaitMinutes);
  }
}
