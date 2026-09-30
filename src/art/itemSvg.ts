import { layerOf, type PlaceableItemDef } from '../config/items';
import { OUTLINE, darken, lighten, n, stroke, svgDocument, twinkle } from './svg';

/**
 * Yard lure and house furniture art (DESIGN 16.2), drawn to fit an item's footprint. Each item id
 * can have its own drawing in ITEM_ART; anything without one gets a tidy drawing for its category,
 * so a new item works with just a data entry. Colors come from the item's `color`.
 */

type Draw = (w: number, h: number, color: string) => string;

const s3 = stroke(OUTLINE, 3);
const s2 = stroke(OUTLINE, 2);

const shadow = (w: number, h: number, k = 0.86) =>
  `<ellipse cx="0" cy="${n(h / 2 - 5)}" rx="${n((w * k) / 2)}" ry="8" fill="#000000" fill-opacity="0.13"/>`;

function flower(x: number, y: number, r: number, petal: string, middle = '#ffd84d'): string {
  const petals = [0, 1, 2, 3, 4]
    .map((i) => {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      return `<circle cx="${n(x + Math.cos(a) * r)}" cy="${n(y + Math.sin(a) * r)}" r="${n(r * 0.75)}" fill="${petal}" ${stroke(OUTLINE, 1.5)}/>`;
    })
    .join('');
  return `${petals}<circle cx="${n(x)}" cy="${n(y)}" r="${n(r * 0.6)}" fill="${middle}" ${stroke(OUTLINE, 1.5)}/>`;
}

function leaf(x: number, y: number, len: number, angle: number, color: string): string {
  return `<ellipse cx="${n(x)}" cy="${n(y - len / 2)}" rx="${n(len * 0.28)}" ry="${n(len / 2)}" transform="rotate(${n(angle)} ${n(x)} ${n(y)})" fill="${color}" ${s2}/>`;
}

/** A 3/4-view box: a lighter top face and a front face. */
function box(x: number, y: number, w: number, h: number, top: number, color: string, r = 8) {
  return (
    `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${r}" fill="${darken(color, 0.08)}" ${s3}/>` +
    `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(top)}" rx="${r}" fill="${lighten(color, 0.18)}" ${s3}/>`
  );
}

const ITEM_ART: Record<string, Draw> = {
  // --- Yard lures ---------------------------------------------------------------------------
  carrot_patch: (w, h) => {
    const soil = `<ellipse cx="0" cy="${n(h * 0.18)}" rx="${n(w * 0.44)}" ry="${n(h * 0.26)}" fill="#9b6a45" ${s3}/>`;
    const carrots = [-0.22, 0, 0.22]
      .map((fx, i) => {
        const x = w * fx;
        const y = h * (0.1 + (i % 2) * 0.08);
        return (
          leaf(x - 3, y - 6, 16, -20, '#6cc05a') +
          leaf(x + 3, y - 6, 16, 20, '#7cc46a') +
          `<path d="M${n(x - 6)} ${n(y - 6)} L${n(x + 6)} ${n(y - 6)} L${n(x)} ${n(y + 8)} Z" fill="#f28c38" ${s2}/>`
        );
      })
      .join('');
    return shadow(w, h) + soil + carrots;
  },
  bird_bath: (w, h) =>
    shadow(w, h, 0.5) +
    `<rect x="-7" y="${n(-h * 0.05)}" width="14" height="${n(h * 0.45)}" rx="4" fill="#d9d4cc" ${s3}/>` +
    `<ellipse cx="0" cy="${n(h * 0.4)}" rx="${n(w * 0.2)}" ry="6" fill="#cfc9bf" ${s3}/>` +
    `<ellipse cx="0" cy="${n(-h * 0.1)}" rx="${n(w * 0.4)}" ry="${n(h * 0.17)}" fill="#e6e1d8" ${s3}/>` +
    `<ellipse cx="0" cy="${n(-h * 0.12)}" rx="${n(w * 0.32)}" ry="${n(h * 0.1)}" fill="#9fd3e8"/>` +
    `<path d="M${n(-w * 0.15)} ${n(-h * 0.13)} q6 -3 12 0" fill="none" stroke="#ffffff" stroke-width="2"/>`,
  toy_basket: (w, h) =>
    shadow(w, h) +
    `<circle cx="${n(-w * 0.14)}" cy="${n(-h * 0.14)}" r="${n(h * 0.16)}" fill="#ef6f6f" ${s2}/>` +
    `<path d="M${n(w * 0.05)} ${n(-h * 0.3)} l${n(w * 0.18)} ${n(h * 0.12)}" stroke="#fffaf0" stroke-width="7" stroke-linecap="round"/>` +
    `<path d="M${n(-w * 0.36)} ${n(-h * 0.06)} L${n(w * 0.36)} ${n(-h * 0.06)} L${n(w * 0.3)} ${n(h * 0.38)} L${n(-w * 0.3)} ${n(h * 0.38)} Z" fill="#d9a86a" ${s3}/>` +
    [0.06, 0.18, 0.3]
      .map(
        (fy) =>
          `<path d="M${n(-w * 0.33)} ${n(h * fy)} L${n(w * 0.33)} ${n(h * fy)}" stroke="#b5854a" stroke-width="2"/>`,
      )
      .join(''),
  flower_garden: (w, h) =>
    shadow(w, h) +
    `<ellipse cx="0" cy="${n(h * 0.14)}" rx="${n(w * 0.44)}" ry="${n(h * 0.28)}" fill="#7cc46a" ${s3}/>` +
    flower(-w * 0.2, h * 0.02, 5, '#ff9fc4') +
    flower(w * 0.18, -h * 0.02, 5, '#b69bff') +
    flower(0, h * 0.2, 5, '#fff6ec') +
    flower(-w * 0.26, h * 0.26, 4, '#ffd84d', '#f28c38') +
    flower(w * 0.28, h * 0.22, 4, '#8fd6ff'),
  little_pond: (w, h) =>
    `<ellipse cx="0" cy="${n(h * 0.06)}" rx="${n(w * 0.47)}" ry="${n(h * 0.38)}" fill="#b8a893" ${s3}/>` +
    `<ellipse cx="0" cy="${n(h * 0.04)}" rx="${n(w * 0.41)}" ry="${n(h * 0.3)}" fill="#6fc3e8"/>` +
    `<path d="M${n(-w * 0.2)} ${n(-h * 0.02)} q10 -4 20 0 M${n(w * 0.06)} ${n(h * 0.14)} q10 -4 20 0" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round"/>` +
    `<path d="M${n(w * 0.22)} ${n(-h * 0.06)} a9 6 0 1 1 1 0 Z" fill="#7cc46a" ${s2}/>` +
    flower(w * 0.24, -h * 0.1, 2.5, '#ff9fc4'),
  bamboo_grove: (w, h) =>
    shadow(w, h, 0.7) +
    [-0.22, 0.02, 0.24]
      .map((fx, i) => {
        const x = w * fx;
        const top = -h * (0.42 - (i % 2) * 0.1);
        const bottom = h * 0.36;
        const joints = [0.3, 0.6]
          .map(
            (t) =>
              `<path d="M${n(x - 5)} ${n(top + (bottom - top) * t)} L${n(x + 5)} ${n(top + (bottom - top) * t)}" stroke="${OUTLINE}" stroke-width="2"/>`,
          )
          .join('');
        return (
          `<rect x="${n(x - 5)}" y="${n(top)}" width="10" height="${n(bottom - top)}" rx="4" fill="${i === 1 ? '#8fd07a' : '#7cc46a'}" ${s3}/>` +
          joints +
          leaf(x + 5, top + 12, 14, 60, '#6cc05a')
        );
      })
      .join(''),
  eucalyptus_tree: (w, h) =>
    shadow(w, h, 0.6) +
    `<path d="M-6 ${n(h * 0.4)} L-4 ${n(-h * 0.05)} L4 ${n(-h * 0.05)} L6 ${n(h * 0.4)} Z" fill="#d6c4b0" ${s3}/>` +
    `<circle cx="${n(-w * 0.16)}" cy="${n(-h * 0.14)}" r="${n(h * 0.22)}" fill="#8fbf9f" ${s3}/>` +
    `<circle cx="${n(w * 0.16)}" cy="${n(-h * 0.16)}" r="${n(h * 0.22)}" fill="#8fbf9f" ${s3}/>` +
    `<circle cx="0" cy="${n(-h * 0.3)}" r="${n(h * 0.24)}" fill="#a3cdb1" ${s3}/>`,
  warm_rock: (w, h) =>
    shadow(w, h) +
    `<path d="M${n(-w * 0.4)} ${n(h * 0.34)} Q${n(-w * 0.44)} ${n(-h * 0.14)} ${n(-w * 0.1)} ${n(-h * 0.2)} Q${n(w * 0.3)} ${n(-h * 0.26)} ${n(w * 0.4)} ${n(h * 0.1)} Q${n(w * 0.44)} ${n(h * 0.34)} ${n(w * 0.3)} ${n(h * 0.36)} Z" fill="#c9a27a" ${s3}/>` +
    `<ellipse cx="${n(-w * 0.08)}" cy="${n(-h * 0.08)}" rx="${n(w * 0.16)}" ry="${n(h * 0.06)}" fill="#ffd08a" fill-opacity="0.8"/>` +
    [-0.14, 0, 0.14]
      .map(
        (fx) =>
          `<path d="M${n(w * fx)} ${n(-h * 0.28)} q-4 -6 0 -12 q4 -6 0 -12" fill="none" stroke="#ff9f5a" stroke-width="2.5" stroke-linecap="round"/>`,
      )
      .join(''),
  rainbow_fountain: (w, h) => {
    const bands = ['#ff6f6f', '#ffb34d', '#ffe066', '#7cc46a', '#6fa8ef', '#b69bff'];
    const arcs = bands
      .map(
        (c, i) =>
          `<path d="M${n(-w * 0.36 + i * 4)} ${n(-h * 0.06)} A${n(w * 0.36 - i * 4)} ${n(h * 0.42 - i * 4)} 0 0 1 ${n(w * 0.36 - i * 4)} ${n(-h * 0.06)}" fill="none" stroke="${c}" stroke-width="4"/>`,
      )
      .join('');
    return (
      shadow(w, h) +
      arcs +
      `<ellipse cx="0" cy="${n(h * 0.18)}" rx="${n(w * 0.44)}" ry="${n(h * 0.22)}" fill="#e6e1f2" ${s3}/>` +
      `<ellipse cx="0" cy="${n(h * 0.15)}" rx="${n(w * 0.37)}" ry="${n(h * 0.14)}" fill="#9fd3f0"/>` +
      `<rect x="-6" y="${n(-h * 0.2)}" width="12" height="${n(h * 0.35)}" rx="4" fill="#e6e1f2" ${s3}/>` +
      twinkle(-w * 0.2, h * 0.12, 5, '#ffffff') +
      twinkle(w * 0.22, h * 0.16, 4, '#ffffff')
    );
  },
  moon_lantern: (w, h) =>
    shadow(w, h, 0.4) +
    `<rect x="-4" y="${n(-h * 0.1)}" width="8" height="${n(h * 0.5)}" rx="3" fill="#6b5a73" ${s3}/>` +
    `<circle cx="0" cy="${n(-h * 0.22)}" r="${n(h * 0.24)}" fill="#ffe38a" fill-opacity="0.35"/>` +
    `<rect x="${n(-w * 0.18)}" y="${n(-h * 0.38)}" width="${n(w * 0.36)}" height="${n(h * 0.3)}" rx="10" fill="#ffe38a" ${s3}/>` +
    `<path d="M4 ${n(-h * 0.31)} A8 8 0 1 0 4 ${n(-h * 0.15)} A6 6 0 1 1 4 ${n(-h * 0.31)} Z" fill="#fff8d6" ${s2}/>`,

  // --- Furniture ----------------------------------------------------------------------------
  armchair: (w, h, c) =>
    shadow(w, h) +
    `<rect x="${n(-w * 0.34)}" y="${n(-h * 0.38)}" width="${n(w * 0.68)}" height="${n(h * 0.5)}" rx="12" fill="${darken(c, 0.06)}" ${s3}/>` +
    `<rect x="${n(-w * 0.3)}" y="${n(-h * 0.02)}" width="${n(w * 0.6)}" height="${n(h * 0.3)}" rx="8" fill="${lighten(c, 0.15)}" ${s3}/>` +
    [-1, 1]
      .map(
        (sx) =>
          `<rect x="${n(sx > 0 ? w * 0.26 : -w * 0.42)}" y="${n(-h * 0.12)}" width="${n(w * 0.16)}" height="${n(h * 0.46)}" rx="7" fill="${c}" ${s3}/>`,
      )
      .join(''),
  sofa: (w, h, c) =>
    shadow(w, h) +
    `<rect x="${n(-w * 0.44)}" y="${n(-h * 0.38)}" width="${n(w * 0.88)}" height="${n(h * 0.5)}" rx="14" fill="${darken(c, 0.06)}" ${s3}/>` +
    [-1, 1]
      .map(
        (sx) =>
          `<rect x="${n(sx < 0 ? -w * 0.36 : 0)}" y="${n(-h * 0.02)}" width="${n(w * 0.36)}" height="${n(h * 0.3)}" rx="8" fill="${lighten(c, 0.15)}" ${s3}/>`,
      )
      .join('') +
    [-1, 1]
      .map(
        (sx) =>
          `<rect x="${n(sx > 0 ? w * 0.36 : -w * 0.46)}" y="${n(-h * 0.14)}" width="${n(w * 0.1)}" height="${n(h * 0.48)}" rx="7" fill="${c}" ${s3}/>`,
      )
      .join(''),
  side_table: (w, h, c) =>
    shadow(w, h, 0.6) +
    `<rect x="${n(-w * 0.26)}" y="${n(-h * 0.08)}" width="8" height="${n(h * 0.44)}" rx="3" fill="${darken(c, 0.15)}" ${s2}/>` +
    `<rect x="${n(w * 0.26 - 8)}" y="${n(-h * 0.08)}" width="8" height="${n(h * 0.44)}" rx="3" fill="${darken(c, 0.15)}" ${s2}/>` +
    `<ellipse cx="0" cy="${n(-h * 0.1)}" rx="${n(w * 0.38)}" ry="${n(h * 0.18)}" fill="${c}" ${s3}/>` +
    flower(0, -h * 0.16, 3.5, '#ff9fc4'),
  dining_table: (w, h, c) =>
    shadow(w, h) +
    `<rect x="${n(-w * 0.42)}" y="${n(h * 0.14)}" width="${n(w * 0.84)}" height="${n(h * 0.14)}" rx="5" fill="${darken(c, 0.1)}" ${s3}/>` +
    `<rect x="${n(-w * 0.4)}" y="${n(-h * 0.3)}" width="${n(w * 0.8)}" height="${n(h * 0.38)}" rx="6" fill="${c}" ${s3}/>` +
    [-0.15, 0.15]
      .map(
        (fx) =>
          `<path d="M${n(w * fx)} ${n(-h * 0.3)} L${n(w * fx)} ${n(h * 0.08)}" stroke="${darken(c, 0.2)}" stroke-width="2"/>`,
      )
      .join('') +
    `<rect x="${n(-w * 0.28)}" y="${n(-h * 0.2)}" width="${n(w * 0.56)}" height="${n(h * 0.18)}" fill="#ef6f6f" fill-opacity="0.5"/>`,
  tv: (w, h, c) =>
    shadow(w, h, 0.6) +
    `<rect x="-5" y="${n(h * 0.1)}" width="10" height="${n(h * 0.24)}" fill="${darken(c, 0.2)}" ${s2}/>` +
    `<rect x="${n(-w * 0.4)}" y="${n(-h * 0.4)}" width="${n(w * 0.8)}" height="${n(h * 0.54)}" rx="8" fill="${c}" ${s3}/>` +
    `<rect x="${n(-w * 0.32)}" y="${n(-h * 0.33)}" width="${n(w * 0.64)}" height="${n(h * 0.4)}" rx="5" fill="#9fd3f0"/>` +
    `<circle cx="${n(w * 0.12)}" cy="${n(-h * 0.2)}" r="6" fill="#ffd84d"/>` +
    `<path d="M${n(-w * 0.32)} ${n(h * 0.02)} Q${n(-w * 0.1)} ${n(-h * 0.14)} ${n(w * 0.1)} ${n(h * 0.02)} Z" fill="#7cc46a"/>`,
  sun_picture: (w, h, c) =>
    `<rect x="${n(-w * 0.42)}" y="${n(-h * 0.34)}" width="${n(w * 0.84)}" height="${n(h * 0.68)}" rx="6" fill="#a57a5a" ${s3}/>` +
    `<rect x="${n(-w * 0.34)}" y="${n(-h * 0.26)}" width="${n(w * 0.68)}" height="${n(h * 0.52)}" rx="3" fill="#cfe6fb"/>` +
    `<circle cx="0" cy="0" r="${n(Math.min(w, h) * 0.13)}" fill="${c}" ${s2}/>` +
    [0, 1, 2, 3, 4, 5, 6, 7]
      .map((i) => {
        const a = (i / 8) * Math.PI * 2;
        const r1 = Math.min(w, h) * 0.17;
        const r2 = Math.min(w, h) * 0.23;
        return `<path d="M${n(Math.cos(a) * r1)} ${n(Math.sin(a) * r1)} L${n(Math.cos(a) * r2)} ${n(Math.sin(a) * r2)}" stroke="${c}" stroke-width="3" stroke-linecap="round"/>`;
      })
      .join(''),
  paw_poster: (w, h, c) =>
    `<rect x="${n(-w * 0.44)}" y="${n(-h * 0.34)}" width="${n(w * 0.88)}" height="${n(h * 0.68)}" rx="6" fill="#fffaf0" ${s3}/>` +
    [-0.25, 0, 0.25]
      .map((fx, i) => {
        const x = w * fx;
        const y = (i % 2 ? -1 : 1) * h * 0.06;
        return (
          `<ellipse cx="${n(x)}" cy="${n(y + 5)}" rx="7" ry="6" fill="${c}"/>` +
          [-6, -2, 2, 6]
            .map(
              (dx, j) =>
                `<circle cx="${n(x + dx)}" cy="${n(y - 4 - (j === 1 || j === 2 ? 3 : 0))}" r="2.6" fill="${c}"/>`,
            )
            .join('')
        );
      })
      .join(''),
  round_rug: (w, h, c) =>
    `<ellipse cx="0" cy="0" rx="${n(w * 0.46)}" ry="${n(h * 0.4)}" fill="${c}" fill-opacity="0.95"/>` +
    `<ellipse cx="0" cy="0" rx="${n(w * 0.34)}" ry="${n(h * 0.28)}" fill="none" stroke="#ffffff" stroke-width="5" stroke-opacity="0.7"/>` +
    `<ellipse cx="0" cy="0" rx="${n(w * 0.18)}" ry="${n(h * 0.14)}" fill="${lighten(c, 0.35)}"/>`,
  rainbow_rug: (w, h) =>
    ['#ff9fa8', '#ffc98a', '#fff09a', '#aee6a0', '#9fcbf5', '#cdb8ff']
      .map(
        (c, i) =>
          `<ellipse cx="0" cy="0" rx="${n(w * (0.47 - i * 0.06))}" ry="${n(h * (0.42 - i * 0.055))}" fill="${c}"/>`,
      )
      .join(''),
  floor_lamp: (w, h, c) =>
    shadow(w, h, 0.4) +
    `<circle cx="0" cy="${n(-h * 0.26)}" r="${n(Math.min(w, h) * 0.42)}" fill="${c}" fill-opacity="0.25"/>` +
    `<rect x="-3" y="${n(-h * 0.2)}" width="6" height="${n(h * 0.58)}" fill="#8b7a6a" ${s2}/>` +
    `<ellipse cx="0" cy="${n(h * 0.38)}" rx="12" ry="5" fill="#8b7a6a" ${s2}/>` +
    `<path d="M${n(-w * 0.2)} ${n(-h * 0.14)} L${n(w * 0.2)} ${n(-h * 0.14)} L${n(w * 0.12)} ${n(-h * 0.42)} L${n(-w * 0.12)} ${n(-h * 0.42)} Z" fill="${c}" ${s3}/>`,
  fairy_lights: (w, h) => {
    const colors = ['#ff8fc4', '#ffd84d', '#8fd6ff', '#9ff0c8', '#b69bff'];
    const count = 7;
    const bulbs: string[] = [];
    for (let i = 0; i < count; i++) {
      const x = -w * 0.42 + (i / (count - 1)) * w * 0.84;
      const y = -h * 0.1 + Math.sin((i / (count - 1)) * Math.PI) * h * 0.24;
      bulbs.push(
        `<circle cx="${n(x)}" cy="${n(y + 6)}" r="9" fill="${colors[i % colors.length]}" fill-opacity="0.3"/>` +
          `<ellipse cx="${n(x)}" cy="${n(y + 6)}" rx="4" ry="5.5" fill="${colors[i % colors.length]}" ${s2}/>`,
      );
    }
    return (
      `<path d="M${n(-w * 0.44)} ${n(-h * 0.1)} Q0 ${n(h * 0.38)} ${n(w * 0.44)} ${n(-h * 0.1)}" fill="none" stroke="#4a6b4a" stroke-width="2.5"/>` +
      bulbs.join('')
    );
  },
  potted_plant: (w, h) =>
    shadow(w, h, 0.5) +
    leaf(-4, -h * 0.02, h * 0.42, -35, '#6cc05a') +
    leaf(4, -h * 0.02, h * 0.42, 35, '#7cc46a') +
    leaf(0, -h * 0.02, h * 0.5, 0, '#8fd07a') +
    `<path d="M${n(-w * 0.22)} ${n(-h * 0.04)} L${n(w * 0.22)} ${n(-h * 0.04)} L${n(w * 0.16)} ${n(h * 0.38)} L${n(-w * 0.16)} ${n(h * 0.38)} Z" fill="#e0876a" ${s3}/>` +
    `<rect x="${n(-w * 0.25)}" y="${n(-h * 0.08)}" width="${n(w * 0.5)}" height="9" rx="4" fill="#ec9c80" ${s2}/>`,
  flower_pot: (w, h, c) =>
    shadow(w, h, 0.5) +
    `<path d="M0 ${n(h * 0.02)} L0 ${n(-h * 0.2)}" stroke="#5aa04a" stroke-width="4"/>` +
    leaf(0, -h * 0.06, 14, 50, '#7cc46a') +
    flower(0, -h * 0.28, 7, c, '#8b5e3c') +
    `<path d="M${n(-w * 0.2)} ${n(h * 0.02)} L${n(w * 0.2)} ${n(h * 0.02)} L${n(w * 0.15)} ${n(h * 0.38)} L${n(-w * 0.15)} ${n(h * 0.38)} Z" fill="#8fb8e8" ${s3}/>`,
  bookshelf: (w, h, c) => {
    const books = ['#ef6f6f', '#6fa8ef', '#ffd84d', '#7cc46a', '#b69bff', '#ff9fc4', '#f28c38'];
    const row = (y: number, offset: number) =>
      books
        .slice(0, Math.max(3, Math.floor(w / 18)))
        .map((_, i) => {
          const bw = 9;
          const x = -w * 0.36 + i * (bw + 3);
          const bh = h * 0.2 - ((i + offset) % 3) * 3;
          return `<rect x="${n(x)}" y="${n(y - bh)}" width="${bw}" height="${n(bh)}" rx="2" fill="${books[(i + offset) % books.length]}" ${s2}/>`;
        })
        .join('');
    return (
      shadow(w, h) +
      `<rect x="${n(-w * 0.42)}" y="${n(-h * 0.44)}" width="${n(w * 0.84)}" height="${n(h * 0.82)}" rx="6" fill="${c}" ${s3}/>` +
      `<rect x="${n(-w * 0.37)}" y="${n(-h * 0.38)}" width="${n(w * 0.74)}" height="${n(h * 0.7)}" rx="3" fill="${darken(c, 0.25)}"/>` +
      `<path d="M${n(-w * 0.37)} ${n(-h * 0.03)} L${n(w * 0.37)} ${n(-h * 0.03)}" stroke="${c}" stroke-width="5"/>` +
      row(-h * 0.05, 0) +
      row(h * 0.3, 2)
    );
  },
  toy_shelf: (w, h, c) =>
    shadow(w, h) +
    box(-w * 0.4, -h * 0.1, w * 0.8, h * 0.46, h * 0.1, c, 6) +
    `<circle cx="${n(-w * 0.18)}" cy="${n(-h * 0.2)}" r="${n(h * 0.1)}" fill="#ef6f6f" ${s2}/>` +
    `<circle cx="${n(w * 0.12)}" cy="${n(-h * 0.3)}" r="${n(h * 0.08)}" fill="#c9955e" ${s2}/>` +
    `<circle cx="${n(w * 0.05)}" cy="${n(-h * 0.36)}" r="${n(h * 0.04)}" fill="#c9955e" ${s2}/>` +
    `<circle cx="${n(w * 0.19)}" cy="${n(-h * 0.36)}" r="${n(h * 0.04)}" fill="#c9955e" ${s2}/>` +
    `<ellipse cx="${n(w * 0.12)}" cy="${n(-h * 0.14)}" rx="${n(h * 0.1)}" ry="${n(h * 0.08)}" fill="#c9955e" ${s2}/>` +
    `<rect x="${n(-w * 0.1)}" y="${n(h * 0.06)}" width="${n(h * 0.14)}" height="${n(h * 0.14)}" rx="2" fill="#6fa8ef" ${s2}/>`,

  // --- Pet beds -----------------------------------------------------------------------------
  bed_basic: (w, h, c) => bed(w, h, c, false, false),
  bed_fluffy: (w, h, c) => bed(w, h, c, true, false),
  bed_royal: (w, h, c) => bed(w, h, c, true, true),
};

function bed(w: number, h: number, c: string, fluffy: boolean, royal: boolean): string {
  const rx = w * 0.44;
  const ry = h * 0.32;
  let rim = `<ellipse cx="0" cy="${n(h * 0.06)}" rx="${n(rx)}" ry="${n(ry)}" fill="${c}" ${s3}/>`;
  if (fluffy) {
    const puffs: string[] = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      puffs.push(
        `<circle cx="${n(Math.cos(a) * rx * 0.92)}" cy="${n(h * 0.06 + Math.sin(a) * ry * 0.9)}" r="${n(ry * 0.34)}" fill="${c}" ${s2}/>`,
      );
    }
    rim =
      puffs.join('') +
      `<ellipse cx="0" cy="${n(h * 0.06)}" rx="${n(rx * 0.9)}" ry="${n(ry * 0.85)}" fill="${c}"/>`;
  }
  const cushion = `<ellipse cx="0" cy="${n(h * 0.08)}" rx="${n(rx * 0.62)}" ry="${n(ry * 0.52)}" fill="${lighten(c, 0.55)}" ${s2}/>`;
  const trim = royal
    ? `<ellipse cx="0" cy="${n(h * 0.06)}" rx="${n(rx * 0.8)}" ry="${n(ry * 0.72)}" fill="none" stroke="#ffd84d" stroke-width="3"/>` +
      `<path d="M-9 ${n(-h * 0.24)} L-9 ${n(-h * 0.34)} L-4 ${n(-h * 0.28)} L0 ${n(-h * 0.38)} L4 ${n(-h * 0.28)} L9 ${n(-h * 0.34)} L9 ${n(-h * 0.24)} Z" fill="#ffd84d" ${s2}/>`
    : '';
  return shadow(w, h) + rim + cushion + trim;
}

/** Fallback drawing by category, for items that don't have their own art yet. */
function genericArt(def: PlaceableItemDef): Draw {
  const layer = layerOf(def);
  if (layer === 'rug') return ITEM_ART.round_rug!;
  if (layer === 'wall')
    return (w, h, c) =>
      `<rect x="${n(-w * 0.42)}" y="${n(-h * 0.34)}" width="${n(w * 0.84)}" height="${n(h * 0.68)}" rx="6" fill="#a57a5a" ${s3}/>` +
      `<rect x="${n(-w * 0.34)}" y="${n(-h * 0.26)}" width="${n(w * 0.68)}" height="${n(h * 0.52)}" rx="3" fill="${c}"/>`;
  if (def.category === 'bed') return (w, h, c) => bed(w, h, c, false, false);
  return (w, h, c) => shadow(w, h) + box(-w * 0.38, -h * 0.34, w * 0.76, h * 0.68, h * 0.22, c, 12);
}

/** True when the item has its own drawing (tests use this to spot missing art). */
export function hasItemArt(itemId: string): boolean {
  return itemId in ITEM_ART;
}

/**
 * The item drawn into a `w` x `h` footprint (world px) at `rotation`. Rotated items draw their
 * rotation-0 picture and turn it, so the "front" always faces the way the player turned it.
 */
export function itemSvg(def: PlaceableItemDef, w: number, h: number, rotation = 0): string {
  const turned = rotation === 90 || rotation === 270;
  const bw = turned ? h : w;
  const bh = turned ? w : h;
  const draw = ITEM_ART[def.id] ?? genericArt(def);
  const body = draw(bw, bh, def.color);
  const content = rotation ? `<g transform="rotate(${rotation})">${body}</g>` : body;
  return svgDocument({ x: -w / 2, y: -h / 2, w, h }, content);
}

export function itemKey(def: PlaceableItemDef, w: number, h: number, rotation: number): string {
  return `${def.assetKey}.${Math.round(w)}x${Math.round(h)}.r${rotation}`;
}
