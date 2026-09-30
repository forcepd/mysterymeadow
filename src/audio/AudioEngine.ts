import {
  SFX,
  SONGS,
  noteHz,
  parsePattern,
  songSteps,
  stepSeconds,
  type NoteEvent,
  type SfxId,
  type SfxPart,
  type Song,
  type SongId,
  type Voice,
} from './sounds';

/** How far ahead music notes are scheduled, and how often the scheduler wakes up. */
const LOOKAHEAD_S = 0.25;
const TICK_MS = 60;
/** Overall loudness before the player's volume sliders. */
const MASTER = 0.8;
const MUSIC_FADE_S = 0.6;
/** The same sound can't restart faster than this (a burst of events stays pleasant). */
const SFX_MIN_GAP_S = 0.07;

export interface VolumeSettings {
  /** 0..1 */
  readonly music: number;
  /** 0..1 */
  readonly sfx: number;
  readonly muted: boolean;
}

/** Sliders feel even to the ear with a squared curve. */
export function volumeGain(v: number): number {
  const c = Math.max(0, Math.min(1, v));
  return c * c;
}

type Ctx = AudioContext;

/**
 * Plays the synthesized music and sounds (DESIGN 16.3). Nothing makes a sound until `unlock()` is
 * called from a user tap (iOS Safari requires it). Safe to call anything before that, or in a
 * browser without Web Audio: it just stays quiet.
 */
export class AudioEngine {
  private ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private volumes: VolumeSettings = { music: 1, sfx: 1, muted: false };
  private lastPlayed = new Map<string, number>();

  private wantedSong: SongId | null = null;
  private playing: { id: SongId; song: Song; steps: number; tracks: Track[] } | null = null;
  private nextStep = 0;
  private nextStepAt = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private suspended = false;

  get isUnlocked(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  /** Call from a tap/click/keypress handler. Creates and wakes the audio context. */
  unlock(): void {
    if (!this.ctx) {
      const AC =
        typeof window === 'undefined'
          ? undefined
          : (window.AudioContext ??
            (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
      if (!AC) return;
      const ctx = new AC();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.connect(ctx.destination);
      this.musicBus = ctx.createGain();
      this.musicBus.connect(this.master);
      this.sfxBus = ctx.createGain();
      this.sfxBus.connect(this.master);
      this.noise = makeNoise(ctx);
      this.applyVolumes();
      // iOS: playing any buffer inside the gesture fully unlocks output.
      const silent = ctx.createBufferSource();
      silent.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      silent.connect(ctx.destination);
      silent.start();
    }
    if (this.ctx.state !== 'running' && !this.suspended) void this.ctx.resume();
    this.syncMusic();
  }

  setVolumes(v: VolumeSettings): void {
    this.volumes = v;
    this.applyVolumes();
  }

  /** The page was hidden (pause everything) or shown again. */
  setSuspended(suspended: boolean): void {
    this.suspended = suspended;
    if (!this.ctx) return;
    if (suspended) void this.ctx.suspend();
    else if (this.ctx.state !== 'closed') void this.ctx.resume();
  }

  /** Which music should play (null = none). Switches with a short fade. */
  setMusic(id: SongId | null): void {
    this.wantedSong = id;
    this.syncMusic();
  }

  /** Plays a sound effect. `pitch` (Hz) replaces the pitch of single-tone sounds (Simon cues). */
  play(id: SfxId, pitch?: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || ctx.state !== 'running') return;
    if (this.volumes.muted || this.volumes.sfx <= 0) return;
    const now = ctx.currentTime;
    const key = pitch ? `${id}@${pitch}` : id;
    if (now - (this.lastPlayed.get(key) ?? -1) < SFX_MIN_GAP_S) return;
    this.lastPlayed.set(key, now);
    for (const part of SFX[id] as readonly SfxPart[]) this.playPart(part, now, pitch);
  }

  private applyVolumes(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.musicBus || !this.sfxBus) return;
    const t = ctx.currentTime;
    const { music, sfx, muted } = this.volumes;
    this.master.gain.setTargetAtTime(muted ? 0 : MASTER, t, 0.03);
    this.musicBus.gain.setTargetAtTime(volumeGain(music), t, 0.03);
    this.sfxBus.gain.setTargetAtTime(volumeGain(sfx), t, 0.03);
    this.syncMusic();
  }

  /** Starts, stops, or switches the loop to match what's wanted and allowed. */
  private syncMusic(): void {
    const ctx = this.ctx;
    const bus = this.musicBus;
    if (!ctx || !bus) return;
    const quiet = this.volumes.muted || this.volumes.music <= 0;
    const want = quiet ? null : this.wantedSong;
    if (this.playing?.id === want) return;

    // Fade out whatever is playing, then start the new loop.
    const t = ctx.currentTime;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const fading = this.playing;
    this.playing = null;
    if (fading) {
      bus.gain.cancelScheduledValues(t);
      bus.gain.setValueAtTime(bus.gain.value, t);
      bus.gain.linearRampToValueAtTime(0, t + MUSIC_FADE_S);
    }
    if (!want) return;
    const song = SONGS[want];
    this.playing = {
      id: want,
      song,
      steps: songSteps(song),
      tracks: song.voices.map((voice) => ({ voice, ...parsePattern(voice.pattern) })),
    };
    const startAt = t + (fading ? MUSIC_FADE_S : 0.05);
    bus.gain.setValueAtTime(0, startAt);
    bus.gain.linearRampToValueAtTime(volumeGain(this.volumes.music), startAt + MUSIC_FADE_S);
    this.nextStep = 0;
    this.nextStepAt = startAt;
    this.timer = setInterval(() => this.schedule(), TICK_MS);
    this.schedule();
  }

  /** Queues every music note that starts within the lookahead window. */
  private schedule(): void {
    const ctx = this.ctx;
    const p = this.playing;
    if (!ctx || !p || !this.musicBus) return;
    if (ctx.state !== 'running') {
      // Paused (hidden page): pick up from "now" when it runs again, no catch-up burst.
      this.nextStepAt = ctx.currentTime + 0.05;
      return;
    }
    const step = stepSeconds(p.song);
    // Fell far behind (e.g. a long pause): resync instead of blasting old notes.
    if (this.nextStepAt < ctx.currentTime - 0.5) this.nextStepAt = ctx.currentTime + 0.05;
    while (this.nextStepAt < ctx.currentTime + LOOKAHEAD_S) {
      for (const track of p.tracks) {
        const local = this.nextStep % track.steps;
        for (const e of track.events) {
          if (e.step === local) this.playNote(track.voice, e, this.nextStepAt, step);
        }
      }
      this.nextStep = (this.nextStep + 1) % p.steps;
      this.nextStepAt += step;
    }
  }

  private playNote(voice: Voice, e: NoteEvent, at: number, step: number): void {
    const ctx = this.ctx!;
    const len = e.length * step;
    const peak = voice.gain / Math.sqrt(e.notes.length);
    for (const note of e.notes) {
      const osc = ctx.createOscillator();
      osc.type = voice.wave;
      osc.frequency.value = noteHz(note);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, at);
      env.gain.linearRampToValueAtTime(peak, at + voice.attack);
      env.gain.setValueAtTime(peak, at + Math.max(voice.attack, len - 0.02));
      env.gain.linearRampToValueAtTime(0, at + len + voice.release);
      osc.connect(env).connect(this.musicBus!);
      osc.start(at);
      osc.stop(at + len + voice.release + 0.05);
    }
  }

  private playPart(part: SfxPart, start: number, pitch?: number): void {
    const ctx = this.ctx!;
    const at = start + part.at;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(part.gain, at + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, at + part.dur);
    env.connect(this.sfxBus!);
    if (part.kind === 'tone') {
      const osc = ctx.createOscillator();
      osc.type = part.wave;
      const from = pitch ?? part.from;
      osc.frequency.setValueAtTime(from, at);
      if (part.to !== undefined && pitch === undefined)
        osc.frequency.exponentialRampToValueAtTime(part.to, at + part.dur);
      osc.connect(env);
      osc.start(at);
      osc.stop(at + part.dur + 0.02);
      return;
    }
    if (!this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = part.filter;
    filter.Q.value = 1.2;
    src.connect(filter).connect(env);
    src.start(at);
    src.stop(at + part.dur + 0.02);
  }
}

interface Track {
  voice: Voice;
  events: NoteEvent[];
  steps: number;
}

function makeNoise(ctx: Ctx): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  // A fixed pattern (not Math.random), so every sneeze sounds the same.
  let seed = 12345;
  for (let i = 0; i < data.length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    data[i] = (seed / 0x7fffffff) * 2 - 1;
  }
  return buffer;
}

/** The one engine the app uses. */
export const audio = new AudioEngine();
