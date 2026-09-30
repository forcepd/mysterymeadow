import { BALANCE } from '../../config/balance';
import type { SimContext } from '../context';
import type { Ms, WorldState } from '../types';
import { addCoins, addGems } from './economy';
import { dayKey } from './tricks';

export interface DailyGiftReward {
  coins: number;
  gems: number;
  itemId?: string;
}

/** A present is waiting: the first play of a new (local) day. */
export function dailyGiftReady(world: WorldState, now: Ms): boolean {
  return world.dailyGift.lastDay !== dayKey(now);
}

/**
 * Opens today's present (early-game pass): usually coins, sometimes a yard lure, sometimes gems.
 * Never a punishment for missed days: it's one present per day played.
 */
export function openDailyGift(
  ctx: SimContext,
  now: Ms,
): { ok: true; reward: DailyGiftReward } | { ok: false; reason: string } {
  const world = ctx.state.world;
  if (!dailyGiftReady(world, now)) return { ok: false, reason: 'Come back tomorrow for another!' };
  const g = BALANCE.dailyGift;
  world.dailyGift.lastDay = dayKey(now);
  const roll = ctx.rng.next();
  let reward: DailyGiftReward;
  if (roll < g.itemChance) {
    const itemId = ctx.rng.pick(g.items);
    world.inventory[itemId] = (world.inventory[itemId] ?? 0) + 1;
    reward = { coins: 0, gems: 0, itemId };
  } else if (roll < g.itemChance + g.gemChance) {
    reward = { coins: g.gemBonusCoins, gems: g.gems };
  } else {
    reward = { coins: ctx.rng.pick(g.coins), gems: 0 };
  }
  if (reward.coins) addCoins(ctx, reward.coins);
  if (reward.gems) addGems(ctx, reward.gems);
  ctx.emit('dailyGiftOpened', { reward });
  return { ok: true, reward };
}
