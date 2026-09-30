import { BALANCE } from '../config/balance';

/**
 * The Parent PIN (DESIGN 20). Stored salted and hashed so it isn't readable at a glance in
 * saved data. This is a speed bump for curious kids, not real security: everything is on the
 * kid's own device, and clearing site data removes it.
 */
export interface PinRecord {
  salt: string;
  hash: string;
}

export function isValidPin(pin: string): boolean {
  return new RegExp(`^\\d{${BALANCE.pin.digits}}$`).test(pin);
}

/** FNV-1a (32-bit), stretched over many rounds. Not cryptographic; see above. */
function stretch(text: string): string {
  let h = 0x811c9dc5;
  for (let round = 0; round < 2000; round++) {
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    h ^= round;
  }
  return h.toString(16).padStart(8, '0');
}

export function makePin(pin: string, salt: string): PinRecord {
  return { salt, hash: stretch(`${salt}:${pin}`) };
}

export function checkPin(record: PinRecord | undefined, pin: string): boolean {
  return record !== undefined && stretch(`${record.salt}:${pin}`) === record.hash;
}

const ONES = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function underThousand(n: number): string {
  const parts: string[] = [];
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds > 0) parts.push(`${ONES[hundreds]} hundred`);
  if (rest > 0) {
    if (hundreds > 0) parts.push('and');
    if (rest < 20) parts.push(ONES[rest]!);
    else {
      const t = TENS[Math.floor(rest / 10)]!;
      parts.push(rest % 10 ? `${t}-${ONES[rest % 10]}` : t);
    }
  }
  return parts.join(' ');
}

/**
 * Writes 1..999,999 in English words ("forty-seven thousand and six"). The "Forgot PIN?"
 * grown-up check asks for the number written this way, which young kids find hard.
 */
export function numberInWords(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 999_999) throw new RangeError(`Out of range: ${n}`);
  const thousands = Math.floor(n / 1000);
  const rest = n % 1000;
  const parts: string[] = [];
  if (thousands > 0) parts.push(`${underThousand(thousands)} thousand`);
  if (rest > 0) parts.push(`${thousands > 0 && rest < 100 ? 'and ' : ''}${underThousand(rest)}`);
  return parts.join(' ');
}
