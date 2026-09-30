import {
  ALL_GOALS_REWARD,
  GOALS,
  getGoal,
  type GoalCounter,
  type GoalReward,
} from '../../config/goals';
import { getItem } from '../../config/items';
import type { SimContext } from '../context';
import type { SimEvents } from '../events';
import type { CommandResult, GoalsState, WorldState } from '../types';
import { addCoins, addGems } from './economy';

export function newGoals(): GoalsState {
  return { progress: {}, claimed: [] };
}

/** Which goal counter a sim event moves, if any. Only the player's own actions count. */
export function goalCounterFor<K extends keyof SimEvents>(
  name: K,
  payload: SimEvents[K],
): GoalCounter | null {
  switch (name) {
    case 'visitorRevealed':
      return 'reveal';
    case 'animalPetted':
      return 'pet';
    case 'poopCleaned':
      return (payload as SimEvents['poopCleaned']).by ? null : 'clean';
    case 'bowlRefilled':
      return (payload as SimEvents['bowlRefilled']).by ? null : 'fillBowl';
    case 'animalRenamed':
      return 'name';
    case 'animalSold':
      return 'sell';
    case 'itemPlaced': {
      const { item } = payload as SimEvents['itemPlaced'];
      return item.zone === 'yard' && getItem(item.itemId)?.category === 'lure' ? 'placeLure' : null;
    }
    case 'trickLearned':
      return 'learnTrick';
    default:
      return null;
  }
}

/** Counts an event toward the starter goals; says when one is ready to collect. */
export function trackGoals<K extends keyof SimEvents>(
  ctx: SimContext,
  name: K,
  payload: SimEvents[K],
): void {
  const counter = goalCounterFor(name, payload);
  if (!counter) return;
  const goals = ctx.state.world.goals;
  for (const goal of GOALS) {
    if (goal.counter !== counter || goals.claimed.includes(goal.id)) continue;
    const before = goals.progress[goal.id] ?? 0;
    if (before >= goal.target) continue;
    goals.progress[goal.id] = before + 1;
    if (before + 1 === goal.target) ctx.emit('goalReady', { goalId: goal.id });
  }
}

export function isGoalReady(world: WorldState, goalId: string): boolean {
  const goal = getGoal(goalId);
  return (
    !!goal &&
    !world.goals.claimed.includes(goalId) &&
    (world.goals.progress[goalId] ?? 0) >= goal.target
  );
}

/** Goals done but not collected yet (for the HUD badge). */
export function readyGoalCount(world: WorldState): number {
  return GOALS.filter((g) => isGoalReady(world, g.id)).length;
}

export function allGoalsClaimed(world: WorldState): boolean {
  return GOALS.every((g) => world.goals.claimed.includes(g.id));
}

function grant(ctx: SimContext, reward: GoalReward): void {
  if (reward.coins) addCoins(ctx, reward.coins);
  if (reward.gems) addGems(ctx, reward.gems);
  if (reward.itemId) {
    const inv = ctx.state.world.inventory;
    inv[reward.itemId] = (inv[reward.itemId] ?? 0) + 1;
  }
}

/** Collects a finished goal's reward. Finishing the last one adds the all-goals prize. */
export function claimGoal(ctx: SimContext, goalId: string): CommandResult {
  const world = ctx.state.world;
  const goal = getGoal(goalId);
  if (!goal) return { ok: false, reason: 'That’s not a goal.' };
  if (world.goals.claimed.includes(goalId)) return { ok: false, reason: 'Already collected!' };
  if (!isGoalReady(world, goalId)) return { ok: false, reason: 'Not done yet. Keep going!' };
  world.goals.claimed.push(goalId);
  grant(ctx, goal.reward);
  ctx.emit('goalClaimed', { goalId, reward: goal.reward });
  if (allGoalsClaimed(world)) {
    grant(ctx, ALL_GOALS_REWARD);
    ctx.emit('goalsCompleted', { reward: ALL_GOALS_REWARD });
  }
  return { ok: true };
}
