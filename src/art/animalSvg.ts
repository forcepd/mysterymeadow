import { getItem, type OutfitSlot, type PetOutfitItemDef } from '../config/items';
import {
  bodyCenterY,
  getSpecies,
  outfitAnchors,
  type ExtraKind,
  type PatternKind,
  type SpeciesArt,
  type VariantColors,
} from '../config/species';
import {
  fittedLayer,
  fittedOutfit,
  isBackOutfit,
  outfitFragment,
  type OutfitFit,
} from './outfitSvg';
import {
  OUTLINE,
  darken,
  hash,
  lighten,
  luminance,
  mirrored,
  mix,
  n,
  noodle,
  stroke,
  svgDocument,
  twinkle,
  type ViewBox,
} from './svg';

/**
 * Parametric animal art (DESIGN 16.2). Every species is built from shared SVG parts (body, head,
 * ears, tail, markings, eyes, nose, extras) picked by its `art` recipe in config/species.ts and
 * colored from its variant's named color slots. Sparkle and silhouettes are palette swaps.
 *
 * Sprite space: body centered near (0, 0), feet on y = +22, facing the viewer (3/4 view).
 */

export interface AnimalLook {
  readonly speciesId: string;
  readonly variantId: string;
  readonly isSparkle?: boolean;
  readonly outfit?: Partial<Record<OutfitSlot, string>>;
  /** Dark shape only (undiscovered Dex entries). */
  readonly silhouette?: boolean;
}

/** Room for the tallest ears, horns, and hats, and the widest tails and wings. */
export const ANIMAL_VIEW: ViewBox = { x: -76, y: -118, w: 152, h: 150 };
/** Head-and-shoulders crop for round portraits. */
export const PORTRAIT_VIEW: ViewBox = { x: -60, y: -104, w: 120, h: 126 };

const EYE = '#2e2420';
const BLUSH = '#ff8fb1';
const SILHOUETTE = { fill: '#4b4560', outline: '#332e44' };
const SHIMMER = ['#ff9fd8', '#b69bff', '#8fd6ff', '#9ff0c8'];

/** The colors a drawing uses. */
interface Paint {
  main: string;
  light: string;
  accent: string;
  dark: string;
  outline: string;
  /** False for silhouettes: shapes only, no face or markings. */
  details: boolean;
}

/** Where the big shapes are, worked out once from the recipe. */
interface Geo {
  art: SpeciesArt;
  bw: number;
  bh: number;
  /** Body center y. */
  by: number;
  hy: number;
  hr: number;
  /** Head half-width. */
  hw: number;
  has: (e: ExtraKind) => boolean;
  patterns: ReadonlySet<PatternKind>;
}

export function paintFor(colors: VariantColors, sparkle: boolean, silhouette: boolean): Paint {
  if (silhouette) {
    const f = SILHOUETTE.fill;
    return { main: f, light: f, accent: f, dark: f, outline: SILHOUETTE.outline, details: false };
  }
  const glow = (c: string) => (sparkle ? lighten(c, 0.25) : c);
  return {
    main: glow(colors.main),
    light: glow(colors.light),
    accent: colors.accent,
    dark: glow(colors.dark ?? darken(colors.main, 0.35)),
    outline: OUTLINE,
    details: true,
  };
}

/** A full standalone SVG of one animal (optionally dressed). Empty string for unknown species. */
export function animalSvg(look: AnimalLook, view: ViewBox = ANIMAL_VIEW): string {
  const species = getSpecies(look.speciesId);
  if (!species) return '';
  const variant = species.variants.find((v) => v.id === look.variantId) ?? species.variants[0]!;
  const sparkle = !!look.isSparkle && !look.silhouette;
  const p = paintFor(variant.colors, sparkle, !!look.silhouette);
  const art = species.art;
  const geo: Geo = {
    art,
    bw: art.body.w,
    bh: art.body.h,
    by: bodyCenterY(art.body),
    hy: art.head.y,
    hr: art.head.r,
    hw: art.head.r * (art.head.wide ?? 1),
    has: (e) => art.extras.includes(e),
    patterns: new Set([...art.patterns, ...(variant.patterns ?? [])]),
  };

  const outfits = look.silhouette ? [] : wornOutfits(look.outfit);
  const anchors = outfitAnchors(species.id);
  const eyeDx = (geo.hw * 0.36) / anchors.scale;
  const dress = (keep: (d: PetOutfitItemDef) => boolean) =>
    outfits
      .filter((d) => fittedLayer(d) === null && keep(d))
      .map((def) => {
        const at = anchors[def.slot];
        return `<g transform="translate(${n(at.x)} ${n(at.y)}) scale(${Math.round(anchors.scale * 100) / 100})">${outfitFragment(def, eyeDx)}</g>`;
      })
      .join('');

  const bodyShape = bodyPath(geo);
  const headShape = `<ellipse cx="0" cy="${n(geo.hy)}" rx="${n(geo.hw)}" ry="${n(geo.hr)}"`;
  // Clothes that fit the animal's own shape (sweater, tutu, scarf, bandana).
  const fit: OutfitFit = {
    cy: geo.by,
    rx: geo.bw / 2,
    ry: geo.bh / 2,
    bodyShape,
    bodyClip: 'bodyClip',
    chinY: geo.hy + geo.hr,
    hw: geo.hw,
    hr: geo.hr,
  };
  const wear = (layer: 'body' | 'neck') =>
    outfits
      .filter((d) => fittedLayer(d) !== null)
      .map((d) => fittedOutfit(d, fit, layer))
      .join('');
  const defs =
    `<clipPath id="bodyClip">${bodyShape}/></clipPath>` +
    `<clipPath id="headClip">${headShape}/></clipPath>` +
    (sparkle
      ? `<linearGradient id="shimmer" x1="0" y1="0" x2="1" y2="1">${SHIMMER.map((c, i) => `<stop offset="${n(i / (SHIMMER.length - 1))}" stop-color="${c}"/>`).join('')}</linearGradient>`
      : '');

  const parts: string[] = [];
  parts.push(dress((d) => d.slot === 'body' && isBackOutfit(d)));
  parts.push(tail(geo, p));
  if (geo.has('batWings')) parts.push(batWings(geo, p));
  if (geo.has('spines')) parts.push(spines(geo, p));
  if (geo.has('mane')) parts.push(maneBack(geo, p));
  if (art.body.shape === 'pony') parts.push(ponyLegs(geo, p));

  // Body and its markings.
  if (geo.has('wool')) parts.push(wool(p, geo.by, geo.bw / 2, geo.bh / 2));
  parts.push(`${bodyShape} fill="${p.main}" ${stroke(p.outline)}/>`);
  if (p.details) parts.push(`<g clip-path="url(#bodyClip)">${bodyMarkings(geo, p)}</g>`);
  if (sparkle) parts.push(shimmerOver('bodyClip', geo.by - geo.bh, geo.bh * 2, geo.bw));
  // Clothes go on the body, under the feet, wings, and head.
  parts.push(wear('body'));
  if (art.body.shape !== 'pony') parts.push(feet(geo, p));
  if (geo.has('featherWings')) parts.push(featherWings(geo, p));
  if (geo.has('flippers')) parts.push(flippers(geo, p));

  // Head.
  parts.push(earsBehind(geo, p));
  parts.push(`${headShape} fill="${geo.has('wool') ? p.light : p.main}" ${stroke(p.outline)}/>`);
  if (p.details) parts.push(`<g clip-path="url(#headClip)">${headMarkings(geo, p)}</g>`);
  if (sparkle) parts.push(shimmerOver('headClip', geo.hy - geo.hr, geo.hr * 2, geo.hw * 2));
  if (geo.has('pouches')) parts.push(pouches(geo, p));
  parts.push(earsFront(geo, p));
  if (geo.has('wool')) parts.push(woolTuft(geo, p));
  if (p.details) parts.push(face(geo, p));
  parts.push(headExtras(geo, p));
  if (sparkle) parts.push(glitter(geo));

  // Scarves, bandanas, and collars sit under the chin, over the body.
  parts.push(wear('neck'));
  parts.push(dress((d) => d.slot === 'body' && !isBackOutfit(d)));
  parts.push(dress((d) => d.slot === 'face'));
  parts.push(dress((d) => d.slot === 'head'));
  return svgDocument(view, parts.join(''), defs);
}

/** Stable texture key: same species, color, sparkle, and outfit = same picture. */
export function animalKey(look: AnimalLook): string {
  const outfit = wornOutfits(look.outfit)
    .map((d) => d.id)
    .join('+');
  const base = `animal.${look.speciesId}.${look.variantId}${look.isSparkle ? '.sparkle' : ''}${look.silhouette ? '.shadow' : ''}`;
  return outfit ? `${base}.${hash(outfit)}` : base;
}

function wornOutfits(outfit: AnimalLook['outfit']): PetOutfitItemDef[] {
  if (!outfit) return [];
  const defs: PetOutfitItemDef[] = [];
  for (const slot of ['body', 'face', 'head'] as const) {
    const id = outfit[slot];
    const def = id ? getItem(id) : undefined;
    if (def?.category === 'petOutfit') defs.push(def);
  }
  return defs;
}

// --- Body -------------------------------------------------------------------------------------

/** The body outline as an unclosed element (callers add attributes and `/>`). */
function bodyPath(g: Geo): string {
  const { bw, bh, by } = g;
  const shape = g.art.body.shape;
  if (shape === 'bird' || shape === 'tall') {
    // An egg: narrower on top.
    const top = by - bh / 2;
    const bottom = by + bh / 2;
    const d =
      `M0 ${n(top)} C${n(bw * 0.42)} ${n(top)} ${n(bw / 2 + 3)} ${n(bottom)} 0 ${n(bottom)} ` +
      `C${n(-bw / 2 - 3)} ${n(bottom)} ${n(-bw * 0.42)} ${n(top)} 0 ${n(top)} Z`;
    return `<path d="${d}"`;
  }
  return `<ellipse cx="0" cy="${n(by)}" rx="${n(bw / 2)}" ry="${n(bh / 2)}"`;
}

function bodyMarkings(g: Geo, p: Paint): string {
  const { bw, bh, by } = g;
  const out: string[] = [];
  const has = (k: PatternKind) => g.patterns.has(k);
  if (has('belly'))
    out.push(
      `<ellipse cx="0" cy="${n(by + bh * 0.14)}" rx="${n(bw * 0.3)}" ry="${n(bh * 0.34)}" fill="${p.light}"/>`,
    );
  if (has('tuxedo'))
    out.push(
      `<ellipse cx="0" cy="${n(by + bh * 0.08)}" rx="${n(bw * 0.36)}" ry="${n(bh * 0.46)}" fill="${p.light}"/>`,
    );
  if (has('bands')) {
    const c = mix(p.light, p.dark, 0.35);
    for (const dy of [-0.08, 0.1, 0.28]) {
      const y = by + bh * dy;
      out.push(
        `<path d="M${n(-bw * 0.22)} ${n(y)} Q0 ${n(y + 4)} ${n(bw * 0.22)} ${n(y)}" fill="none" stroke="${c}" stroke-width="2.5" stroke-linecap="round"/>`,
      );
    }
  }
  if (has('spots'))
    for (const [x, y, r] of [
      [-0.26, -0.18, 0.16],
      [0.24, 0.04, 0.13],
      [-0.05, -0.36, 0.1],
      [0.34, -0.3, 0.09],
    ] as const)
      out.push(
        `<ellipse cx="${n(bw * x)}" cy="${n(by + bh * y)}" rx="${n(bw * r)}" ry="${n(bw * r * 0.8)}" fill="${p.dark}"/>`,
      );
  if (has('patches')) {
    out.push(
      `<path d="M${n(-bw * 0.5)} ${n(by - bh * 0.3)} Q${n(-bw * 0.1)} ${n(by - bh * 0.5)} ${n(-bw * 0.08)} ${n(by)} Q${n(-bw * 0.3)} ${n(by + bh * 0.2)} ${n(-bw * 0.5)} ${n(by + bh * 0.1)} Z" fill="${p.dark}"/>`,
      `<path d="M${n(bw * 0.18)} ${n(by - bh * 0.5)} Q${n(bw * 0.5)} ${n(by - bh * 0.4)} ${n(bw * 0.5)} ${n(by)} Q${n(bw * 0.3)} ${n(by - bh * 0.05)} ${n(bw * 0.2)} ${n(by - bh * 0.25)} Z" fill="#4a3f45"/>`,
    );
  }
  if (has('stripes'))
    for (const x of [-0.3, 0.3])
      for (const dy of [-0.3, -0.05])
        out.push(
          `<path d="M${n(bw * x * 1.4)} ${n(by + bh * dy)} L${n(bw * x)} ${n(by + bh * dy + 3)}" stroke="${p.dark}" stroke-width="4" stroke-linecap="round"/>`,
        );
  return out.join('');
}

function feet(g: Geo, p: Paint): string {
  const color = g.has('webbedFeet') ? p.accent : g.patterns.has('socks') ? p.dark : p.main;
  const x = Math.min(g.bw * 0.24, 20);
  return [-x, x]
    .map(
      (fx) =>
        `<ellipse cx="${n(fx)}" cy="21" rx="9.5" ry="5.5" fill="${color}" ${stroke(p.outline, 3)}/>`,
    )
    .join('');
}

function ponyLegs(g: Geo, p: Paint): string {
  const top = g.by + g.bh * 0.2;
  const hoof = p.dark;
  return [-0.34, -0.14, 0.14, 0.34]
    .map((fx, i) => {
      const x = g.bw * fx - 5.5;
      const leg = i === 0 || i === 3 ? darken(p.main, 0.06) : p.main;
      return (
        `<rect x="${n(x)}" y="${n(top)}" width="11" height="${n(24 - top)}" rx="5" fill="${leg}" ${stroke(p.outline, 3)}/>` +
        `<rect x="${n(x)}" y="17" width="11" height="7" rx="3" fill="${hoof}" ${stroke(p.outline, 3)}/>`
      );
    })
    .join('');
}

function wool(p: Paint, cy: number, rx: number, ry: number): string {
  const puffs: string[] = [];
  const count = 12;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    puffs.push(
      `<circle cx="${n(Math.cos(a) * rx * 0.92)}" cy="${n(cy + Math.sin(a) * ry * 0.88)}" r="${n(ry * 0.36)}" fill="${p.main}" ${stroke(p.outline)}/>`,
    );
  }
  return puffs.join('');
}

function woolTuft(g: Geo, p: Paint): string {
  const y = g.hy - g.hr * 0.85;
  return [-0.35, 0, 0.35]
    .map(
      (x) =>
        `<circle cx="${n(g.hw * x)}" cy="${n(y - (x === 0 ? 4 : 0))}" r="${n(g.hr * 0.3)}" fill="${p.main}" ${stroke(p.outline, 3)}/>`,
    )
    .join('');
}

function featherWings(g: Geo, p: Paint): string {
  const x = g.bw * 0.46;
  const y = g.by;
  const c = darken(p.main, 0.08);
  return mirrored(
    `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(g.bw * 0.13)}" ry="${n(g.bh * 0.3)}" transform="rotate(-22 ${n(x)} ${n(y)})" fill="${c}" ${stroke(p.outline, 3)}/>`,
  );
}

function flippers(g: Geo, p: Paint): string {
  const x = g.bw * 0.46;
  const y = g.by + 2;
  return mirrored(
    `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(g.bw * 0.11)}" ry="${n(g.bh * 0.34)}" transform="rotate(-28 ${n(x)} ${n(y - g.bh * 0.3)})" fill="${p.main}" ${stroke(p.outline, 3)}/>`,
  );
}

function batWings(g: Geo, p: Paint): string {
  const sx = g.bw * 0.22;
  const sy = g.by - g.bh * 0.32;
  const membrane = p.details ? mix(p.main, p.light, 0.45) : p.main;
  const d =
    `M${n(sx)} ${n(sy)} L${n(sx + 34)} ${n(sy - 30)} Q${n(sx + 40)} ${n(sy - 14)} ${n(sx + 44)} ${n(sy - 4)} ` +
    `Q${n(sx + 34)} ${n(sy - 4)} ${n(sx + 32)} ${n(sy + 6)} Q${n(sx + 22)} ${n(sy + 2)} ${n(sx + 16)} ${n(sy + 14)} Z`;
  return mirrored(`<path d="${d}" fill="${membrane}" ${stroke(p.outline, 3)}/>`);
}

function spines(g: Geo, p: Paint): string {
  const cx = 0;
  const cy = (g.by + g.hy) / 2 + 2;
  const rx = g.bw / 2 + 6;
  const ry = (g.by - g.hy) / 2 + g.hr + 4;
  const pts: string[] = [];
  const count = 22;
  for (let i = 0; i <= count; i++) {
    const a = Math.PI * (0.94 + (i / count) * 1.12);
    const r = i % 2 ? 1.2 : 1;
    pts.push(`${n(cx + Math.cos(a) * rx * r)},${n(cy + Math.sin(a) * ry * r)}`);
  }
  pts.push(`${n(rx * 0.9)},${n(g.by + g.bh * 0.3)}`, `${n(-rx * 0.9)},${n(g.by + g.bh * 0.3)}`);
  return `<polygon points="${pts.join(' ')}" fill="${p.dark}" ${stroke(p.outline, 3)}/>`;
}

// --- Tails ------------------------------------------------------------------------------------

function tail(g: Geo, p: Paint): string {
  const tx = g.bw / 2 - 7;
  const ty = g.by - g.bh * 0.12;
  const s = stroke(p.outline, 3);
  switch (g.art.tail) {
    case 'none':
      return '';
    case 'puff':
      return `<circle cx="${n(tx + 5)}" cy="${n(ty - 2)}" r="11" fill="${p.light}" ${s}/>`;
    case 'thin':
      return noodle(
        `M${n(tx)} ${n(ty + 4)} C${n(tx + 24)} ${n(ty + 6)} ${n(tx + 28)} ${n(ty - 18)} ${n(tx + 17)} ${n(ty - 34)}`,
        p.main,
        7,
        p.outline,
      );
    case 'wag':
      return noodle(
        `M${n(tx)} ${n(ty + 2)} Q${n(tx + 20)} ${n(ty - 2)} ${n(tx + 20)} ${n(ty - 24)}`,
        p.main,
        9,
        p.outline,
      );
    case 'bushy':
    case 'ringed': {
      const cx = tx + 14;
      const cy = ty - 16;
      const rot = `rotate(38 ${n(cx)} ${n(cy)})`;
      const shape = `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="13" ry="27" transform="${rot}"`;
      let inside = '';
      if (g.art.tail === 'bushy' || g.patterns.has('tipEars')) {
        inside += `<ellipse cx="${n(cx)}" cy="${n(cy - 22)}" rx="12" ry="11" transform="${rot}" fill="${p.light}"/>`;
      }
      if (g.art.tail === 'ringed') {
        for (const dy of [-12, 0, 12])
          inside += `<rect x="${n(cx - 16)}" y="${n(cy + dy - 3)}" width="32" height="6" transform="${rot}" fill="${p.dark}"/>`;
      }
      return (
        `<clipPath id="tailClip">${shape}/></clipPath>` +
        `${shape} fill="${p.main}"/>` +
        (p.details ? `<g clip-path="url(#tailClip)">${inside}</g>` : '') +
        `${shape} fill="none" ${s}/>`
      );
    }
    case 'curl':
      return noodle(`M${n(tx)} ${n(ty)} c10 -2 15 -12 7 -15 c-7 -2 -8 8 0 7`, p.main, 4, p.outline);
    case 'feather':
      return (
        `<path d="M${n(tx - 4)} ${n(ty - 2)} L${n(tx + 16)} ${n(ty - 18)} L${n(tx + 12)} ${n(ty + 2)} Z" fill="${darken(p.main, 0.06)}" ${s}/>` +
        `<path d="M${n(tx - 4)} ${n(ty + 4)} L${n(tx + 18)} ${n(ty - 6)} L${n(tx + 10)} ${n(ty + 10)} Z" fill="${p.main}" ${s}/>`
      );
    case 'flat':
      return `<path d="M${n(tx - 6)} ${n(ty + 4)} Q${n(tx + 24)} ${n(ty + 18)} ${n(tx + 34)} ${n(ty + 22)} Q${n(tx + 26)} ${n(ty + 4)} ${n(tx - 4)} ${n(ty - 10)} Z" fill="${darken(p.main, 0.08)}" ${s}/>`;
    case 'fin':
      return (
        `<path d="M${n(tx - 4)} ${n(ty - 12)} Q${n(tx + 26)} ${n(ty - 20)} ${n(tx + 36)} ${n(ty + 14)} Q${n(tx + 22)} ${n(ty + 18)} ${n(tx - 4)} ${n(ty + 12)} Z" fill="${p.details ? mix(p.main, '#ffffff', 0.4) : p.main}" ${s}/>` +
        `<path d="M${n(tx - 6)} ${n(ty + 4)} Q${n(tx + 20)} ${n(ty + 4)} ${n(tx + 34)} ${n(ty + 12)} Q${n(tx + 18)} ${n(ty + 14)} ${n(tx - 4)} ${n(ty + 12)} Z" fill="${p.main}" ${s}/>`
      );
    case 'flowing':
      return [p.accent, p.details ? mix(p.accent, '#ffffff', 0.45) : p.accent, p.accent]
        .map((c, i) =>
          noodle(
            `M${n(tx)} ${n(ty - 6 + i * 5)} C${n(tx + 26)} ${n(ty - 12 + i * 5)} ${n(tx + 12)} ${n(ty + 14 + i * 3)} ${n(tx + 26 + i * 2)} ${n(ty + 24 + i * 2)}`,
            c,
            6,
            p.outline,
          ),
        )
        .join('');
    case 'dragon':
      return (
        `<path d="M${n(tx - 4)} ${n(ty + 8)} Q${n(tx + 26)} ${n(ty + 16)} ${n(tx + 34)} ${n(ty - 8)} L${n(tx + 28)} ${n(ty - 8)} Q${n(tx + 20)} ${n(ty + 2)} ${n(tx - 4)} ${n(ty - 8)} Z" fill="${p.main}" ${s}/>` +
        `<path d="M${n(tx + 31)} ${n(ty - 22)} L${n(tx + 40)} ${n(ty - 10)} L${n(tx + 31)} ${n(ty - 4)} L${n(tx + 23)} ${n(ty - 10)} Z" fill="${p.accent}" ${s}/>`
      );
  }
}

// --- Head -------------------------------------------------------------------------------------

function earsBehind(g: Geo, p: Paint): string {
  const { hy, hr, hw } = g;
  const size = g.art.earSize ?? 1;
  const s = stroke(p.outline, 3);
  const inner = p.details ? p.accent : p.main;
  switch (g.art.ears) {
    case 'long': {
      const len = hr * 0.85 * size;
      const cx = hr * 0.36;
      const cy = hy - hr * 0.72 - len * 0.55;
      const rot = `rotate(10 ${n(cx)} ${n(cy + len)})`;
      return mirrored(
        `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(hr * 0.27)}" ry="${n(len)}" transform="${rot}" fill="${p.main}" ${s}/>` +
          `<ellipse cx="${n(cx)}" cy="${n(cy + len * 0.08)}" rx="${n(hr * 0.13)}" ry="${n(len * 0.7)}" transform="${rot}" fill="${inner}"/>`,
      );
    }
    case 'pointy':
    case 'pig': {
      const a = [hw * 0.18, hy - hr * 0.86];
      const b = [hw * 0.86, hy - hr * 0.42];
      const t = [hw * 0.74, hy - hr * (0.92 + 0.5 * size)];
      const c = [(a[0]! + b[0]! + t[0]!) / 3, (a[1]! + b[1]! + t[1]!) / 3];
      const shrink = (q: number[], k: number) => [
        c[0]! + (q[0]! - c[0]!) * k,
        c[1]! + (q[1]! - c[1]!) * k,
      ];
      const tri = (pts: number[][]) => pts.map((q) => `${n(q[0]!)},${n(q[1]!)}`).join(' ');
      const innerPts = [shrink(a, 0.55), shrink(b, 0.55), shrink(t, 0.6)];
      let tip = '';
      if (g.patterns.has('tipEars') && p.details) {
        const k = 0.42;
        const lerp = (q: number[]) => [t[0]! + (q[0]! - t[0]!) * k, t[1]! + (q[1]! - t[1]!) * k];
        tip = `<polygon points="${tri([t, lerp(a), lerp(b)])}" fill="${p.dark}"/>`;
      }
      return mirrored(
        `<polygon points="${tri([a, b, t])}" fill="${p.main}" ${s}/>` +
          `<polygon points="${tri(innerPts)}" fill="${inner}"/>` +
          tip +
          (tip ? `<polygon points="${tri([a, b, t])}" fill="none" ${s}/>` : ''),
      );
    }
    case 'round': {
      const r = hr * 0.3 * size;
      const cx = hw * 0.7;
      const cy = hy - hr * 0.76;
      const ring = g.patterns.has('cheekMarks') && p.details ? p.light : p.main;
      return mirrored(
        `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${ring}" ${s}/>` +
          `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r * 0.55)}" fill="${g.patterns.has('cheekMarks') ? p.main : inner}"/>`,
      );
    }
    case 'fluffy': {
      const cx = hw * 0.92;
      const cy = hy - hr * 0.52;
      return mirrored(
        `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(hr * 0.5)}" fill="${p.main}" ${s}/>` +
          `<circle cx="${n(cx - 2)}" cy="${n(cy + 2)}" r="${n(hr * 0.3)}" fill="${p.details ? p.light : p.main}"/>`,
      );
    }
    case 'tufts': {
      const pts = [
        [hw * 0.3, hy - hr * 0.86],
        [hw * 0.86, hy - hr * 0.5],
        [hw * 0.82, hy - hr * 1.22],
      ];
      return mirrored(
        `<polygon points="${pts.map((q) => `${n(q[0]!)},${n(q[1]!)}`).join(' ')}" fill="${darken(p.main, 0.08)}" ${s}/>`,
      );
    }
    case 'gills': {
      const fronds = [-38, -8, 22]
        .map((deg, i) => {
          const x0 = hw * 0.82;
          const y0 = hy - hr * 0.3 + i * hr * 0.26;
          const a = (deg * Math.PI) / 180;
          const len = hr * 0.62;
          const x1 = x0 + Math.cos(a) * len;
          const y1 = y0 + Math.sin(a) * len;
          return noodle(`M${n(x0)} ${n(y0)} L${n(x1)} ${n(y1)}`, inner, 5, p.outline);
        })
        .join('');
      return mirrored(fronds);
    }
    default:
      return '';
  }
}

/** Ears that hang in front of the head's outline. */
function earsFront(g: Geo, p: Paint): string {
  if (g.art.ears !== 'floppy') return '';
  const cx = g.hw * 0.94;
  const cy = g.hy + g.hr * 0.05;
  return mirrored(
    `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(g.hr * 0.25)}" ry="${n(g.hr * 0.52)}" transform="rotate(-16 ${n(cx)} ${n(cy - g.hr * 0.5)})" fill="${p.dark}" ${stroke(p.outline, 3)}/>`,
  );
}

function headMarkings(g: Geo, p: Paint): string {
  const { hy, hr, hw } = g;
  const has = (k: PatternKind) => g.patterns.has(k);
  const out: string[] = [];
  if (has('muzzle') || has('cheekMarks'))
    out.push(
      `<ellipse cx="0" cy="${n(hy + hr * 0.5)}" rx="${n(hw * 0.62)}" ry="${n(hr * 0.42)}" fill="${p.light}"/>`,
    );
  if (has('cheekMarks'))
    for (const x of [-1, 1])
      out.push(
        `<ellipse cx="${n(x * hw * 0.36)}" cy="${n(hy - hr * 0.42)}" rx="${n(hr * 0.15)}" ry="${n(hr * 0.09)}" fill="${p.light}"/>`,
      );
  if (has('tuxedo'))
    out.push(
      `<path d="M0 ${n(hy - hr * 0.25)} C${n(hw * 0.5)} ${n(hy - hr * 0.7)} ${n(hw * 0.9)} ${n(hy + hr * 0.1)} ${n(hw * 0.3)} ${n(hy + hr)} L${n(-hw * 0.3)} ${n(hy + hr)} C${n(-hw * 0.9)} ${n(hy + hr * 0.1)} ${n(-hw * 0.5)} ${n(hy - hr * 0.7)} 0 ${n(hy - hr * 0.25)} Z" fill="${p.light}"/>`,
    );
  if (has('faceDisc'))
    for (const x of [-1, 1])
      out.push(
        `<circle cx="${n(x * hw * 0.36)}" cy="${n(hy)}" r="${n(hr * 0.42)}" fill="${p.light}"/>`,
      );
  if (has('mask'))
    out.push(
      `<path d="M${n(-hw)} ${n(hy - hr * 0.1)} Q${n(-hw * 0.4)} ${n(hy - hr * 0.42)} 0 ${n(hy - hr * 0.1)} Q${n(hw * 0.4)} ${n(hy - hr * 0.42)} ${n(hw)} ${n(hy - hr * 0.1)} L${n(hw)} ${n(hy + hr * 0.22)} Q${n(hw * 0.4)} ${n(hy + hr * 0.32)} 0 ${n(hy + hr * 0.12)} Q${n(-hw * 0.4)} ${n(hy + hr * 0.32)} ${n(-hw)} ${n(hy + hr * 0.22)} Z" fill="${p.dark}"/>`,
    );
  if (has('spots'))
    out.push(
      `<ellipse cx="${n(hw * 0.45)}" cy="${n(hy - hr * 0.3)}" rx="${n(hr * 0.3)}" ry="${n(hr * 0.26)}" fill="${p.dark}"/>`,
    );
  if (has('patches'))
    out.push(
      `<ellipse cx="${n(-hw * 0.6)}" cy="${n(hy - hr * 0.55)}" rx="${n(hr * 0.45)}" ry="${n(hr * 0.35)}" fill="${p.dark}"/>`,
    );
  if (has('stripes'))
    for (const x of [-5, 0, 5])
      out.push(
        `<path d="M${n(x)} ${n(hy - hr * 0.98)} L${n(x * 0.8)} ${n(hy - hr * 0.62)}" stroke="${p.dark}" stroke-width="3.5" stroke-linecap="round"/>`,
      );
  return out.join('');
}

function pouches(g: Geo, p: Paint): string {
  const x = g.hw * 0.7;
  const y = g.hy + g.hr * 0.38;
  return mirrored(
    `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(g.hr * 0.36)}" ry="${n(g.hr * 0.3)}" fill="${p.light}" ${stroke(p.outline, 3)}/>`,
  );
}

function face(g: Geo, p: Paint): string {
  const { hy, hr, hw } = g;
  const k = hr / 27;
  const out: string[] = [];
  const ex = hw * 0.36;
  const ey = hy - hr * 0.02;

  // Blush first, so noses and whiskers sit on top.
  out.push(
    mirrored(
      `<ellipse cx="${n(hw * 0.6)}" cy="${n(hy + hr * 0.32)}" rx="${n(hr * 0.15)}" ry="${n(hr * 0.09)}" fill="${BLUSH}" fill-opacity="0.5"/>`,
    ),
  );

  // Eyes: big and shiny. Dark fur gets a light rim so they still read.
  const rim =
    luminance(g.art.eyes === 'owl' ? p.light : p.main) < 0.35
      ? ` stroke="${lighten(p.main, 0.55)}" stroke-width="1.5"`
      : '';
  if (g.art.eyes === 'owl') {
    out.push(
      mirrored(
        `<circle cx="${n(ex)}" cy="${n(ey)}" r="${n(hr * 0.27)}" fill="#ffffff" ${stroke(p.outline, 2.5)}/>` +
          `<circle cx="${n(ex)}" cy="${n(ey)}" r="${n(hr * 0.19)}" fill="${p.accent}"/>` +
          `<circle cx="${n(ex)}" cy="${n(ey)}" r="${n(hr * 0.12)}" fill="${EYE}"/>` +
          `<circle cx="${n(ex + hr * 0.05)}" cy="${n(ey - hr * 0.06)}" r="${n(hr * 0.05)}" fill="#ffffff"/>`,
      ),
    );
  } else {
    const rx = hr * 0.15;
    const ry = hr * 0.19;
    out.push(
      mirrored(
        `<ellipse cx="${n(ex)}" cy="${n(ey)}" rx="${n(rx)}" ry="${n(ry)}" fill="${EYE}"${rim}/>` +
          `<circle cx="${n(ex + rx * 0.35)}" cy="${n(ey - ry * 0.38)}" r="${n(rx * 0.45)}" fill="#ffffff"/>` +
          `<circle cx="${n(ex - rx * 0.35)}" cy="${n(ey + ry * 0.42)}" r="${n(rx * 0.2)}" fill="#ffffff"/>`,
      ),
    );
  }

  const ny = hy + hr * 0.3;
  const mouth = (y: number) =>
    `<path d="M${n(-5 * k)} ${n(y)} Q${n(-2.5 * k)} ${n(y + 3.5 * k)} 0 ${n(y)} Q${n(2.5 * k)} ${n(y + 3.5 * k)} ${n(5 * k)} ${n(y)}" fill="none" ${stroke(p.outline, 2)}/>`;
  switch (g.art.nose) {
    case 'button':
      out.push(
        `<path d="M${n(-4 * k)} ${n(ny - 2 * k)} Q0 ${n(ny - 4 * k)} ${n(4 * k)} ${n(ny - 2 * k)} Q${n(2 * k)} ${n(ny + 2.5 * k)} 0 ${n(ny + 3 * k)} Q${n(-2 * k)} ${n(ny + 2.5 * k)} ${n(-4 * k)} ${n(ny - 2 * k)} Z" fill="${p.accent}" ${stroke(p.outline, 1.5)}/>`,
        mouth(ny + 5 * k),
      );
      break;
    case 'snout':
      out.push(
        `<ellipse cx="0" cy="${n(hy + hr * 0.42)}" rx="${n(hr * 0.38)}" ry="${n(hr * 0.26)}" fill="${p.light}"/>`,
        `<ellipse cx="0" cy="${n(hy + hr * 0.28)}" rx="${n(hr * 0.14)}" ry="${n(hr * 0.1)}" fill="${p.accent}"/>`,
        `<circle cx="${n(-hr * 0.04)}" cy="${n(hy + hr * 0.25)}" r="${n(hr * 0.04)}" fill="#ffffff" fill-opacity="0.7"/>`,
        mouth(hy + hr * 0.46),
      );
      break;
    case 'bigNose':
      out.push(
        `<ellipse cx="0" cy="${n(hy + hr * 0.24)}" rx="${n(hr * 0.2)}" ry="${n(hr * 0.27)}" fill="${p.accent}"/>`,
        `<ellipse cx="${n(-hr * 0.06)}" cy="${n(hy + hr * 0.12)}" rx="${n(hr * 0.05)}" ry="${n(hr * 0.08)}" fill="#ffffff" fill-opacity="0.5"/>`,
        mouth(hy + hr * 0.58),
      );
      break;
    case 'pig':
      out.push(
        `<ellipse cx="0" cy="${n(hy + hr * 0.36)}" rx="${n(hr * 0.3)}" ry="${n(hr * 0.2)}" fill="${p.accent}" ${stroke(p.outline, 2.5)}/>`,
        mirrored(
          `<ellipse cx="${n(hr * 0.11)}" cy="${n(hy + hr * 0.36)}" rx="${n(hr * 0.05)}" ry="${n(hr * 0.08)}" fill="${darken(p.accent, 0.45)}"/>`,
        ),
      );
      break;
    case 'beak':
      out.push(
        `<path d="M${n(-hr * 0.14)} ${n(hy + hr * 0.2)} L${n(hr * 0.14)} ${n(hy + hr * 0.2)} L0 ${n(hy + hr * 0.46)} Z" fill="${p.accent}" ${stroke(p.outline, 2.5)}/>`,
      );
      break;
    case 'bill':
      out.push(
        `<ellipse cx="0" cy="${n(hy + hr * 0.34)}" rx="${n(hr * 0.32)}" ry="${n(hr * 0.16)}" fill="${p.accent}" ${stroke(p.outline, 2.5)}/>`,
        `<path d="M${n(-hr * 0.22)} ${n(hy + hr * 0.34)} Q0 ${n(hy + hr * 0.4)} ${n(hr * 0.22)} ${n(hy + hr * 0.34)}" fill="none" ${stroke(p.outline, 1.5)}/>`,
      );
      break;
    case 'smile':
      out.push(
        mirrored(
          `<circle cx="${n(hr * 0.1)}" cy="${n(hy + hr * 0.24)}" r="${n(hr * 0.035)}" fill="${p.outline}"/>`,
        ),
        `<path d="M${n(-hr * 0.34)} ${n(hy + hr * 0.36)} Q0 ${n(hy + hr * 0.62)} ${n(hr * 0.34)} ${n(hy + hr * 0.36)}" fill="none" ${stroke(p.outline, 2.2)}/>`,
      );
      break;
  }

  if (g.has('whiskers')) {
    const x0 = hw * 0.42;
    const y0 = hy + hr * 0.38;
    out.push(
      mirrored(
        `<path d="M${n(x0)} ${n(y0)} L${n(hw * 1.08)} ${n(y0 - hr * 0.1)} M${n(x0)} ${n(y0 + hr * 0.08)} L${n(hw * 1.06)} ${n(y0 + hr * 0.16)}" stroke="${p.outline}" stroke-width="1.5" stroke-opacity="0.7" stroke-linecap="round"/>`,
      ),
    );
  }
  return out.join('');
}

function maneBack(g: Geo, p: Paint): string {
  const { hy, hr, hw } = g;
  const d =
    `M${n(-hw * 0.2)} ${n(hy - hr * 0.95)} C${n(hw * 0.7)} ${n(hy - hr * 1.3)} ${n(hw * 1.4)} ${n(hy - hr * 0.1)} ${n(hw * 1.05)} ${n(hy + hr * 1.1)} ` +
    `C${n(hw * 0.85)} ${n(hy + hr * 0.4)} ${n(hw * 0.5)} ${n(hy - hr * 0.2)} 0 ${n(hy - hr * 0.6)} Z`;
  const streak = p.details ? mix(p.accent, '#ffffff', 0.45) : p.accent;
  return (
    `<path d="${d}" fill="${p.accent}" ${stroke(p.outline, 3)}/>` +
    `<path d="M${n(hw * 0.35)} ${n(hy - hr * 0.95)} C${n(hw * 1.05)} ${n(hy - hr * 0.8)} ${n(hw * 1.1)} ${n(hy + hr * 0.2)} ${n(hw * 1.0)} ${n(hy + hr * 0.8)}" fill="none" stroke="${streak}" stroke-width="5" stroke-linecap="round"/>`
  );
}

function headExtras(g: Geo, p: Paint): string {
  const { hy, hr, hw } = g;
  const out: string[] = [];
  if (g.has('mane')) {
    out.push(
      `<path d="M${n(-hw * 0.4)} ${n(hy - hr * 0.8)} Q${n(-hw * 0.05)} ${n(hy - hr * 1.2)} ${n(hw * 0.4)} ${n(hy - hr * 0.88)} Q${n(hw * 0.1)} ${n(hy - hr * 0.5)} ${n(-hw * 0.4)} ${n(hy - hr * 0.8)} Z" fill="${p.accent}" ${stroke(p.outline, 3)}/>`,
    );
  }
  if (g.has('horn')) {
    const base = hy - hr * 0.86;
    const top = base - hr * 0.95;
    const w = hr * 0.2;
    const stripes = p.details
      ? [0.3, 0.55, 0.78]
          .map((t) => {
            const y = base + (top - base) * t;
            const half = w * (1 - t);
            return `<path d="M${n(-half)} ${n(y + 2)} L${n(half)} ${n(y - 2)}" stroke="${darken(p.dark, 0.2)}" stroke-width="1.5"/>`;
          })
          .join('')
      : '';
    out.push(
      `<path d="M${n(-w)} ${n(base)} L0 ${n(top)} L${n(w)} ${n(base)} Z" fill="${p.dark}" ${stroke(p.outline, 2.5)}/>${stripes}`,
    );
  }
  if (g.has('horns')) {
    out.push(
      mirrored(
        `<path d="M${n(hw * 0.3)} ${n(hy - hr * 0.84)} Q${n(hw * 0.44)} ${n(hy - hr * 1.3)} ${n(hw * 0.62)} ${n(hy - hr * 1.34)} Q${n(hw * 0.52)} ${n(hy - hr * 1.0)} ${n(hw * 0.58)} ${n(hy - hr * 0.72)} Z" fill="${p.accent}" ${stroke(p.outline, 2.5)}/>`,
      ),
    );
  }
  if (g.has('tuft')) {
    out.push(
      noodle(
        `M0 ${n(hy - hr * 0.9)} Q${n(-4)} ${n(hy - hr * 1.35)} ${n(6)} ${n(hy - hr * 1.42)}`,
        p.main,
        4,
        p.outline,
      ),
    );
  }
  if (g.has('moonMark') && p.details) {
    const x = 0;
    const y = hy - hr * 0.55;
    const r = hr * 0.26;
    out.push(
      `<path d="M${n(x + r * 0.3)} ${n(y - r)} A${n(r)} ${n(r)} 0 1 0 ${n(x + r * 0.3)} ${n(y + r)} A${n(r * 0.78)} ${n(r * 0.78)} 0 1 1 ${n(x + r * 0.3)} ${n(y - r)} Z" fill="${p.dark}" ${stroke(p.outline, 1.5)}/>`,
    );
  }
  return out.join('');
}

// --- Sparkle ----------------------------------------------------------------------------------

function shimmerOver(clip: string, top: number, height: number, width: number): string {
  return `<g clip-path="url(#${clip})"><rect x="${n(-width / 2)}" y="${n(top)}" width="${n(width)}" height="${n(height)}" fill="url(#shimmer)" fill-opacity="0.38"/></g>`;
}

function glitter(g: Geo): string {
  const spots: [number, number, number, string][] = [
    [-g.hw * 0.55, g.hy - g.hr * 0.5, 4, '#ffffff'],
    [g.hw * 0.2, g.hy + g.hr * 0.75, 3, '#fff6c2'],
    [-g.bw * 0.22, g.by + g.bh * 0.05, 4, '#ffffff'],
    [g.bw * 0.3, g.by - g.bh * 0.15, 3.5, '#fff6c2'],
    [g.bw * 0.05, g.by + g.bh * 0.3, 3, '#ffffff'],
  ];
  return spots.map(([x, y, r, c]) => twinkle(x, y, r, c)).join('');
}

/** The mystery visitor: a dark, generic, wobbly shape (nothing given away). */
export function mysterySvg(): string {
  const f = SILHOUETTE.fill;
  const s = stroke(SILHOUETTE.outline, 4);
  const body =
    `<circle cx="-17" cy="-54" r="11" fill="${f}" ${s}/><circle cx="17" cy="-54" r="11" fill="${f}" ${s}/>` +
    `<ellipse cx="0" cy="0" rx="36" ry="26" fill="${f}" ${s}/>` +
    `<circle cx="0" cy="-32" r="27" fill="${f}" ${s}/>` +
    `<ellipse cx="-18" cy="22" rx="9" ry="5" fill="${f}" ${s}/><ellipse cx="18" cy="22" rx="9" ry="5" fill="${f}" ${s}/>`;
  return svgDocument(ANIMAL_VIEW, body);
}
