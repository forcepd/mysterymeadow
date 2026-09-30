import { BALANCE } from '../config/balance';
import type { OfflineSummary } from '../sim/types';

export interface AwayLine {
  readonly icon: string;
  readonly text: string;
}

export interface AwayCard {
  /** "2 hours", "15 minutes", "3 days". */
  readonly away: string;
  readonly lines: readonly AwayLine[];
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** How long someone was away, in friendly words (rounded down). */
export function formatAway(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return plural(Math.max(1, minutes), 'minute', 'minutes');
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return plural(hours, 'hour', 'hours');
  return plural(Math.floor(hours / 24), 'day', 'days');
}

/**
 * The "While you were away" card (DESIGN 14, 17.1 #15), or null when the player was only gone a
 * moment. Always good news: needs, poop, and sickness pause while away, so it says so.
 */
export function awayCard(summary: OfflineSummary, offlineProgress: boolean): AwayCard | null {
  if (summary.awayMs < BALANCE.offline.summaryMinMinutes * 60_000) return null;
  const lines: AwayLine[] = [];
  if (summary.visitorsWaiting > 0)
    lines.push({
      icon: '🐾',
      text: `${plural(summary.visitorsWaiting, 'visitor is', 'visitors are')} waiting at the gate`,
    });
  if (summary.babiesBorn > 0)
    lines.push({
      icon: '🍼',
      text: `${plural(summary.babiesBorn, 'baby was', 'babies were')} born`,
    });
  if (summary.grewUp > 0)
    lines.push({
      icon: '🌱',
      text: `${plural(summary.grewUp, 'baby', 'babies')} grew up`,
    });
  if (summary.readyToSell > 0)
    lines.push({
      icon: '🪙',
      text: `${plural(summary.readyToSell, 'animal is', 'animals are')} ready to sell`,
    });
  if (!offlineProgress) lines.push({ icon: '⏸️', text: 'Everything waited for you' });
  else if (lines.length === 0) lines.push({ icon: '💤', text: 'Everyone had a cozy nap' });
  lines.push({ icon: '💚', text: 'Nobody got hungry or sick while you were gone' });
  return { away: formatAway(summary.awayMs), lines };
}
