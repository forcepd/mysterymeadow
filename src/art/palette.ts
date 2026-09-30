import type { Rarity } from '../sim/types';

/**
 * Rarity is always shown with BOTH stars and color, so it reads for colorblind players
 * (DESIGN 6.2). Shared by the Phaser world and the React UI.
 */
export const RARITY_STYLE: Readonly<
  Record<Rarity, { label: string; stars: number; color: string; hex: number }>
> = {
  common: { label: 'Common', stars: 1, color: '#7b8b6f', hex: 0x7b8b6f },
  uncommon: { label: 'Uncommon', stars: 2, color: '#3f9a4a', hex: 0x3f9a4a },
  rare: { label: 'Rare', stars: 3, color: '#2f7fd8', hex: 0x2f7fd8 },
  epic: { label: 'Epic', stars: 4, color: '#8e4fc9', hex: 0x8e4fc9 },
  legendary: { label: 'Legendary', stars: 5, color: '#d98a00', hex: 0xd98a00 },
};

export function starString(rarity: Rarity): string {
  return '★'.repeat(RARITY_STYLE[rarity].stars);
}

/** '#rrggbb' to the number Phaser's drawing calls take. */
export function parseHex(color: string): number {
  return Number.parseInt(color.replace('#', ''), 16);
}
