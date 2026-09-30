import type { PetOutfitItemDef } from '../config/items';
import { OUTLINE, darken, lighten, n, stroke, twinkle } from './svg';

/**
 * Pet outfit art (DESIGN 10.3) as SVG markup, drawn around an anchor at (0, 0) for a standard head
 * (radius 27). The animal builder moves and scales it onto each species' outfit anchors.
 */

/** Drawn behind the animal's body instead of on top. */
export function isBackOutfit(def: PetOutfitItemDef): boolean {
  return def.kind === 'cape';
}

/**
 * Outfits drawn to fit each animal's own shape instead of at a fixed anchor: clothes on the body
 * (under the head and feet) and things around the neck (over the body, under the chin).
 */
export function fittedLayer(def: PetOutfitItemDef): 'body' | 'neck' | null {
  if (def.kind === 'sweater' || def.kind === 'tutu') return 'body';
  if (def.kind === 'scarf' || def.kind === 'bandana') return 'neck';
  return null;
}

/** An animal's shape, for fitted outfits (sprite space). */
export interface OutfitFit {
  /** Body center and half sizes. */
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
  /** The body outline as an unclosed element (`<ellipse ...` or `<path ...`). */
  readonly bodyShape: string;
  /** The clipPath id that holds the body shape. */
  readonly bodyClip: string;
  /** Where the chin is (bottom of the head) and the head's half sizes. */
  readonly chinY: number;
  readonly hw: number;
  readonly hr: number;
}

/** Half the body's width at height y (0 outside it). */
function bodyHalfWidth(fit: OutfitFit, y: number): number {
  const t = (y - fit.cy) / fit.ry;
  return Math.abs(t) >= 1 ? 0 : fit.rx * Math.sqrt(1 - t * t);
}

/** The outfit fitted to this animal. `layer` picks the body part or the neck part. */
export function fittedOutfit(
  def: PetOutfitItemDef,
  fit: OutfitFit,
  layer: 'body' | 'neck',
): string {
  const c = def.color;
  const c2 = def.color2 ?? '#ffffff';
  switch (def.kind) {
    case 'sweater':
      return layer === 'body' ? sweater(fit, c, c2) : collar(fit, c);
    case 'tutu':
      return layer === 'body' ? tutu(fit, c) : '';
    case 'scarf':
      return layer === 'neck' ? scarf(fit, c, c2) : '';
    case 'bandana':
      return layer === 'neck' ? bandana(fit, c, c2) : '';
    default:
      return '';
  }
}

/** A knitted sweater on the body: stripes, a ribbed hem, and the belly and feet showing below. */
function sweater(fit: OutfitFit, c: string, c2: string): string {
  const top = fit.cy - fit.ry - 2;
  const hem = fit.cy + fit.ry * 0.42;
  const w = fit.rx + 4;
  const rib = darken(c, 0.12);
  const ribs: string[] = [];
  for (let x = -w; x <= w; x += 5) ribs.push(`M${n(x)} ${n(hem - 7)} L${n(x)} ${n(hem)}`);
  const stripeY = fit.cy - fit.ry * 0.05;
  const inside =
    `<rect x="${n(-w)}" y="${n(top)}" width="${n(w * 2)}" height="${n(hem - top)}" fill="${c}"/>` +
    `<rect x="${n(-w)}" y="${n(stripeY)}" width="${n(w * 2)}" height="5" fill="${c2}"/>` +
    `<rect x="${n(-w)}" y="${n(stripeY + 9)}" width="${n(w * 2)}" height="3" fill="${c2}"/>` +
    `<rect x="${n(-w)}" y="${n(hem - 7)}" width="${n(w * 2)}" height="7" fill="${rib}"/>` +
    `<path d="${ribs.join(' ')}" stroke="${darken(c, 0.25)}" stroke-width="1.5"/>` +
    `<path d="M${n(-w)} ${n(hem)} L${n(w)} ${n(hem)}" stroke="${OUTLINE}" stroke-width="3"/>`;
  return (
    `<g clip-path="url(#${fit.bodyClip})">${inside}</g>` +
    // Keep the animal's own outline crisp over the knit.
    `${fit.bodyShape} fill="none" ${stroke(OUTLINE)}/>`
  );
}

/** The sweater's ribbed collar, peeking out under the chin. */
function collar(fit: OutfitFit, c: string): string {
  const w = Math.min(fit.hw * 0.62, fit.rx * 0.8);
  const y = fit.chinY;
  const rib = darken(c, 0.12);
  return `<path d="M${n(-w)} ${n(y - 5)} Q0 ${n(y + 3)} ${n(w)} ${n(y - 5)} L${n(w)} ${n(y)} Q0 ${n(y + 8)} ${n(-w)} ${n(y)} Z" fill="${rib}" ${stroke(OUTLINE, 2.5)}/>`;
}

/** A flared, ruffled skirt at the waist. */
function tutu(fit: OutfitFit, c: string): string {
  const wy = fit.cy - fit.ry * 0.02;
  const waist = Math.max(bodyHalfWidth(fit, wy), fit.rx * 0.6) + 1;
  const flare = waist * 1.08 + 7;
  const layer = (color: string, drop: number, spread: number, scallops: number) => {
    const w = flare * spread;
    const y = wy + drop;
    let d = `M${n(-waist)} ${n(wy)} L${n(waist)} ${n(wy)} L${n(w)} ${n(y)}`;
    const step = (2 * w) / scallops;
    for (let i = 0; i < scallops; i++) {
      const x0 = w - i * step;
      d += ` Q${n(x0 - step / 2)} ${n(y + 8)} ${n(x0 - step)} ${n(y)}`;
    }
    return `<path d="${d} Z" fill="${color}" ${stroke(OUTLINE, 2.5)}/>`;
  };
  const dots = [-0.5, -0.15, 0.2, 0.55]
    .map((t, i) => twinkle(flare * t, wy + 6 + (i % 2) * 3, 2.5, '#ffffff'))
    .join('');
  return (
    layer(lighten(c, 0.35), 14, 1.07, 9) +
    layer(c, 10, 1, 7) +
    `<rect x="${n(-waist)}" y="${n(wy - 3)}" width="${n(waist * 2)}" height="6" rx="3" fill="${darken(c, 0.15)}" ${stroke(OUTLINE, 2)}/>` +
    dots
  );
}

/** A striped scarf wrapped around the neck, with one fringed end hanging down. */
function scarf(fit: OutfitFit, c: string, c2: string): string {
  const w = Math.min(fit.hw * 0.9, fit.rx * 0.95);
  const y = fit.chinY;
  const band =
    `M${n(-w)} ${n(y - 7)} Q0 ${n(y + 1)} ${n(w)} ${n(y - 7)} ` +
    `L${n(w)} ${n(y + 3)} Q0 ${n(y + 12)} ${n(-w)} ${n(y + 3)} Z`;
  const tx = w * 0.35;
  const tail =
    `<g transform="rotate(8 ${n(tx)} ${n(y + 4)})">` +
    `<rect x="${n(tx - 5.5)}" y="${n(y + 2)}" width="11" height="22" rx="3" fill="${c}" ${stroke(OUTLINE, 2.5)}/>` +
    `<path d="M${n(tx - 4)} ${n(y + 13)} L${n(tx + 4)} ${n(y + 13)}" stroke="${c2}" stroke-width="2.5" stroke-linecap="round"/>` +
    `<path d="M${n(tx - 3.5)} ${n(y + 24)} l0 4 M${n(tx)} ${n(y + 24)} l0 4 M${n(tx + 3.5)} ${n(y + 24)} l0 4" stroke="${OUTLINE}" stroke-width="2" stroke-linecap="round"/>` +
    `</g>`;
  // One knitted stripe along the middle of the band.
  const stripe = `<path d="M${n(-w + 3)} ${n(y - 2)} Q0 ${n(y + 7)} ${n(w - 3)} ${n(y - 2)}" fill="none" stroke="${c2}" stroke-width="2.5" stroke-dasharray="5 3" stroke-linecap="round"/>`;
  return tail + `<path d="${band}" fill="${c}" ${stroke(OUTLINE, 2.5)}/>` + stripe;
}

/** A polka-dot neckerchief tied under the chin, pointing down over the chest. */
function bandana(fit: OutfitFit, c: string, c2: string): string {
  const w = Math.min(fit.hw * 0.68, fit.rx * 0.8);
  const y = fit.chinY - 4;
  const tip = y + Math.max(16, fit.hr * 0.72);
  const dots = [
    [-0.35, 0.3],
    [0.3, 0.25],
    [0, 0.6],
    [-0.1, 0.15],
  ]
    .map(
      ([fx, fy]) =>
        `<circle cx="${n(w * fx!)}" cy="${n(y + (tip - y) * fy!)}" r="2" fill="${c2}"/>`,
    )
    .join('');
  return (
    `<path d="M${n(-w)} ${n(y)} Q0 ${n(y + 5)} ${n(w)} ${n(y)} Q${n(w * 0.45)} ${n((y + tip) / 2 + 2)} 0 ${n(tip)} Q${n(-w * 0.45)} ${n((y + tip) / 2 + 2)} ${n(-w)} ${n(y)} Z" fill="${c}" ${stroke(OUTLINE, 2.5)}/>` +
    dots +
    // The knot's two little ends, off to one side.
    `<path d="M${n(w - 2)} ${n(y)} l7 -3 l1 6 Z M${n(w - 2)} ${n(y)} l6 5 l-4 3 Z" fill="${c}" ${stroke(OUTLINE, 2)}/>`
  );
}

/**
 * The outfit's markup at the anchor. `eyeDx` is how far each eye is from the middle of the face
 * (in the same standard-head units), so glasses sit on the eyes.
 */
export function outfitFragment(def: PetOutfitItemDef, eyeDx = 10): string {
  const c = def.color;
  const c2 = def.color2 ?? '#ffffff';
  const s = stroke(OUTLINE, 3);
  switch (def.kind) {
    // Head.
    case 'party':
      return (
        `<path d="M-14 6 L0 -30 L14 6 Q0 10 -14 6 Z" fill="${c}" ${s}/>` +
        `<path d="M-8 -8 L8 -8 M-11 0 L11 0" stroke="${c2}" stroke-width="3"/>` +
        `<circle cx="0" cy="-31" r="5.5" fill="${c2}" ${s}/>`
      );
    case 'bow':
      return (
        `<path d="M0 0 L-19 -11 Q-23 0 -19 11 Z" fill="${c}" ${s}/>` +
        `<path d="M0 0 L19 -11 Q23 0 19 11 Z" fill="${c}" ${s}/>` +
        `<circle cx="0" cy="0" r="5.5" fill="${c}" ${s}/>`
      );
    case 'flower': {
      const petals = [0, 1, 2, 3, 4]
        .map((i) => {
          const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
          return `<circle cx="${n(12 + Math.cos(a) * 7)}" cy="${n(2 + Math.sin(a) * 7)}" r="5.5" fill="${c2}" ${stroke(OUTLINE, 2)}/>`;
        })
        .join('');
      return `${petals}<circle cx="12" cy="2" r="5" fill="${c}" ${stroke(OUTLINE, 2)}/>`;
    }
    case 'crown':
      return (
        `<path d="M-16 4 L-16 -12 L-8 -2 L0 -16 L8 -2 L16 -12 L16 4 Z" fill="${c}" ${s}/>` +
        `<circle cx="0" cy="-3" r="3" fill="#ff6f9a"/><circle cx="-9" cy="0" r="2" fill="#8fd6ff"/><circle cx="9" cy="0" r="2" fill="#8fd6ff"/>`
      );
    // Body.
    case 'cape':
      return (
        `<path d="M-26 -22 L26 -22 Q40 4 44 26 Q0 34 -44 26 Q-40 4 -26 -22 Z" fill="${c}" ${s}/>` +
        `<circle cx="0" cy="-20" r="5" fill="${c2}" ${stroke(OUTLINE, 2)}/>`
      );
    // Face.
    case 'glasses':
      return (
        `<circle cx="${n(-eyeDx)}" cy="0" r="7.5" fill="#ffffff" fill-opacity="0.25" stroke="${c}" stroke-width="3"/>` +
        `<circle cx="${n(eyeDx)}" cy="0" r="7.5" fill="#ffffff" fill-opacity="0.25" stroke="${c}" stroke-width="3"/>` +
        `<path d="M${n(-eyeDx + 7.5)} 0 L${n(eyeDx - 7.5)} 0" stroke="${c}" stroke-width="3"/>`
      );
    case 'star':
      return (
        [-eyeDx, eyeDx].map((x) => starShape(x, 0, 9.5, c)).join('') +
        `<path d="M${n(-eyeDx + 8)} -1 L${n(eyeDx - 8)} -1" stroke="${c}" stroke-width="3"/>` +
        twinkle(-eyeDx + 3, -3, 2.5, '#ffffff')
      );
    default:
      return '';
  }
}

function starShape(cx: number, cy: number, r: number, color: string): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.45 : r;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${n(cx + Math.cos(a) * rr)},${n(cy + Math.sin(a) * rr)}`);
  }
  return `<polygon points="${pts.join(' ')}" fill="${color}" ${stroke(OUTLINE, 2)}/>`;
}
