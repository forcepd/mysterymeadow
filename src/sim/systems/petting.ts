import { BALANCE } from '../../config/balance';
import { seconds, type SimContext } from '../context';
import type { CommandResult, Ms } from '../types';
import { addNeeds } from './needs';
import { findAnimal } from './selling';

/** Tap-and-hold petting (DESIGN 8.4): +happiness, then a short cooldown. */
export function pet(ctx: SimContext, animalId: string, now: Ms): CommandResult {
  const animal = findAnimal(ctx.state.world, animalId);
  if (!animal) return { ok: false, reason: 'Can’t find that animal.' };
  if (now < animal.nextPetAt) return { ok: false, reason: 'Loved that! Try again in a moment.' };
  addNeeds(animal, 0, BALANCE.needs.petHappinessGain);
  animal.nextPetAt = now + seconds(BALANCE.needs.petCooldownSeconds);
  ctx.emit('animalPetted', { animal });
  return { ok: true };
}
