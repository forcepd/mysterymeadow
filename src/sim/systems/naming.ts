import { BALANCE } from '../../config/balance';
import { WORD_FILTER } from '../../config/wordFilter';
import type { SimContext } from '../context';
import type { CommandResult } from '../types';
import { findAnimal } from './selling';

const LEET: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  $: 's',
  '!': 'i',
};

/** Letters (any language), numbers, spaces, and a little punctuation. */
const ALLOWED = /^[\p{L}\p{N} '’.-]+$/u;

export type NameCheck = { ok: true; name: string } | { ok: false; reason: string };

/** Cleans up and checks a pet name (DESIGN 10.2). Returns the tidied name. */
export function checkName(raw: string): NameCheck {
  const name = raw.normalize('NFC').trim().replace(/\s+/g, ' ');
  const { minLength, maxLength } = BALANCE.names;
  const length = [...name].length;
  if (length < minLength || length > maxLength) {
    return { ok: false, reason: `Names can be ${minLength} to ${maxLength} letters long.` };
  }
  if (!ALLOWED.test(name)) return { ok: false, reason: 'Please use just letters and numbers.' };
  if (!isFriendly(name)) return { ok: false, reason: 'Let’s pick a kinder name!' };
  return { ok: true, name };
}

/** False if the name contains a blocked word (whole) or fragment (anywhere). */
export function isFriendly(text: string): boolean {
  const lower = text.toLowerCase();
  const deLeet = [...lower].map((c) => LEET[c] ?? c).join('');
  const words = deLeet.split(/[^\p{L}]+/u).filter(Boolean);
  const blockedWords = new Set<string>(WORD_FILTER.words);
  for (const w of words) {
    if (blockedWords.has(w) || (w.endsWith('s') && blockedWords.has(w.slice(0, -1)))) return false;
  }
  const squished = words.join('');
  // Also catch letters spaced out to dodge the filter ("f u c k").
  return !WORD_FILTER.fragments.some((f) => squished.includes(f));
}

/** Names an animal, or clears its name with an empty string (it shows its species again). */
export function renameAnimal(ctx: SimContext, animalId: string, raw: string): CommandResult {
  const animal = findAnimal(ctx.state.world, animalId);
  if (!animal) return { ok: false, reason: 'Can’t find that animal.' };
  if (raw.trim() === '') {
    delete animal.name;
    ctx.emit('animalRenamed', { animal });
    return { ok: true };
  }
  const check = checkName(raw);
  if (!check.ok) return check;
  animal.name = check.name;
  ctx.emit('animalRenamed', { animal });
  return { ok: true };
}
