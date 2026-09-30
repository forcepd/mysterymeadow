/**
 * Music and sound effects as data (DESIGN 16.3). Everything is synthesized with Web Audio from
 * these recipes: original, tiny, no files or licenses, and no network. Pure, so it's unit-tested;
 * AudioEngine turns it into sound.
 */

const NOTE_INDEX: Record<string, number> = {
  C: 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
};

/** 'A4' -> 440. Returns NaN for anything that isn't a note name. */
export function noteHz(note: string): number {
  const m = /^([A-G](?:#|b)?)(-?\d)$/.exec(note);
  if (!m) return Number.NaN;
  const semis = NOTE_INDEX[m[1]!]! + (Number(m[2]) + 1) * 12;
  return 440 * 2 ** ((semis - 69) / 12);
}

// --- Music --------------------------------------------------------------------------------

export type Wave = 'sine' | 'triangle' | 'square' | 'sawtooth';

/**
 * One instrument line. `pattern` is one token per step: a note ("E5"), a chord ("C4+E4+G4"),
 * "-" to hold the previous note one more step, or "." for silence.
 */
export interface Voice {
  readonly wave: Wave;
  /** Loudness 0..1 before the music volume. */
  readonly gain: number;
  /** Seconds to fade in and out, so notes never click. */
  readonly attack: number;
  readonly release: number;
  readonly pattern: string;
}

export interface Song {
  readonly bpm: number;
  /** Steps per beat (2 = eighth notes). */
  readonly stepsPerBeat: number;
  readonly voices: readonly Voice[];
}

export interface NoteEvent {
  readonly step: number;
  readonly notes: readonly string[];
  /** In steps, including held steps. */
  readonly length: number;
}

/** Turns a pattern into notes with their start step and length. */
export function parsePattern(pattern: string): { events: NoteEvent[]; steps: number } {
  const tokens = pattern.trim().split(/\s+/);
  const events: { step: number; notes: string[]; length: number }[] = [];
  tokens.forEach((token, step) => {
    if (token === '.') return;
    if (token === '-') {
      const last = events[events.length - 1];
      if (last && last.step + last.length === step) last.length++;
      return;
    }
    events.push({ step, notes: token.split('+'), length: 1 });
  });
  return { events, steps: tokens.length };
}

/** Seconds per step. */
export function stepSeconds(song: Song): number {
  return 60 / song.bpm / song.stepsPerBeat;
}

/** Length of the loop in steps (the longest voice; shorter voices repeat inside it). */
export function songSteps(song: Song): number {
  return Math.max(...song.voices.map((v) => parsePattern(v.pattern).steps));
}

// Patterns are written 8 steps (one 4/4 bar of eighths) per line.
const bars = (...lines: string[]) => lines.join(' ');

/** Yard: a bright, gentle stroll in C major pentatonic. */
const YARD: Song = {
  bpm: 92,
  stepsPerBeat: 2,
  voices: [
    {
      wave: 'triangle',
      gain: 0.16,
      attack: 0.01,
      release: 0.18,
      pattern: bars(
        'E5 - G5 . A5 - G5 .',
        'E5 - D5 . C5 - - .',
        'D5 - E5 . G5 - E5 .',
        'D5 - - - . . . .',
        'E5 - G5 . A5 - C6 .',
        'A5 - G5 . E5 - G5 .',
        'D5 - E5 . D5 - C5 .',
        'C5 - - - . . . .',
      ),
    },
    {
      wave: 'sine',
      gain: 0.2,
      attack: 0.01,
      release: 0.25,
      pattern: bars(
        'C3 . G3 . C3 . G3 .',
        'A2 . E3 . A2 . E3 .',
        'F2 . C3 . F2 . C3 .',
        'G2 . D3 . G2 . D3 .',
        'C3 . G3 . C3 . G3 .',
        'A2 . E3 . A2 . E3 .',
        'F2 . C3 . G2 . D3 .',
        'C3 . G3 . C3 . . .',
      ),
    },
    {
      wave: 'sine',
      gain: 0.05,
      attack: 0.25,
      release: 0.5,
      pattern: bars(
        'C4+E4+G4 - - - - - - -',
        'A3+C4+E4 - - - - - - -',
        'F3+A3+C4 - - - - - - -',
        'G3+B3+D4 - - - - - - -',
        'C4+E4+G4 - - - - - - -',
        'A3+C4+E4 - - - - - - -',
        'F3+A3+C4 - - - G3+B3+D4 - - -',
        'C4+E4+G4 - - - - - - -',
      ),
    },
  ],
};

/** House: a slow, cozy music box in F major. */
const HOUSE: Song = {
  bpm: 72,
  stepsPerBeat: 2,
  voices: [
    {
      wave: 'sine',
      gain: 0.2,
      attack: 0.005,
      release: 0.6,
      pattern: bars(
        'A5 . C6 . A5 . F5 .',
        'G5 . A5 . G5 . E5 .',
        'F5 . A5 . C6 . D6 .',
        'C6 . . . . . . .',
        'D6 . C6 . A5 . F5 .',
        'G5 . A5 . G5 . D5 .',
        'E5 . G5 . F5 . E5 .',
        'F5 . . . . . . .',
      ),
    },
    {
      wave: 'triangle',
      gain: 0.12,
      attack: 0.02,
      release: 0.4,
      pattern: bars(
        'F3 . C4 . A3 . C4 .',
        'C3 . G3 . E3 . G3 .',
        'D3 . A3 . F3 . A3 .',
        'A2 . E3 . C3 . E3 .',
        'Bb2 . F3 . D3 . F3 .',
        'C3 . G3 . E3 . G3 .',
        'C3 . G3 . Bb3 . G3 .',
        'F3 . C4 . A3 . . .',
      ),
    },
  ],
};

export const SONGS = { yard: YARD, house: HOUSE } as const;
export type SongId = keyof typeof SONGS;

// --- Sound effects ------------------------------------------------------------------------

/** One part of a sound: a tone that can slide in pitch, or a puff of filtered noise. */
export type SfxPart =
  | {
      readonly kind: 'tone';
      readonly wave: Wave;
      readonly from: number;
      /** Slides to this pitch by the end (Hz). */
      readonly to?: number;
      /** Start, in seconds from the sound's start. */
      readonly at: number;
      readonly dur: number;
      readonly gain: number;
    }
  | {
      readonly kind: 'noise';
      readonly at: number;
      readonly dur: number;
      readonly gain: number;
      /** Band-pass center (Hz): low = whoosh, high = hiss. */
      readonly filter: number;
    };

const tone = (
  wave: Wave,
  note: string | number,
  at: number,
  dur: number,
  gain: number,
  to?: string | number,
): SfxPart => ({
  kind: 'tone',
  wave,
  from: typeof note === 'number' ? note : noteHz(note),
  ...(to !== undefined ? { to: typeof to === 'number' ? to : noteHz(to) } : {}),
  at,
  dur,
  gain,
});

const arp = (wave: Wave, notes: string[], gap: number, dur: number, gain: number, start = 0) =>
  notes.map((n, i) => tone(wave, n, start + i * gap, dur, gain));

export const SFX = {
  /** A mystery visitor turns into an animal. */
  reveal: [
    tone('sine', 260, 0, 0.12, 0.5, 900),
    ...arp('triangle', ['C6', 'E6', 'G6', 'C7'], 0.06, 0.18, 0.22, 0.1),
  ],
  /** Coins (sales). */
  coin: [tone('square', 'B5', 0, 0.07, 0.12), tone('square', 'E6', 0.07, 0.28, 0.12)],
  /** Something bought. */
  purchase: [
    tone('triangle', 'G5', 0, 0.08, 0.25),
    tone('triangle', 'C6', 0.08, 0.08, 0.25),
    tone('square', 'E6', 0.16, 0.25, 0.1),
    { kind: 'noise', at: 0.16, dur: 0.2, gain: 0.08, filter: 7000 },
  ],
  /** A poop cleaned up. */
  clean: [
    { kind: 'noise', at: 0, dur: 0.12, gain: 0.12, filter: 3000 },
    ...arp('sine', ['E6', 'G6', 'B6', 'E7'], 0.045, 0.14, 0.18, 0.05),
  ],
  /** Someone got sick: a small, silly "ah-choo". */
  sneeze: [
    tone('sine', 420, 0, 0.3, 0.18, 620),
    { kind: 'noise', at: 0.32, dur: 0.16, gain: 0.35, filter: 2400 },
  ],
  /** Babies are born. */
  babySqueak: [tone('sine', 900, 0, 0.1, 0.25, 1500), tone('sine', 1100, 0.14, 0.12, 0.22, 1700)],
  /** A trick round won, or a trick performed. */
  trickSuccess: arp('triangle', ['C5', 'E5', 'G5', 'C6'], 0.07, 0.2, 0.25),
  /** A trick learned, a house upgrade, a cure: a little fanfare. */
  fanfare: [
    ...arp('triangle', ['G4', 'C5', 'E5'], 0.09, 0.14, 0.24),
    tone('triangle', 'G5', 0.27, 0.4, 0.26),
    tone('sine', 'E5', 0.27, 0.4, 0.14),
  ],
  /** Petting and treats: a soft happy chirp. */
  happy: [tone('sine', 'A5', 0, 0.09, 0.18, 'C6'), tone('sine', 'E6', 0.1, 0.14, 0.14)],
  /** A gentle "not quite" (wrong treatment, a Simon-says mistake). Never harsh. */
  oops: [tone('triangle', 'E5', 0, 0.14, 0.2), tone('triangle', 'C5', 0.15, 0.24, 0.2)],
  /** One Simon-says cue (pitch set per cue by the caller). */
  cue: [tone('triangle', 'C5', 0, 0.18, 0.22)],
  /** Gems. */
  gem: arp('sine', ['A6', 'E7', 'A7'], 0.05, 0.16, 0.14),
} satisfies Record<string, readonly SfxPart[]>;

export type SfxId = keyof typeof SFX;

/** Simon-says cue pitches: each arrow sounds different, so it can be learned by ear too. */
export const CUE_NOTES = { left: 'C5', up: 'E5', right: 'G5', down: 'A4', tap: 'C6' } as const;

/** Total length of a sound in seconds. */
export function sfxDuration(parts: readonly SfxPart[]): number {
  return Math.max(...parts.map((p) => p.at + p.dur));
}
