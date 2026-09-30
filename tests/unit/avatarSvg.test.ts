import { describe, expect, it } from 'vitest';
import { avatarKey, avatarSvg } from '../../src/art/avatarSvg';
import { AVATAR_ITEMS } from '../../src/config/avatarItems';
import { DEFAULT_LOADOUT, equip } from '../../src/profile/avatar';

describe('avatar renderer', () => {
  it('draws every item without breaking the SVG', () => {
    for (const item of AVATAR_ITEMS) {
      const svg = avatarSvg(equip(DEFAULT_LOADOUT, item.id));
      expect(svg.startsWith('<svg'), item.id).toBe(true);
      expect(svg.endsWith('</svg>'), item.id).toBe(true);
      expect(svg, item.id).not.toMatch(/undefined|NaN/);
    }
  });

  it('shows the colors of what is worn', () => {
    const pinkHair = equip(DEFAULT_LOADOUT, 'haircolor_pink');
    expect(avatarSvg(pinkHair)).toContain('#ff8fc4');
    expect(avatarSvg(DEFAULT_LOADOUT)).not.toContain('#ff8fc4');
  });

  it('has a stable cache key per outfit', () => {
    expect(avatarKey(DEFAULT_LOADOUT)).toBe(avatarKey(structuredClone(DEFAULT_LOADOUT)));
    expect(avatarKey(equip(DEFAULT_LOADOUT, 'hair_bob'))).not.toBe(avatarKey(DEFAULT_LOADOUT));
  });
});
