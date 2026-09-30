import { BALANCE } from '../config/balance';
import { isFriendly } from '../sim/systems/naming';

export type UsernameCheck = { ok: true; name: string } | { ok: false; reason: string };

/**
 * DESIGN 5 step 1: 3-16 letters, numbers, or underscores, through the local word filter.
 * Case-insensitively unique on this device, so the profile picker never shows two the same.
 */
export function checkUsername(raw: string, taken: readonly string[] = []): UsernameCheck {
  const name = raw.trim();
  const { usernameMin, usernameMax } = BALANCE.profiles;
  if (name.length < usernameMin || name.length > usernameMax) {
    return { ok: false, reason: `Use ${usernameMin} to ${usernameMax} letters or numbers.` };
  }
  if (!/^[A-Za-z0-9_]+$/.test(name)) {
    return { ok: false, reason: 'Just letters, numbers, and _ please.' };
  }
  if (!isFriendly(name.replace(/_/g, ' ')))
    return { ok: false, reason: 'Let’s pick a kinder name!' };
  if (taken.some((t) => t.toLowerCase() === name.toLowerCase())) {
    return { ok: false, reason: 'Someone here already uses that name!' };
  }
  return { ok: true, name };
}
