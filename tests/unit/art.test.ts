import { describe, expect, it } from 'vitest';
import {
  ANIMAL_VIEW,
  PORTRAIT_VIEW,
  animalKey,
  animalSvg,
  mysterySvg,
} from '../../src/art/animalSvg';
import { hasItemArt, itemSvg } from '../../src/art/itemSvg';
import { mix } from '../../src/art/svg';
import { ASSET_MANIFEST, animalArt, itemArt } from '../../src/assets/manifest';
import { ITEMS, isPlaceable, type PetOutfitItemDef } from '../../src/config/items';
import { SPECIES } from '../../src/config/species';

/** Well-formed enough for a browser: starts and ends right, no bad numbers, tags balance. */
function expectValidSvg(svg: string, label: string) {
  expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'), label).toBe(true);
  expect(svg.endsWith('</svg>'), label).toBe(true);
  expect(svg, label).not.toMatch(/undefined|NaN|Infinity|null/);
  const stack: string[] = [];
  for (const m of svg.matchAll(/<(\/?)([a-zA-Z]+)[^>]*?(\/?)>/g)) {
    const [, closing, tag, selfClosing] = m;
    if (selfClosing) continue;
    if (closing) expect(stack.pop(), `${label}: </${tag}>`).toBe(tag);
    else stack.push(tag!);
  }
  expect(stack, label).toEqual([]);
}

const OUTFITS = ITEMS.filter((i): i is PetOutfitItemDef => i.category === 'petOutfit');

describe('animal art', () => {
  it('draws every species and color, plain, Sparkle, and as a silhouette', () => {
    for (const s of SPECIES) {
      for (const v of s.variants) {
        const plain = animalSvg({ speciesId: s.id, variantId: v.id });
        expectValidSvg(plain, `${s.id} ${v.id}`);
        // Its colors are really used (palette swaps, DESIGN 16.2).
        expect(plain, `${s.id} ${v.id}`).toContain(v.colors.main);

        const sparkle = animalSvg({ speciesId: s.id, variantId: v.id, isSparkle: true });
        expectValidSvg(sparkle, `${s.id} ${v.id} sparkle`);
        expect(sparkle).toContain('url(#shimmer)');
        expect(sparkle).not.toBe(plain);

        const shadow = animalSvg({ speciesId: s.id, variantId: v.id, silhouette: true });
        expectValidSvg(shadow, `${s.id} ${v.id} silhouette`);
        expect(shadow).not.toContain(v.colors.main);
      }
    }
  });

  it('gives each species its own look', () => {
    const first = (id: string) =>
      animalSvg({ speciesId: id, variantId: '' }).replace(/#[0-9a-f]{6}/gi, '');
    const shapes = new Set(SPECIES.map((s) => first(s.id)));
    expect(shapes.size).toBe(SPECIES.length);
  });

  it('dresses every species in every outfit', () => {
    for (const s of SPECIES) {
      for (const o of OUTFITS) {
        const svg = animalSvg({
          speciesId: s.id,
          variantId: s.variants[0]!.id,
          outfit: { [o.slot]: o.id },
        });
        expectValidSvg(svg, `${s.id} in ${o.id}`);
        expect(svg, `${s.id} in ${o.id}`).toContain(o.color);
      }
    }
  });

  it('draws capes behind the body and hats on top', () => {
    const svg = animalSvg({
      speciesId: 'puppy',
      variantId: 'golden',
      outfit: { body: 'hero_cape', head: 'party_hat' },
    });
    const body = svg.indexOf('fill="#e8b865"');
    expect(svg.indexOf('#ef6f6f')).toBeLessThan(body); // cape
    expect(svg.lastIndexOf('#ff8fc4')).toBeGreaterThan(body); // hat
  });

  it('fits clothes to the animal: sweaters on the body, scarves and bandanas under the chin', () => {
    const look = (outfit: Record<string, string>) =>
      animalSvg({ speciesId: 'puppy', variantId: 'golden', outfit });
    const body = (svg: string) => svg.indexOf('fill="#e8b865"');
    // The face is drawn with its eyes; the chin things come after the whole head.
    const eyes = (svg: string) => svg.indexOf('fill="#2e2420"');

    const sweater = look({ body: 'cozy_sweater' });
    const knit = sweater.indexOf('fill="#6fa8ef"');
    expect(knit).toBeGreaterThan(body(sweater));
    expect(knit).toBeLessThan(eyes(sweater)); // Under the head.
    expect(sweater).toMatch(/<g clip-path="url\(#bodyClip\)"><rect[^>]*fill="#6fa8ef"/);

    const scarf = look({ body: 'warm_scarf' });
    expect(scarf.indexOf('fill="#7cc46a"')).toBeGreaterThan(eyes(scarf));
    const bandana = look({ face: 'bandana' });
    expect(bandana.indexOf('fill="#ef6f6f"')).toBeGreaterThan(eyes(bandana));

    const tutu = look({ body: 'pet_tutu' });
    expect(tutu.indexOf('fill="#ffd1e8"')).toBeLessThan(eyes(tutu));
  });

  it('ignores unknown outfits and falls back for unknown colors or species', () => {
    const plain = animalSvg({ speciesId: 'kitten', variantId: 'orange' });
    expect(animalSvg({ speciesId: 'kitten', variantId: 'orange', outfit: { head: 'sofa' } })).toBe(
      plain,
    );
    expectValidSvg(animalSvg({ speciesId: 'kitten', variantId: 'nope' }), 'fallback');
    expect(animalSvg({ speciesId: 'nope', variantId: 'x' })).toBe('');
  });

  it('keys textures by look, so the same look is built once', () => {
    const look = { speciesId: 'fox', variantId: 'red', outfit: { head: 'big_bow' } };
    expect(animalKey(look)).toBe(animalKey(structuredClone(look)));
    expect(animalKey(look)).not.toBe(animalKey({ ...look, outfit: {} }));
    expect(animalKey(look)).not.toBe(animalKey({ ...look, isSparkle: true }));
    expect(animalKey({ ...look, outfit: {} })).toBe('animal.fox.red');
    expect(
      animalKey({ speciesId: 'fox', variantId: 'red', outfit: { head: 'a', body: 'b' } }),
    ).toBe(animalKey({ speciesId: 'fox', variantId: 'red', outfit: { body: 'b', head: 'a' } }));
    // Portraits use a different crop, so a different texture.
    expect(animalArt(look, PORTRAIT_VIEW).key).not.toBe(animalArt(look).key);
  });

  it('has a generic mystery shape that gives nothing away', () => {
    expectValidSvg(mysterySvg(), 'mystery');
    for (const s of SPECIES) expect(mysterySvg()).not.toContain(s.variants[0]!.colors.main);
  });

  it('places sprite-space (0, 0) at the art origin', () => {
    const art = animalArt({ speciesId: 'bunny', variantId: 'white' });
    expect(art.size).toEqual({ w: ANIMAL_VIEW.w, h: ANIMAL_VIEW.h });
    expect(art.origin.x * art.size.w + ANIMAL_VIEW.x).toBeCloseTo(0);
    expect(art.origin.y * art.size.h + ANIMAL_VIEW.y).toBeCloseTo(0);
  });
});

describe('item art', () => {
  const placeables = ITEMS.filter(isPlaceable);

  it('has its own drawing for every lure, furniture item, and bed', () => {
    for (const d of placeables) {
      if (d.category === 'bowl') continue; // The bowl has its own sprite (it shows food left).
      expect(hasItemArt(d.id), d.id).toBe(true);
    }
  });

  it('draws every placeable item at every rotation', () => {
    for (const d of placeables) {
      for (const rotation of [0, 90, 180, 270]) {
        const turned = rotation % 180 !== 0;
        const w = (turned ? d.size.h : d.size.w) * 90;
        const h = (turned ? d.size.w : d.size.h) * 70;
        expectValidSvg(itemSvg(d, w, h, rotation), `${d.id} ${rotation}`);
        expect(itemArt(d, w, h, rotation).key).toContain(`r${rotation}`);
      }
    }
  });
});

describe('asset manifest', () => {
  it('lists every species and placeable item by asset key', () => {
    for (const s of SPECIES) expect(ASSET_MANIFEST[s.assetKey], s.id).toBeDefined();
    for (const i of ITEMS.filter(isPlaceable))
      expect(ASSET_MANIFEST[i.assetKey], i.id).toBeDefined();
  });

  it('mixes colors', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mix('#ff0000', '#0000ff', 0)).toBe('#ff0000');
  });
});
