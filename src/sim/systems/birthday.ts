import { BIRTHDAY } from '../../config/birthday';
import type { SimContext } from '../context';
import type { Ms, WorldState } from '../types';
import { dayKey } from './tricks';

/** Today (local time) is the birthday. */
export function isBirthday(now: Ms): boolean {
  const d = new Date(now);
  return d.getMonth() + 1 === BIRTHDAY.month && d.getDate() === BIRTHDAY.day;
}

/** The birthday card is waiting: it's the birthday, and it hasn't been seen yet today. */
export function birthdayGreetingReady(world: WorldState, now: Ms): boolean {
  return isBirthday(now) && world.birthday.lastGreetedDay !== dayKey(now);
}

/** The birthday card was seen: it won't show again until next year's birthday. */
export function seeBirthdayGreeting(ctx: SimContext, now: Ms): boolean {
  const world = ctx.state.world;
  if (!birthdayGreetingReady(world, now)) return false;
  world.birthday.lastGreetedDay = dayKey(now);
  ctx.emit('birthdayGreeted', undefined);
  return true;
}
