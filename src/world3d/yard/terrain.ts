/**
 * Ground height (units) at a ground point. Flat over the yard, the house, the gate path and a
 * margin around them (so the sim's flat 2D positions stay on the ground), then gentle rolling
 * hills beyond, which frame the yard when the camera turns.
 */

/** The flat area: x within +-FLAT_X, z from -FLAT_BACK to +FLAT_FRONT. */
export const FLAT_X = 9.5;
export const FLAT_BACK = 8;
export const FLAT_FRONT = 6.5;
/** Hills reach full height this far past the flat area. */
const RAMP = 14;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

/** Smooth, deterministic bumps in -1..1. */
function bumps(x: number, z: number): number {
  return (
    0.5 * Math.sin(x * 0.19 + 1.3) * Math.cos(z * 0.23 - 0.4) +
    0.3 * Math.sin((x + z) * 0.11 + 2.1) +
    0.2 * Math.cos((x - 2 * z) * 0.07)
  );
}

export function terrainHeight(x: number, z: number): number {
  const dx = Math.max(0, Math.abs(x) - FLAT_X);
  const dz = Math.max(0, z - FLAT_FRONT, -z - FLAT_BACK);
  const d = Math.hypot(dx, dz);
  if (d === 0) return 0;
  return smoothstep(0, RAMP, d) * (2.4 + 1.8 * bumps(x, z));
}
