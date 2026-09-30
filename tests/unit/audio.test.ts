import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioEngine, volumeGain } from '../../src/audio/AudioEngine';
import {
  CUE_NOTES,
  SFX,
  SONGS,
  noteHz,
  parsePattern,
  sfxDuration,
  songSteps,
  stepSeconds,
  type SfxPart,
} from '../../src/audio/sounds';
import { sfxForEvent, songForScene, volumesOf } from '../../src/bridge/audioBridge';
import type { Animal } from '../../src/sim/types';

describe('notes and patterns', () => {
  it('turns note names into pitches', () => {
    expect(noteHz('A4')).toBeCloseTo(440);
    expect(noteHz('A5')).toBeCloseTo(880);
    expect(noteHz('C4')).toBeCloseTo(261.63, 1);
    expect(noteHz('Bb2')).toBeCloseTo(noteHz('A#2'));
    expect(noteHz('H2')).toBeNaN();
    expect(noteHz('C')).toBeNaN();
  });

  it('reads notes, chords, holds, and rests', () => {
    const { events, steps } = parsePattern('C4 - - . E4+G4 . - D4');
    expect(steps).toBe(8);
    expect(events).toEqual([
      { step: 0, notes: ['C4'], length: 3 },
      { step: 4, notes: ['E4', 'G4'], length: 1 },
      { step: 7, notes: ['D4'], length: 1 },
    ]);
  });
});

describe('music (DESIGN 16.3: separate yard and house tracks)', () => {
  for (const [id, song] of Object.entries(SONGS)) {
    it(`${id}: every note is real, every line fits the loop, and it's gentle`, () => {
      const loop = songSteps(song);
      expect(loop % 8).toBe(0);
      // A loop of at least 15 seconds, so it doesn't feel repetitive.
      expect(loop * stepSeconds(song)).toBeGreaterThan(15);
      for (const voice of song.voices) {
        const { events, steps } = parsePattern(voice.pattern);
        expect(loop % steps, id).toBe(0);
        expect(voice.gain).toBeLessThanOrEqual(0.25);
        expect(voice.attack).toBeGreaterThan(0);
        for (const e of events)
          for (const note of e.notes) {
            const hz = noteHz(note);
            expect(hz, `${id} ${note}`).toBeGreaterThan(60);
            expect(hz, `${id} ${note}`).toBeLessThan(2500);
          }
      }
    });
  }

  it('the yard and the house sound different', () => {
    expect(SONGS.yard.voices[0]!.pattern).not.toBe(SONGS.house.voices[0]!.pattern);
    expect(songForScene('yard')).toBe('yard');
    expect(songForScene('house')).toBe('house');
    expect(songForScene('vet')).toBe('house');
  });
});

describe('sound effects', () => {
  it('has every sound DESIGN 16.3 asks for', () => {
    for (const id of [
      'reveal',
      'coin',
      'clean',
      'sneeze',
      'babySqueak',
      'trickSuccess',
      'purchase',
    ])
      expect(SFX).toHaveProperty(id);
  });

  it('every sound is short, audible, and never too loud', () => {
    for (const [id, parts] of Object.entries(SFX) as [string, readonly SfxPart[]][]) {
      expect(parts.length, id).toBeGreaterThan(0);
      expect(sfxDuration(parts), id).toBeLessThan(1);
      for (const p of parts) {
        expect(p.dur, id).toBeGreaterThan(0);
        expect(p.gain, id).toBeGreaterThan(0);
        expect(p.gain, id).toBeLessThanOrEqual(0.5);
        if (p.kind === 'tone') {
          expect(p.from, id).toBeGreaterThan(60);
          expect(p.from, id).toBeLessThan(5000);
          if (p.to !== undefined) expect(p.to, id).toBeLessThan(5000);
        }
      }
    }
  });

  it('each Simon-says cue has its own note', () => {
    const notes = Object.values(CUE_NOTES);
    expect(new Set(notes).size).toBe(notes.length);
    for (const n of notes) expect(noteHz(n)).toBeGreaterThan(0);
  });
});

describe('which event makes which sound', () => {
  const animal = {} as Animal;
  it('maps the moments that matter', () => {
    expect(sfxForEvent('visitorRevealed', { visitor: {} as never, auto: false })).toBe('reveal');
    expect(sfxForEvent('animalSold', { animal, price: 40 })).toBe('coin');
    expect(sfxForEvent('poopCleaned', { poop: {} as never })).toBe('clean');
    expect(sfxForEvent('animalSick', { animal, illnessId: 'sniffles' })).toBe('sneeze');
    expect(sfxForEvent('animalBorn', { mother: animal, babies: [] })).toBe('babySqueak');
    expect(sfxForEvent('trickPracticed', { animal, trickId: 'sit', progress: 1 })).toBe(
      'trickSuccess',
    );
    expect(sfxForEvent('trickLearned', { animal, trickId: 'sit', gems: 5 })).toBe('fanfare');
    expect(sfxForEvent('itemBought', { itemId: 'sofa' })).toBe('purchase');
  });

  it('a wrong treatment is a gentle "oops"; a cure is the fanfare instead', () => {
    const base = { animal, treatmentId: 'bandage', cost: 10 };
    expect(sfxForEvent('vetTreated', { ...base, cured: false, helped: false })).toBe('oops');
    expect(sfxForEvent('vetTreated', { ...base, cured: true, helped: true })).toBeNull();
    // Half of a tricky case.
    expect(sfxForEvent('vetTreated', { ...base, cured: false, helped: true })).toBe('trickSuccess');
    expect(sfxForEvent('animalCured', { animal, illnessId: 'sore_paw' })).toBe('fanfare');
  });

  it('the early-game extras have sounds too', () => {
    expect(sfxForEvent('goalReady', { goalId: 'pet5' })).toBe('gem');
    expect(sfxForEvent('goalClaimed', { goalId: 'pet5', reward: { coins: 15 } })).toBe('coin');
    expect(sfxForEvent('goalsCompleted', { reward: {} })).toBe('fanfare');
    const find = { id: 'f', kind: 'coin' as const, position: { x: 0, y: 0 }, expiresAt: 0 };
    expect(sfxForEvent('findCollected', { find, coins: 3 })).toBe('coin');
    expect(sfxForEvent('findGone', { find })).toBeNull();
    expect(sfxForEvent('dailyGiftOpened', { reward: { coins: 40, gems: 0 } })).toBe('fanfare');
  });

  it('stays quiet for everything else', () => {
    expect(sfxForEvent('changed', undefined)).toBeNull();
    expect(sfxForEvent('coinsChanged', { coins: 1, delta: 1 })).toBeNull();
  });
});

// --- The engine, against a fake Web Audio ------------------------------------------------------

class FakeParam {
  value = 1;
  setValueAtTime(v: number) {
    this.value = v;
    return this;
  }
  setTargetAtTime(v: number) {
    this.value = v;
    return this;
  }
  linearRampToValueAtTime(v: number) {
    this.value = v;
    return this;
  }
  exponentialRampToValueAtTime(v: number) {
    this.value = v;
    return this;
  }
  cancelScheduledValues() {
    return this;
  }
}
class FakeNode {
  gain = new FakeParam();
  frequency = new FakeParam();
  Q = new FakeParam();
  type = '';
  buffer: unknown = null;
  connect(n: unknown) {
    return n;
  }
  start() {}
  stop() {}
}
class FakeContext {
  static made: FakeContext[] = [];
  state: 'suspended' | 'running' | 'closed' = 'suspended';
  currentTime = 0;
  sampleRate = 8000;
  destination = new FakeNode();
  oscillators = 0;
  noises = 0;
  constructor() {
    FakeContext.made.push(this);
  }
  resume() {
    this.state = 'running';
    return Promise.resolve();
  }
  suspend() {
    this.state = 'suspended';
    return Promise.resolve();
  }
  createGain() {
    return new FakeNode();
  }
  createOscillator() {
    this.oscillators++;
    return new FakeNode();
  }
  createBiquadFilter() {
    return new FakeNode();
  }
  createBufferSource() {
    this.noises++;
    return new FakeNode();
  }
  createBuffer(_c: number, length: number) {
    return { getChannelData: () => new Float32Array(length) };
  }
}

describe('audio engine', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    FakeContext.made = [];
  });

  function unlocked() {
    vi.stubGlobal('window', { AudioContext: FakeContext });
    const engine = new AudioEngine();
    engine.unlock();
    const ctx = FakeContext.made[0]!;
    ctx.oscillators = 0;
    return { engine, ctx };
  }

  it('stays silent (and never throws) until the first tap, or without Web Audio', () => {
    vi.stubGlobal('window', {});
    const engine = new AudioEngine();
    engine.play('coin');
    engine.setMusic('yard');
    engine.unlock();
    expect(engine.isUnlocked).toBe(false);
  });

  it('plays a sound after unlocking', () => {
    const { engine, ctx } = unlocked();
    expect(engine.isUnlocked).toBe(true);
    engine.play('coin');
    expect(ctx.oscillators).toBe(SFX.coin.length);
  });

  it('muted or zero volume plays nothing', () => {
    const { engine, ctx } = unlocked();
    engine.setVolumes({ music: 1, sfx: 1, muted: true });
    engine.play('coin');
    engine.setVolumes({ music: 1, sfx: 0, muted: false });
    engine.play('reveal');
    expect(ctx.oscillators).toBe(0);
  });

  it('a burst of the same sound plays once', () => {
    const { engine, ctx } = unlocked();
    engine.play('clean');
    engine.play('clean');
    engine.play('clean');
    const tones = SFX.clean.filter((p) => p.kind === 'tone').length;
    expect(ctx.oscillators).toBe(tones);
    ctx.currentTime += 0.2;
    engine.play('clean');
    expect(ctx.oscillators).toBe(tones * 2);
  });

  it('schedules music ahead, and stops it when muted', () => {
    vi.useFakeTimers();
    const { engine, ctx } = unlocked();
    engine.setMusic('yard');
    expect(ctx.oscillators).toBeGreaterThan(0);
    const scheduled = ctx.oscillators;
    const play = (seconds: number) => {
      for (let t = 0; t < seconds; t += 0.06) {
        ctx.currentTime += 0.06;
        vi.advanceTimersByTime(60);
      }
    };
    play(3);
    expect(ctx.oscillators).toBeGreaterThan(scheduled + 10);
    engine.setVolumes({ music: 1, sfx: 1, muted: true });
    const afterMute = ctx.oscillators;
    play(3);
    expect(ctx.oscillators).toBe(afterMute);
  });

  it('pauses with the page', () => {
    const { engine, ctx } = unlocked();
    engine.setSuspended(true);
    expect(ctx.state).toBe('suspended');
    engine.play('coin');
    expect(ctx.oscillators).toBe(0);
    engine.setSuspended(false);
    expect(ctx.state).toBe('running');
  });

  it('volume sliders use an even-feeling curve', () => {
    expect(volumeGain(0)).toBe(0);
    expect(volumeGain(1)).toBe(1);
    expect(volumeGain(0.5)).toBeCloseTo(0.25);
    expect(volumeGain(2)).toBe(1);
    expect(volumeGain(-1)).toBe(0);
    expect(
      volumesOf({ musicVolume: 0.4, sfxVolume: 0.7, muted: true } as Parameters<
        typeof volumesOf
      >[0]),
    ).toEqual({ music: 0.4, sfx: 0.7, muted: true });
  });
});
