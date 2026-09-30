import { deepFreeze } from './deepFreeze';

/** House exterior swatches (DESIGN.md 5, step 3). The first is the default. */
export interface HouseColorDef {
  readonly id: string;
  readonly name: string;
  readonly color: string;
}

// prettier-ignore
export const HOUSE_COLORS: readonly HouseColorDef[] = deepFreeze([
  { id: 'butter',   name: 'Butter',   color: '#f6d77a' },
  { id: 'peach',    name: 'Peach',    color: '#f7b98b' },
  { id: 'rose',     name: 'Rose',     color: '#f2a7b5' },
  { id: 'lilac',    name: 'Lilac',    color: '#c7b3e6' },
  { id: 'sky',      name: 'Sky',      color: '#a7cdef' },
  { id: 'mint',     name: 'Mint',     color: '#a8dcc0' },
  { id: 'sage',     name: 'Sage',     color: '#b8c79a' },
  { id: 'cream',    name: 'Cream',    color: '#f3ead6' },
]);

export const DEFAULT_HOUSE_COLOR = HOUSE_COLORS[0]!.id;
