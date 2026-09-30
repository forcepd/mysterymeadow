/**
 * Small helpers shared by the SVG art builders (DESIGN 16.2). Pure: no DOM, no Phaser, so the
 * art can be unit-tested and used by both React (<img>) and Phaser (textures).
 */

export const OUTLINE = '#4a3b33';

/** Numbers in SVG markup: one decimal place keeps strings short and stable. */
export function n(value: number): string {
  return String(Math.round(value * 10) / 10);
}

function channels(hex: string): [number, number, number] {
  const v = Number.parseInt(hex.replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** Blends two #rrggbb colors; t = 0 is `a`, 1 is `b`. */
export function mix(a: string, b: string, t: number): string {
  const ca = channels(a);
  const cb = channels(b);
  const out = ca.map((c, i) => Math.round(c + (cb[i]! - c) * t));
  return `#${out.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

export const darken = (color: string, t: number): string => mix(color, '#000000', t);
export const lighten = (color: string, t: number): string => mix(color, '#ffffff', t);

/** Perceived brightness, 0 (black) to 1 (white). */
export function luminance(color: string): number {
  const [r, g, b] = channels(color);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** The soft outline every shape uses. */
export function stroke(color = OUTLINE, width = 3.5): string {
  return `stroke="${color}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"`;
}

/**
 * A thick "noodle" (tails, tufts, gill fronds): an outline stroke with a colored stroke on top.
 */
export function noodle(d: string, color: string, width: number, outline = OUTLINE): string {
  return (
    `<path d="${d}" fill="none" stroke="${outline}" stroke-width="${width + 6}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`
  );
}

/** A four-point twinkle star (Sparkle glitter, celebrations). */
export function twinkle(x: number, y: number, r: number, color: string): string {
  const k = r * 0.28;
  return `<path d="M${n(x)} ${n(y - r)} Q${n(x + k)} ${n(y - k)} ${n(x + r)} ${n(y)} Q${n(x + k)} ${n(y + k)} ${n(x)} ${n(y + r)} Q${n(x - k)} ${n(y + k)} ${n(x - r)} ${n(y)} Q${n(x - k)} ${n(y - k)} ${n(x)} ${n(y - r)} Z" fill="${color}"/>`;
}

/** Mirrors markup drawn for the right side onto the left (ears, wings, whiskers). */
export function mirrored(right: string): string {
  return `${right}<g transform="scale(-1 1)">${right}</g>`;
}

export interface ViewBox {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export function svgDocument(view: ViewBox, body: string, defs = ''): string {
  const d = defs ? `<defs>${defs}</defs>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view.x} ${view.y} ${view.w} ${view.h}" width="${view.w}" height="${view.h}">${d}${body}</svg>`;
}

/** As a data URI for <img src> and Phaser texture loading. */
export function svgDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Short stable hash (FNV-1a) for texture cache keys. */
export function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16);
}
