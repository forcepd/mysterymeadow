import { SPECIES, type SpeciesDef } from '../../config/species';
import type { WorldState } from '../types';

export interface DexEntry {
  species: SpeciesDef;
  /** Any variant seen. Undiscovered species show as silhouettes. */
  discovered: boolean;
  /** Variant ids seen, in the species' variant order. */
  variantsFound: string[];
  sparkleFound: boolean;
}

export interface DexProgress {
  entries: DexEntry[];
  speciesFound: number;
  speciesTotal: number;
  /** Variants plus Sparkles, found out of all there are. */
  looksFound: number;
  looksTotal: number;
}

/** The Animal Dex (DESIGN 17.1 #12) from the discovered keys (`species:variant`, `species:sparkle`). */
export function dexProgress(world: WorldState): DexProgress {
  const found = new Set(world.discoveredDex);
  const entries = SPECIES.map((species) => {
    const variantsFound = species.variants
      .filter((v) => found.has(`${species.id}:${v.id}`))
      .map((v) => v.id);
    const sparkleFound = found.has(`${species.id}:sparkle`);
    return { species, discovered: variantsFound.length > 0, variantsFound, sparkleFound };
  });
  return {
    entries,
    speciesFound: entries.filter((e) => e.discovered).length,
    speciesTotal: entries.length,
    looksFound: entries.reduce((n, e) => n + e.variantsFound.length + (e.sparkleFound ? 1 : 0), 0),
    looksTotal: SPECIES.reduce((n, s) => n + s.variants.length + 1, 0),
  };
}
