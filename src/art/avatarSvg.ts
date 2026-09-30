import { getAvatarItem, type AvatarItemDef } from '../config/avatarItems';
import type { AvatarLoadout } from '../profile/avatar';
import { wornIn } from '../profile/avatar';

/**
 * Layered avatar (DESIGN 16.2: parametric SVG parts with color slots). Pure: turns
 * a loadout into an SVG string (viewBox 120 x 200, feet at the bottom). React shows it as an
 * <img>, Phaser loads it as a texture.
 */

const OUTLINE = '#4a3b33';
const W = 120;

function item(
  loadout: AvatarLoadout,
  slot: Parameters<typeof wornIn>[1],
): AvatarItemDef | undefined {
  const id = wornIn(loadout, slot);
  return id ? getAvatarItem(id) : undefined;
}

const stroke = `stroke="${OUTLINE}" stroke-width="3" stroke-linejoin="round"`;

export function avatarSvg(loadout: AvatarLoadout): string {
  const skin = item(loadout, 'skinTone')?.color ?? '#e8b48a';
  const body = item(loadout, 'bodyShape')?.kind ?? 'regular';
  const hairColor = item(loadout, 'hairColor')?.color ?? '#6b4226';
  const hair = item(loadout, 'hairStyle')?.kind ?? 'short';
  const top = item(loadout, 'top');
  const bottom = item(loadout, 'bottom');
  const onePiece = item(loadout, 'onePiece');
  const shoes = item(loadout, 'shoes');
  const hat = item(loadout, 'hat');
  const glasses = item(loadout, 'glasses');
  const bag = item(loadout, 'bag');
  const earrings = item(loadout, 'earrings');

  // Body proportions.
  const torsoW = body === 'slim' ? 34 : body === 'round' ? 52 : 42;
  const cx = W / 2;
  const tx = cx - torsoW / 2;
  const legW = body === 'round' ? 14 : 12;
  const parts: string[] = [];

  // --- Behind the body: long hair, ponytail, buns, backpack.
  if (hair === 'long') {
    parts.push(
      `<path d="M28 44 Q24 110 36 118 L84 118 Q96 110 92 44 Z" fill="${hairColor}" ${stroke}/>`,
    );
  } else if (hair === 'ponytail') {
    parts.push(`<path d="M86 34 Q108 44 100 86 Q94 70 84 56 Z" fill="${hairColor}" ${stroke}/>`);
  } else if (hair === 'curly') {
    for (const [x, y] of [
      [30, 52],
      [90, 52],
      [28, 70],
      [92, 70],
    ] as const) {
      parts.push(`<circle cx="${x}" cy="${y}" r="10" fill="${hairColor}" ${stroke}/>`);
    }
  } else if (hair === 'buns') {
    parts.push(`<circle cx="36" cy="14" r="13" fill="${hairColor}" ${stroke}/>`);
    parts.push(`<circle cx="84" cy="14" r="13" fill="${hairColor}" ${stroke}/>`);
  }
  if (bag?.kind === 'backpack') {
    parts.push(
      `<rect x="${tx - 10}" y="92" width="${torsoW + 20}" height="44" rx="10" fill="${bag.color}" ${stroke}/>`,
    );
  }

  // --- Legs and bottoms.
  const legTop = 138;
  const legBottom = 184;
  for (const lx of [cx - legW - 3, cx + 3]) {
    parts.push(
      `<rect x="${lx}" y="${legTop}" width="${legW}" height="${legBottom - legTop}" rx="5" fill="${skin}" ${stroke}/>`,
    );
  }
  if (!onePiece && bottom) {
    const c = bottom.color;
    if (bottom.kind === 'pants') {
      for (const lx of [cx - legW - 4, cx + 2]) {
        parts.push(
          `<rect x="${lx}" y="${legTop - 4}" width="${legW + 2}" height="${legBottom - legTop}" rx="5" fill="${c}" ${stroke}/>`,
        );
      }
    } else if (bottom.kind === 'shorts') {
      parts.push(
        `<rect x="${tx + 2}" y="${legTop - 6}" width="${torsoW - 4}" height="22" rx="6" fill="${c}" ${stroke}/>`,
      );
    } else if (bottom.kind === 'tutu') {
      parts.push(
        `<path d="M${tx - 12} ${legTop + 14} L${tx + torsoW + 12} ${legTop + 14} L${tx + torsoW} ${legTop - 6} L${tx} ${legTop - 6} Z" fill="${c}" ${stroke}/>`,
      );
    } else {
      const pattern = bottom.color2
        ? `<line x1="${tx}" y1="${legTop + 4}" x2="${tx + torsoW}" y2="${legTop + 4}" stroke="${bottom.color2}" stroke-width="4"/>`
        : '';
      parts.push(
        `<path d="M${tx - 4} ${legTop + 18} L${tx + torsoW + 4} ${legTop + 18} L${tx + torsoW - 2} ${legTop - 6} L${tx + 2} ${legTop - 6} Z" fill="${c}" ${stroke}/>${pattern}`,
      );
    }
  }

  // --- Shoes.
  if (shoes) {
    for (const lx of [cx - legW - 7, cx + 1]) {
      const h = shoes.kind === 'boots' ? 18 : shoes.kind === 'sandals' ? 7 : 11;
      parts.push(
        `<rect x="${lx}" y="${legBottom - h + 4}" width="${legW + 8}" height="${h}" rx="5" fill="${shoes.color}" ${stroke}/>`,
      );
      if (shoes.color2) {
        parts.push(
          `<rect x="${lx + 3}" y="${legBottom + 1}" width="${legW + 2}" height="3" fill="${shoes.color2}"/>`,
        );
      }
      if (shoes.kind === 'slippers') {
        parts.push(
          `<circle cx="${lx + 5}" cy="${legBottom - 6}" r="4" fill="${shoes.color2 ?? '#ff9fc4'}"/>`,
        );
      }
    }
  } else {
    for (const lx of [cx - legW - 5, cx + 1]) {
      parts.push(
        `<ellipse cx="${lx + legW / 2 + 2}" cy="${legBottom + 1}" rx="${legW / 2 + 3}" ry="5" fill="${skin}" ${stroke}/>`,
      );
    }
  }

  // --- Arms, torso, and clothes.
  const shirt = onePiece?.color ?? top?.color ?? skin;
  for (const ax of [tx - 12, tx + torsoW + 2]) {
    parts.push(`<rect x="${ax}" y="88" width="10" height="42" rx="5" fill="${skin}" ${stroke}/>`);
    if (onePiece || top) {
      parts.push(
        `<rect x="${ax - 1}" y="86" width="12" height="18" rx="5" fill="${shirt}" ${stroke}/>`,
      );
    }
  }
  if (onePiece && (onePiece.kind === 'dress' || onePiece.kind === 'gown')) {
    const flare = onePiece.kind === 'gown' ? 26 : 16;
    const hem = onePiece.kind === 'gown' ? legBottom - 6 : legTop + 16;
    parts.push(
      `<path d="M${tx + 2} 84 L${tx + torsoW - 2} 84 L${tx + torsoW + flare} ${hem} L${tx - flare} ${hem} Z" fill="${onePiece.color}" ${stroke}/>`,
    );
    if (onePiece.color2) {
      parts.push(
        `<circle cx="${cx}" cy="104" r="4" fill="${onePiece.color2}"/><circle cx="${cx - 10}" cy="${hem - 12}" r="3" fill="${onePiece.color2}"/><circle cx="${cx + 12}" cy="${hem - 20}" r="3" fill="${onePiece.color2}"/>`,
      );
    }
  } else {
    parts.push(
      `<rect x="${tx}" y="84" width="${torsoW}" height="58" rx="14" fill="${shirt}" ${stroke}/>`,
    );
    if (onePiece?.kind === 'overalls') {
      parts.push(
        `<rect x="${tx + 6}" y="104" width="${torsoW - 12}" height="38" rx="6" fill="${onePiece.color}" ${stroke}/>`,
      );
      parts.push(
        `<rect x="${tx}" y="84" width="${torsoW}" height="22" rx="8" fill="${onePiece.color2 ?? '#fff'}" ${stroke}/>`,
      );
    }
    if (top?.kind === 'stripes' && top.color2) {
      for (const y of [98, 110, 122]) {
        parts.push(
          `<rect x="${tx + 2}" y="${y}" width="${torsoW - 4}" height="5" fill="${top.color2}"/>`,
        );
      }
    } else if (top?.kind === 'hoodie') {
      parts.push(
        `<path d="M${cx - 10} 86 Q${cx} 100 ${cx + 10} 86" fill="none" ${stroke}/><rect x="${cx - 12}" y="116" width="24" height="12" rx="4" fill="none" ${stroke}/>`,
      );
    } else if (top?.kind === 'heart') {
      parts.push(
        `<path d="M${cx} 122 L${cx - 9} 111 A5 5 0 0 1 ${cx} 105 A5 5 0 0 1 ${cx + 9} 111 Z" fill="${top.color2 ?? '#fff'}"/>`,
      );
    } else if (top?.kind === 'star') {
      parts.push(
        `<text x="${cx}" y="122" font-size="18" text-anchor="middle" fill="${top.color2 ?? '#ffd84d'}">★</text>`,
      );
    } else if (top?.kind === 'rainbow') {
      ['#ff9f9f', '#ffd27f', '#fff27f', '#9fe7a8', '#9fd0f5', '#c7a6f0'].forEach((c, i) =>
        parts.push(
          `<rect x="${tx + 2}" y="${90 + i * 8}" width="${torsoW - 4}" height="8" fill="${c}"/>`,
        ),
      );
    }
  }
  if (bag?.kind === 'purse') {
    parts.push(
      `<line x1="${tx + 2}" y1="88" x2="${tx + torsoW + 6}" y2="124" stroke="${OUTLINE}" stroke-width="2"/><rect x="${tx + torsoW - 2}" y="120" width="18" height="14" rx="4" fill="${bag.color}" ${stroke}/>`,
    );
  }

  // --- Head, ears, earrings.
  const headY = 50;
  parts.push(`<rect x="${cx - 7}" y="72" width="14" height="16" fill="${skin}" ${stroke}/>`);
  for (const ex of [cx - 33, cx + 33]) {
    parts.push(`<circle cx="${ex}" cy="${headY + 4}" r="7" fill="${skin}" ${stroke}/>`);
    if (earrings) {
      if (earrings.kind === 'hoops')
        parts.push(
          `<circle cx="${ex}" cy="${headY + 16}" r="5" fill="none" stroke="${earrings.color}" stroke-width="3"/>`,
        );
      else if (earrings.kind === 'hearts')
        parts.push(
          `<text x="${ex}" y="${headY + 22}" font-size="10" text-anchor="middle" fill="${earrings.color}">♥</text>`,
        );
      else parts.push(`<circle cx="${ex}" cy="${headY + 11}" r="3" fill="${earrings.color}"/>`);
    }
  }
  parts.push(`<circle cx="${cx}" cy="${headY}" r="30" fill="${skin}" ${stroke}/>`);

  // --- Face: eyeshadow, eyes, brows, blush, mouth, face paint.
  const eyeY = headY + 2;
  const eyeX = [cx - 11, cx + 11];
  const shadow = item(loadout, 'eyeshadow');
  if (shadow)
    for (const x of eyeX)
      parts.push(
        `<ellipse cx="${x}" cy="${eyeY - 4}" rx="7" ry="4" fill="${shadow.color}" opacity="0.8"/>`,
      );
  const eyes = item(loadout, 'eyes')?.kind ?? 'round';
  eyeX.forEach((x, i) => {
    if (eyes === 'happy' || (eyes === 'wink' && i === 1)) {
      parts.push(
        `<path d="M${x - 5} ${eyeY + 1} Q${x} ${eyeY - 5} ${x + 5} ${eyeY + 1}" fill="none" stroke="${OUTLINE}" stroke-width="3" stroke-linecap="round"/>`,
      );
    } else {
      const r = eyes === 'wide' ? 5 : 4;
      parts.push(
        `<circle cx="${x}" cy="${eyeY}" r="${r}" fill="${OUTLINE}"/><circle cx="${x + 1.5}" cy="${eyeY - 1.5}" r="${eyes === 'sparkle' ? 2.2 : 1.3}" fill="#fff"/>`,
      );
      if (eyes === 'sparkle')
        parts.push(`<circle cx="${x - 1.5}" cy="${eyeY + 1.5}" r="1" fill="#fff"/>`);
    }
  });
  const brows = item(loadout, 'brows');
  if (brows) {
    const w = brows.kind === 'bold' ? 4 : 2.5;
    for (const x of eyeX) {
      const d =
        brows.kind === 'arched'
          ? `M${x - 6} ${eyeY - 8} Q${x} ${eyeY - 14} ${x + 6} ${eyeY - 8}`
          : `M${x - 6} ${eyeY - 10} L${x + 6} ${eyeY - 10}`;
      parts.push(
        `<path d="${d}" fill="none" stroke="${hairColor === '#2b2220' ? hairColor : brows.color}" stroke-width="${w}" stroke-linecap="round"/>`,
      );
    }
  }
  const blush = item(loadout, 'blush');
  if (blush) {
    for (const x of [cx - 19, cx + 19]) {
      parts.push(
        blush.kind === 'heart'
          ? `<text x="${x}" y="${eyeY + 14}" font-size="11" text-anchor="middle" fill="${blush.color}">♥</text>`
          : `<ellipse cx="${x}" cy="${eyeY + 10}" rx="6" ry="4" fill="${blush.color}" opacity="0.8"/>`,
      );
    }
  }
  const lips = item(loadout, 'lips')?.color;
  const mouth = item(loadout, 'mouth')?.kind ?? 'smile';
  const my = headY + 16;
  if (mouth === 'o')
    parts.push(`<circle cx="${cx}" cy="${my}" r="4" fill="${lips ?? '#8a3b3b'}"/>`);
  else if (mouth === 'grin')
    parts.push(
      `<path d="M${cx - 9} ${my - 3} Q${cx} ${my + 9} ${cx + 9} ${my - 3} Z" fill="${lips ?? '#8a3b3b'}" ${stroke}/>`,
    );
  else if (mouth === 'tongue')
    parts.push(
      `<path d="M${cx - 7} ${my - 2} Q${cx} ${my + 5} ${cx + 7} ${my - 2}" fill="none" stroke="${OUTLINE}" stroke-width="3" stroke-linecap="round"/><ellipse cx="${cx + 2}" cy="${my + 4}" rx="4" ry="5" fill="#ff7f9f"/>`,
    );
  else
    parts.push(
      `<path d="M${cx - 7} ${my - 2} Q${cx} ${my + 6} ${cx + 7} ${my - 2}" fill="none" stroke="${lips ?? OUTLINE}" stroke-width="${lips ? 4 : 3}" stroke-linecap="round"/>`,
    );
  const paint = item(loadout, 'face');
  if (paint?.kind === 'glitter') {
    for (const [x, y] of [
      [cx - 22, eyeY - 2],
      [cx + 23, eyeY - 4],
      [cx - 18, eyeY + 18],
      [cx + 20, eyeY + 16],
    ] as const) {
      parts.push(
        `<text x="${x}" y="${y}" font-size="8" text-anchor="middle" fill="${paint.color}">✦</text>`,
      );
    }
  } else if (paint?.kind === 'heart') {
    parts.push(
      `<text x="${cx + 21}" y="${eyeY + 20}" font-size="12" text-anchor="middle" fill="${paint.color}">♥</text>`,
    );
  } else if (paint?.kind === 'whiskers') {
    for (const s of [-1, 1]) {
      for (const dy of [-3, 3]) {
        parts.push(
          `<line x1="${cx + s * 12}" y1="${my - 4}" x2="${cx + s * 28}" y2="${my - 4 + dy * 2}" stroke="${paint.color}" stroke-width="2"/>`,
        );
      }
    }
  }

  // --- Hair on top.
  const hairTop: Record<string, string> = {
    short: `<path d="M30 48 Q30 16 60 16 Q90 16 90 48 Q84 30 60 30 Q40 30 30 48 Z" fill="${hairColor}" ${stroke}/>`,
    bob: `<path d="M28 64 Q24 16 60 16 Q96 16 92 64 L86 64 Q86 34 60 32 Q34 34 34 64 Z" fill="${hairColor}" ${stroke}/>`,
    ponytail: `<path d="M30 46 Q30 16 60 16 Q90 16 90 46 Q80 28 60 28 Q40 28 30 46 Z" fill="${hairColor}" ${stroke}/>`,
    long: `<path d="M28 58 Q26 16 60 16 Q94 16 92 58 Q86 30 60 30 Q34 30 28 58 Z" fill="${hairColor}" ${stroke}/>`,
    curly: [
      [40, 24],
      [60, 18],
      [80, 24],
      [32, 38],
      [88, 38],
    ]
      .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="12" fill="${hairColor}" ${stroke}/>`)
      .join(''),
    buns: `<path d="M30 46 Q30 18 60 18 Q90 18 90 46 Q80 30 60 30 Q40 30 30 46 Z" fill="${hairColor}" ${stroke}/>`,
    spiky: `<path d="M30 46 L34 20 L44 30 L50 12 L60 26 L70 12 L76 30 L86 20 L90 46 Q80 32 60 32 Q40 32 30 46 Z" fill="${hairColor}" ${stroke}/>`,
  };
  parts.push(hairTop[hair] ?? hairTop.short!);

  // --- Glasses and hats in front.
  if (glasses) {
    const c = glasses.color;
    if (glasses.kind === 'star') {
      for (const x of eyeX)
        parts.push(
          `<text x="${x}" y="${eyeY + 7}" font-size="22" text-anchor="middle" fill="none" stroke="${c}" stroke-width="2">★</text>`,
        );
    } else {
      const fill = glasses.kind === 'sun' ? c : 'none';
      for (const x of eyeX)
        parts.push(
          `<circle cx="${x}" cy="${eyeY}" r="8" fill="${fill}" fill-opacity="0.85" stroke="${c}" stroke-width="3"/>`,
        );
      parts.push(
        `<line x1="${cx - 3}" y1="${eyeY}" x2="${cx + 3}" y2="${eyeY}" stroke="${c}" stroke-width="3"/>`,
      );
    }
  }
  if (hat) {
    if (hat.kind === 'cap') {
      parts.push(
        `<path d="M30 34 Q30 12 60 12 Q90 12 90 34 Z" fill="${hat.color}" ${stroke}/><rect x="56" y="30" width="44" height="8" rx="4" fill="${hat.color}" ${stroke}/>`,
      );
    } else if (hat.kind === 'crown') {
      parts.push(
        `<path d="M40 24 L42 6 L51 16 L60 2 L69 16 L78 6 L80 24 Z" fill="${hat.color}" ${stroke}/>`,
      );
    } else if (hat.kind === 'ears') {
      for (const x of [44, 76]) {
        parts.push(
          `<ellipse cx="${x}" cy="4" rx="8" ry="20" fill="${hat.color}" ${stroke}/><ellipse cx="${x}" cy="6" rx="4" ry="13" fill="${hat.color2 ?? '#ff9fc4'}"/>`,
        );
      }
      parts.push(
        `<path d="M34 26 Q60 12 86 26" fill="none" stroke="${OUTLINE}" stroke-width="4"/>`,
      );
    } else if (hat.kind === 'flowers') {
      parts.push(
        `<path d="M32 28 Q60 12 88 28" fill="none" stroke="${hat.color}" stroke-width="6"/>`,
      );
      [36, 48, 60, 72, 84].forEach((x, i) => {
        const y = 26 - Math.sin((i / 4) * Math.PI) * 12;
        parts.push(
          `<circle cx="${x}" cy="${y}" r="5" fill="${i % 2 ? '#ffd84d' : (hat.color2 ?? '#ff9fc4')}" ${stroke}/>`,
        );
      });
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-6 -24 132 224" width="132" height="224">${parts.join('')}</svg>`;
}

/** As a data URI for <img src> and Phaser texture loading. */
export function avatarDataUri(loadout: AvatarLoadout): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(avatarSvg(loadout))}`;
}

/** Stable key for caching a rendered avatar (same outfit = same texture). */
export function avatarKey(loadout: AvatarLoadout): string {
  let h = 0x811c9dc5;
  const text = JSON.stringify(loadout);
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return `avatar-${h.toString(16)}`;
}
