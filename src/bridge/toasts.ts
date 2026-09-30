import { BALANCE } from '../config/balance';
import { getGoal } from '../config/goals';
import { getIllness } from '../config/illnesses';
import { getTrick } from '../config/tricks';
import type { SimEvents } from '../sim/events';
import { displayName, speciesName } from './describe';

export interface ToastMessage {
  icon: string;
  text: string;
}

/** DESIGN 17.4: short, friendly toasts for sim events. `null` = no toast for this event. */
export const TOASTS: {
  [K in keyof SimEvents]?: (payload: SimEvents[K]) => ToastMessage | null;
} = {
  visitorArrived: () => ({ icon: '❓', text: 'A mystery visitor is here!' }),
  visitorLeft: ({ visitor }) => ({
    icon: '👋',
    text: `No room! The ${speciesName(visitor.roll.speciesId)} waved goodbye.`,
  }),
  visitorSkipped: () => ({ icon: '🏡', text: 'Your yard is too crowded for visitors!' }),
  animalBorn: ({ mother, babies }) => ({
    icon: '🍼',
    text:
      babies.length === 1
        ? `${displayName(mother)} had a baby!`
        : `${displayName(mother)} had ${babies.length} babies!`,
  }),
  bowlEmptied: () => ({ icon: '🥣', text: 'The food bowl is empty! Tap it to refill.' }),
  readyToSell: ({ animal }) => ({ icon: '🪙', text: `${displayName(animal)} is ready to sell!` }),
  animalSold: ({ animal, price }) => ({
    icon: '💖',
    text: `${displayName(animal)} went to a loving new home! +${price}`,
  }),
  animalSick: ({ animal, illnessId, secondIllnessId }) => ({
    icon: getIllness(illnessId)?.symptomIcon ?? '🤒',
    text: secondIllnessId
      ? `Oh no, ${displayName(animal)} looks sick! A tricky case: two things are wrong.`
      : `Oh no, ${displayName(animal)} looks sick!`,
  }),
  clinicReady: ({ animal }) => ({
    icon: '🏥',
    text: `The vet is ready to see ${displayName(animal)}!`,
  }),
  animalCured: ({ animal }) => ({ icon: '💖', text: `${displayName(animal)} is all better!` }),
  trickLearned: ({ animal, trickId, gems }) => ({
    icon: '🎓',
    text: `${displayName(animal)} learned ${getTrick(trickId)?.name ?? 'a trick'}!${
      gems > 0 ? ` +${gems} 💎` : ' (No more trick gems today.)'
    }`,
  }),
  houseUpgraded: ({ tierId }) => ({
    icon: '🎉',
    text: `Welcome to your ${BALANCE.houseTiers.find((t) => t.id === tierId)?.name ?? 'new house'}!`,
  }),
  crowdedChanged: ({ crowded }) =>
    crowded
      ? { icon: '🐾', text: 'Your yard is crowded!' }
      : { icon: '🌼', text: 'There’s room again. Visitors are on their way!' },
  goalReady: ({ goalId }) => ({
    icon: '🎯',
    text: `Goal done: ${getGoal(goalId)?.text ?? 'nice work'}!`,
  }),
  goalsCompleted: () => ({
    icon: '🏆',
    text: 'You finished every Meadow Goal! A Flower Garden is yours.',
  }),
  caughtUp: (s) => {
    // Longer breaks get the "While you were away" card instead (bridge/away.ts).
    if (s.awayMs >= BALANCE.offline.summaryMinMinutes * 60_000) return null;
    const parts: string[] = [];
    if (s.visitorsWaiting > 0) {
      parts.push(
        `${s.visitorsWaiting} visitor${s.visitorsWaiting === 1 ? ' is' : 's are'} waiting`,
      );
    }
    if (s.babiesBorn > 0)
      parts.push(`${s.babiesBorn} bab${s.babiesBorn === 1 ? 'y was' : 'ies were'} born`);
    if (parts.length === 0) return null;
    return { icon: '🌈', text: `Welcome back! ${parts.join(' and ')}.` };
  },
};
