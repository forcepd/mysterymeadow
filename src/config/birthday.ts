import { deepFreeze } from './deepFreeze';

/**
 * A once-a-year birthday surprise: on this (local) day, the first play shows a "Happy Birthday!"
 * card, and the avatar wears the birthday hat all day long (it's never saved into an outfit).
 */
export const BIRTHDAY = deepFreeze({
  name: 'Grace',
  /** 1 = January. */
  month: 10,
  day: 1,
  hatItemId: 'hat_birthday',
} as const);
