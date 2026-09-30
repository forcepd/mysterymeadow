/** Logical world size. Phaser's FIT mode scales this to the screen, keeping aspect ratio. */
export const WORLD_WIDTH = 1280;
export const WORLD_HEIGHT = 800;

export const COLORS = {
  grass: 0xbfe8a8,
  grassDark: 0x7cc46a,
  path: 0xecd9a8,
  pathEdge: 0xd9c08a,
  fence: 0xfff6e3,
  fenceEdge: 0xc6ab7c,
  roof: 0xd9776a,
  roofEdge: 0xa9544a,
  door: 0x9b6a45,
  window: 0xbfe3f5,
  outline: 0x4a3b33,
  silhouette: 0x4b4560,
  ripple: 0xffffff,
  heart: 0xff8fb1,
  coin: 0xf5b93a,
  select: 0xffffff,
} as const;

export const FONT = 'Nunito, system-ui, sans-serif';

/** Text styles render at 2x so they stay crisp on Retina iPads. */
export const TEXT_RESOLUTION = 2;
