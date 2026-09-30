import { deepFreeze } from './deepFreeze';

/**
 * Starter goals ("Meadow Goals"): a short list that shows a new player what to try, with a small
 * reward for each. Adding a goal is a data entry here, using one of the things the sim counts.
 * Rewards are [DEFAULT, early-game pass].
 */
export type GoalCounter =
  'reveal' | 'pet' | 'clean' | 'fillBowl' | 'name' | 'sell' | 'placeLure' | 'learnTrick';

export interface GoalReward {
  readonly coins?: number;
  readonly gems?: number;
  /** One of this item, into the inventory. */
  readonly itemId?: string;
}

export interface GoalDef {
  readonly id: string;
  readonly icon: string;
  readonly text: string;
  readonly counter: GoalCounter;
  readonly target: number;
  readonly reward: GoalReward;
}

// prettier-ignore
export const GOALS: readonly GoalDef[] = deepFreeze([
  { id: 'meet3',   icon: '❓', text: 'Meet 3 mystery visitors', counter: 'reveal',     target: 3, reward: { coins: 20 } },
  { id: 'feed1',   icon: '🥣', text: 'Fill a food bowl',        counter: 'fillBowl',   target: 1, reward: { coins: 10 } },
  { id: 'pet5',    icon: '💕', text: 'Pet animals 5 times',     counter: 'pet',        target: 5, reward: { coins: 15 } },
  { id: 'clean3',  icon: '🧹', text: 'Clean up 3 poops',        counter: 'clean',      target: 3, reward: { coins: 15 } },
  { id: 'name1',   icon: '✏️', text: 'Give an animal a name',   counter: 'name',       target: 1, reward: { gems: 5 } },
  { id: 'sell1',   icon: '🪙', text: 'Make your first sale',    counter: 'sell',       target: 1, reward: { gems: 10 } },
  { id: 'lure1',   icon: '🌷', text: 'Put a lure in the yard',  counter: 'placeLure',  target: 1, reward: { coins: 20 } },
  { id: 'trick1',  icon: '🎓', text: 'Teach a trick',           counter: 'learnTrick', target: 1, reward: { gems: 10 } },
]);

/** Finishing every goal: a free Flower Garden. */
export const ALL_GOALS_REWARD: GoalReward = deepFreeze({ itemId: 'flower_garden', coins: 50 });

export function getGoal(id: string): GoalDef | undefined {
  return GOALS.find((g) => g.id === id);
}
