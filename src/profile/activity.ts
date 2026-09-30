import { BALANCE } from '../config/balance';

/** One line in Parent Mode's "Recent activity" (DESIGN 20). */
export interface ActivityEntry {
  at: number;
  icon: string;
  text: string;
}

/** Newest first, keeping the last `profiles.activityLogSize` entries. */
export function addActivity(log: readonly ActivityEntry[], entry: ActivityEntry): ActivityEntry[] {
  return [entry, ...log].slice(0, BALANCE.profiles.activityLogSize);
}
