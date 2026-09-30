import type { FindKind } from '../sim/types';
import { OUTLINE, stroke, svgDocument, twinkle, type ViewBox } from './svg';

/** Yard finds (early-game pass): drawn around (0, 0), 64 x 64 world px. */
export const FIND_VIEW: ViewBox = { x: -32, y: -32, w: 64, h: 64 };

export function findSvg(kind: FindKind): string {
  const s = stroke(OUTLINE, 3);
  let body: string;
  switch (kind) {
    case 'coin':
      body =
        `<circle cx="0" cy="0" r="17" fill="#f5b93a" ${s}/>` +
        `<circle cx="0" cy="0" r="11" fill="none" stroke="#d99a1e" stroke-width="2.5"/>` +
        `<path d="M0 -6 L2 -2 L6 -1.5 L3 1.5 L4 6 L0 3.8 L-4 6 L-3 1.5 L-6 -1.5 L-2 -2 Z" fill="#fff3c4"/>` +
        twinkle(12, -14, 5, '#ffffff');
      break;
    case 'clover': {
      const leaf = (angle: number) =>
        `<g transform="rotate(${angle})"><path d="M0 0 C-12 -6 -12 -20 -4 -20 C-1 -20 0 -16 0 -14 C0 -16 1 -20 4 -20 C12 -20 12 -6 0 0 Z" fill="#6cc05a" ${stroke(OUTLINE, 2.5)}/></g>`;
      body =
        `<path d="M0 2 Q4 14 10 22" fill="none" stroke="${OUTLINE}" stroke-width="6" stroke-linecap="round"/>` +
        `<path d="M0 2 Q4 14 10 22" fill="none" stroke="#5aa04a" stroke-width="3" stroke-linecap="round"/>` +
        [0, 90, 180, 270].map(leaf).join('') +
        `<circle cx="0" cy="0" r="3" fill="#8fd07a"/>` +
        twinkle(15, -16, 5, '#fff6c2');
      break;
    }
    case 'butterfly':
      body =
        `<ellipse cx="-11" cy="-7" rx="11" ry="9" fill="#ff9fc4" transform="rotate(-20 -11 -7)" ${stroke(OUTLINE, 2.5)}/>` +
        `<ellipse cx="11" cy="-7" rx="11" ry="9" fill="#ff9fc4" transform="rotate(20 11 -7)" ${stroke(OUTLINE, 2.5)}/>` +
        `<ellipse cx="-8" cy="7" rx="7" ry="6" fill="#b69bff" ${stroke(OUTLINE, 2.5)}/>` +
        `<ellipse cx="8" cy="7" rx="7" ry="6" fill="#b69bff" ${stroke(OUTLINE, 2.5)}/>` +
        `<circle cx="-11" cy="-8" r="3" fill="#fff"/><circle cx="11" cy="-8" r="3" fill="#fff"/>` +
        `<ellipse cx="0" cy="0" rx="3" ry="11" fill="${OUTLINE}"/>` +
        `<path d="M-1 -10 Q-5 -18 -8 -19 M1 -10 Q5 -18 8 -19" fill="none" stroke="${OUTLINE}" stroke-width="2" stroke-linecap="round"/>`;
      break;
  }
  return svgDocument(FIND_VIEW, body);
}
