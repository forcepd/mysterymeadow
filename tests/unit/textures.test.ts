import { describe, expect, it } from 'vitest';
import { ANIMAL_VIEW } from '../../src/art/animalSvg';
import { itemArt } from '../../src/assets/manifest';
import { ITEMS, isPlaceable } from '../../src/config/items';
import { MAX_TEXTURE_PX, texturePixels } from '../../src/game/sprites/svgTexture';
import { WORLD_WIDTH } from '../../src/game/constants';

describe('texture sizes (DESIGN 18.5: textures ≤ 4096 px)', () => {
  it('builds pictures at 2x for Retina', () => {
    expect(texturePixels({ w: ANIMAL_VIEW.w, h: ANIMAL_VIEW.h })).toEqual({
      w: ANIMAL_VIEW.w * 2,
      h: ANIMAL_VIEW.h * 2,
    });
  });

  it('never goes over the cap, keeping the shape', () => {
    const px = texturePixels({ w: 3000, h: 1500 });
    expect(px.w).toBe(MAX_TEXTURE_PX);
    expect(px.h).toBe(MAX_TEXTURE_PX / 2);
  });

  it('even the biggest item at the biggest tile size fits', () => {
    for (const d of ITEMS.filter(isPlaceable)) {
      // A generous tile: a whole-world-wide room only 6 tiles across.
      const tile = WORLD_WIDTH / 6;
      const art = itemArt(d, d.size.w * tile, d.size.h * tile, 0);
      const px = texturePixels(art.size);
      expect(Math.max(px.w, px.h), d.id).toBeLessThanOrEqual(MAX_TEXTURE_PX);
    }
  });
});
