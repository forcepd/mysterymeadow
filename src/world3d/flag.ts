/**
 * The 3D world is opt-in until it matches the original (DESIGN-3D build plan): add `?3d` to the
 * address. Without it the game runs the original Phaser world.
 */
export function is3DEnabled(search: string = globalThis.location?.search ?? ''): boolean {
  const value = new URLSearchParams(search).get('3d');
  return value !== null && value !== '0' && value !== 'false';
}
