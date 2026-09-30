import type { GoalReward } from '../config/goals';
import { getItem } from '../config/items';

/** "🌷 Flower Garden  +50 🪙  +5 💎": a reward in short words and icons. */
export function rewardText(reward: GoalReward): string {
  const parts: string[] = [];
  if (reward.itemId) {
    const item = getItem(reward.itemId);
    parts.push(`${item?.icon ?? '🎁'} ${item?.name ?? 'A present'}`);
  }
  if (reward.coins) parts.push(`+${reward.coins} 🪙`);
  if (reward.gems) parts.push(`+${reward.gems} 💎`);
  return parts.join('  ');
}
