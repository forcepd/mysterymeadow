import { audio, type AudioEngine } from '../audio/AudioEngine';
import type { SfxId, SongId } from '../audio/sounds';
import type { SimEvents } from '../sim/events';
import type { GameSettings } from '../sim/types';
import { appBus } from './appBus';
import type { GameSession } from './gameSession';

/**
 * Which sound each sim event makes (DESIGN 16.3), or null for none. Pure, so it's unit-tested.
 * The UI only plays sounds for things the sim doesn't know about (Simon-says cues).
 */
export function sfxForEvent<K extends keyof SimEvents>(
  name: K,
  payload: SimEvents[K],
): SfxId | null {
  switch (name) {
    case 'visitorRevealed':
      return 'reveal';
    case 'animalSold':
      return 'coin';
    case 'poopCleaned':
      return 'clean';
    case 'animalSick':
      return 'sneeze';
    case 'animalBorn':
      return 'babySqueak';
    case 'trickPracticed':
    case 'trickPerformed':
      return 'trickSuccess';
    case 'trickLearned':
    case 'houseUpgraded':
    case 'animalCured':
      return 'fanfare';
    case 'itemBought':
    case 'realEstateBought':
      return 'purchase';
    case 'vetTreated': {
      // A cure plays the fanfare (animalCured); half of a tricky case gets a cheer; a wrong
      // guess gets a gentle "hmm".
      const { cured, helped } = payload as SimEvents['vetTreated'];
      return cured ? null : helped ? 'trickSuccess' : 'oops';
    }
    case 'animalPetted':
    case 'treatGiven':
    case 'petDressed':
      return 'happy';
    case 'gemsGranted':
    case 'goalReady':
      return 'gem';
    case 'goalClaimed':
    case 'findCollected':
      return 'coin';
    case 'goalsCompleted':
    case 'dailyGiftOpened':
    case 'birthdayGreeted':
      return 'fanfare';
    default:
      return null;
  }
}

/** Events that can make a sound (the rest are never subscribed). */
const SOUND_EVENTS = [
  'visitorRevealed',
  'animalSold',
  'poopCleaned',
  'animalSick',
  'animalBorn',
  'trickPracticed',
  'trickPerformed',
  'trickLearned',
  'houseUpgraded',
  'animalCured',
  'itemBought',
  'realEstateBought',
  'vetTreated',
  'animalPetted',
  'treatGiven',
  'petDressed',
  'gemsGranted',
  'goalReady',
  'goalClaimed',
  'goalsCompleted',
  'findCollected',
  'dailyGiftOpened',
  'birthdayGreeted',
] as const satisfies readonly (keyof SimEvents)[];

/** Music for each scene: the vet shares the house's calm tune. */
export function songForScene(scene: 'yard' | 'house' | 'vet'): SongId {
  return scene === 'yard' ? 'yard' : 'house';
}

export function volumesOf(settings: GameSettings) {
  return { music: settings.musicVolume, sfx: settings.sfxVolume, muted: settings.muted };
}

/**
 * Connects a running game to the speakers: sim events play sounds, the scene picks the music,
 * and settings set the volume. Sound starts on the first tap (iOS needs a user gesture) and
 * pauses while the page is hidden. Returns a disconnect function.
 */
export function connectAudio(session: GameSession, engine: AudioEngine = audio): () => void {
  const { sim } = session;
  engine.setVolumes(volumesOf(sim.state.world.settings));
  engine.setMusic('yard');

  const offs: (() => void)[] = SOUND_EVENTS.map((name) =>
    sim.events.on(name, (payload) => {
      const id = sfxForEvent(name, payload as never);
      if (id) engine.play(id);
    }),
  );
  offs.push(
    sim.events.on('settingsChanged', ({ settings }) => engine.setVolumes(volumesOf(settings))),
    appBus.on('sceneChanged', ({ scene }) => engine.setMusic(songForScene(scene))),
  );

  const unlock = () => engine.unlock();
  const gestures = ['pointerdown', 'touchend', 'keydown'] as const;
  for (const g of gestures) window.addEventListener(g, unlock, { capture: true, passive: true });
  const onVisibility = () => engine.setSuspended(document.visibilityState === 'hidden');
  document.addEventListener('visibilitychange', onVisibility);

  return () => {
    offs.forEach((off) => off());
    for (const g of gestures) window.removeEventListener(g, unlock, { capture: true });
    document.removeEventListener('visibilitychange', onVisibility);
    engine.setMusic(null);
  };
}
