import { audio } from '../audio/AudioEngine';
import { CUE_NOTES, noteHz } from '../audio/sounds';
import { useCallback, useEffect, useRef, useState } from 'react';
import { appBus } from '../bridge/appBus';
import { displayName, formatCountdown } from '../bridge/describe';
import { BALANCE } from '../config/balance';
import { TRAINING_CUES, TRICKS, getTrick, type TrainingCue } from '../config/tricks';
import common from './common.module.css';
import { PetPortrait } from './PetPortrait';
import styles from './Screens.module.css';
import t from './TrainingScreen.module.css';
import { useSim } from './session';
import { useAppEvent } from './useAppEvent';

const CUE_ICON: Record<TrainingCue, string> = {
  left: '⬅️',
  up: '⬆️',
  right: '➡️',
  down: '⬇️',
  tap: '⭐',
};
const CUE_NAME: Record<TrainingCue, string> = {
  left: 'Left',
  up: 'Up',
  right: 'Right',
  down: 'Down',
  tap: 'Star',
};
/** Each cue has its own note, so the sequence can be learned by ear too. */
function playCue(cue: TrainingCue): void {
  audio.play('cue', noteHz(CUE_NOTES[cue]));
}

/** How long each cue lights up while the animal shows the sequence. */
const SHOW_MS = 650;
const GAP_MS = 250;

type Phase =
  | { kind: 'pick' }
  | { kind: 'show'; trickId: string; sequence: TrainingCue[]; lit: number }
  | {
      kind: 'repeat';
      trickId: string;
      sequence: TrainingCue[];
      done: number;
      lit: TrainingCue | null;
    }
  | { kind: 'result'; trickId: string; text: string; icon: string; again: boolean };

function randomSequence(length: number): TrainingCue[] {
  return Array.from(
    { length },
    () => TRAINING_CUES[Math.floor(Math.random() * TRAINING_CUES.length)]!,
  );
}

/**
 * Training (DESIGN 11, 17.1 #6): pick a trick, then Simon says. The animal shows a sequence of
 * 3-5 cues (longer each session); the kid repeats it. Success counts toward learning (3
 * sessions); a mistake just means "try again". The sim decides everything else.
 */
export function TrainingScreen() {
  const { sim } = useSim();
  const [animalId, setAnimalId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'pick' });
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  useAppEvent(
    'openScreen',
    useCallback(({ screen, animalId: id }) => {
      clearTimers();
      setAnimalId(screen === 'training' ? (id ?? null) : null);
      setPhase({ kind: 'pick' });
    }, []),
  );
  useEffect(() => clearTimers, []);

  const animal = animalId ? sim.getAnimal(animalId) : undefined;
  useEffect(() => {
    if (animalId && !animal) appBus.emit('openScreen', { screen: null });
  }, [animalId, animal]);
  if (!animalId || !animal) return null;

  const name = displayName(animal);
  const close = () => appBus.emit('openScreen', { screen: null });
  const sessions = BALANCE.tricks.sessionsToLearn;

  /** The animal shows the sequence, one cue at a time, then it's the kid's turn. */
  const start = (trickId: string) => {
    clearTimers();
    const progress = animal.tricks.progress[trickId] ?? 0;
    const length = BALANCE.tricks.cuesPerSession[progress] ?? 3;
    const sequence = randomSequence(length);
    setPhase({ kind: 'show', trickId, sequence, lit: -1 });
    sequence.forEach((_, i) => {
      timers.current.push(
        setTimeout(
          () => {
            setPhase({ kind: 'show', trickId, sequence, lit: i });
            playCue(sequence[i]!);
          },
          400 + i * (SHOW_MS + GAP_MS),
        ),
        setTimeout(
          () => setPhase({ kind: 'show', trickId, sequence, lit: -1 }),
          400 + i * (SHOW_MS + GAP_MS) + SHOW_MS,
        ),
      );
    });
    timers.current.push(
      setTimeout(
        () => setPhase({ kind: 'repeat', trickId, sequence, done: 0, lit: null }),
        400 + sequence.length * (SHOW_MS + GAP_MS),
      ),
    );
  };

  const press = (cue: TrainingCue) => {
    if (phase.kind !== 'repeat') return;
    const { trickId, sequence, done } = phase;
    if (sequence[done] !== cue) {
      audio.play('oops');
      const r = sim.trainSession(animal.id, trickId, false);
      setPhase({
        kind: 'result',
        trickId,
        icon: '🙈',
        text: r.ok ? `Almost! ${name} got mixed up. Try again!` : r.reason,
        again: r.ok,
      });
      return;
    }
    playCue(cue);
    if (done + 1 < sequence.length) {
      setPhase({ ...phase, done: done + 1, lit: cue });
      return;
    }
    const r = sim.trainSession(animal.id, trickId, true);
    const trick = getTrick(trickId)!;
    if (!r.ok) setPhase({ kind: 'result', trickId, icon: '💤', text: r.reason, again: false });
    else if (r.learned) {
      setPhase({
        kind: 'result',
        trickId,
        icon: '🎉',
        again: false,
        text:
          r.gems > 0
            ? `${name} learned ${trick.name}! +${r.gems} 💎`
            : `${name} learned ${trick.name}! (No more trick gems today, but it still counts.)`,
      });
    } else {
      setPhase({
        kind: 'result',
        trickId,
        icon: '⭐',
        again: false,
        text: `Great job! ${'⭐'.repeat(r.progress)}${'☆'.repeat(sessions - r.progress)} ${name} needs a rest now. Come back in ${BALANCE.tricks.cooldownMinutes} minutes!`,
      });
    }
  };

  const sequence = phase.kind === 'show' || phase.kind === 'repeat' ? phase.sequence : [];
  const litCue =
    phase.kind === 'show'
      ? phase.lit >= 0
        ? sequence[phase.lit]
        : undefined
      : phase.kind === 'repeat'
        ? phase.lit
        : null;
  const known = animal.tricks.known;
  const full = known.length >= sim.maxTricks(animal.id);
  const resting = sim.now() < animal.tricks.nextTrainAt;

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label="Training">
      <div className={`${common.panel} ${styles.screen}`}>
        <header className={styles.header}>
          <h2 className={styles.title}>
            <span aria-hidden="true">🎓</span> Training {name}
          </h2>
          <span className={styles.count} data-testid="trick-gems-left">
            💎 {sim.trickGemsLeftToday()} trick gems left today
          </span>
          <button type="button" className={common.iconButton} onClick={close} aria-label="Close">
            ✕
          </button>
        </header>

        {phase.kind === 'pick' && (
          <>
            <p className={styles.hint}>
              {full
                ? `${name} knows all ${known.length} tricks it can learn!`
                : resting
                  ? `${name} is resting. Ready in ${formatCountdown(animal.tricks.nextTrainAt - sim.now())}.`
                  : `Pick a trick. ${name} learns it after ${sessions} good sessions.`}
            </p>
            <div className={t.tricks}>
              {TRICKS.map((trick) => {
                const isKnown = known.includes(trick.id);
                const progress = animal.tricks.progress[trick.id] ?? 0;
                const blocked = sim.trainBlocker(animal.id, trick.id);
                return (
                  <button
                    key={trick.id}
                    type="button"
                    className={`${t.trick} ${isKnown ? t.known : ''}`}
                    aria-disabled={blocked !== null}
                    aria-label={`${trick.name}${isKnown ? ', learned' : `, ${progress} of ${sessions}`}`}
                    onClick={() => {
                      if (blocked)
                        setPhase({
                          kind: 'result',
                          trickId: trick.id,
                          icon: '💤',
                          text: blocked,
                          again: false,
                        });
                      else start(trick.id);
                    }}
                  >
                    <span className={t.trickIcon} aria-hidden="true">
                      {trick.icon}
                    </span>
                    <span>{trick.name}</span>
                    <span className={t.stars} aria-hidden="true">
                      {isKnown ? '✅' : '⭐'.repeat(progress) + '☆'.repeat(sessions - progress)}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {(phase.kind === 'show' || phase.kind === 'repeat') && (
          <div className={t.game}>
            <div className={t.stage}>
              <div className={`${t.pet} ${litCue ? t[`move_${litCue}`] : ''}`}>
                <PetPortrait animal={animal} size={120} />
              </div>
              <p className={t.say} role="status" aria-live="assertive" data-testid="training-say">
                {phase.kind === 'show'
                  ? litCue
                    ? `${name}: ${CUE_ICON[litCue]} ${CUE_NAME[litCue]}!`
                    : `Watch ${name}…`
                  : `Your turn! (${phase.done}/${sequence.length})`}
              </p>
            </div>
            <div
              className={t.pad}
              aria-label="Cues"
              data-sequence={phase.kind === 'repeat' ? sequence.join(',') : undefined}
            >
              {TRAINING_CUES.map((cue) => (
                <button
                  key={cue}
                  type="button"
                  className={`${t.cue} ${t[`cue_${cue}`]} ${litCue === cue ? t.lit : ''}`}
                  aria-label={CUE_NAME[cue]}
                  disabled={phase.kind !== 'repeat'}
                  onClick={() => press(cue)}
                >
                  {CUE_ICON[cue]}
                </button>
              ))}
            </div>
          </div>
        )}

        {phase.kind === 'result' && (
          <div className={t.result} role="status">
            <span className={t.resultIcon} aria-hidden="true">
              {phase.icon}
            </span>
            <p>{phase.text}</p>
            <div className={t.buttons}>
              {phase.again && (
                <button
                  type="button"
                  className={common.button}
                  onClick={() => start(phase.trickId)}
                >
                  🔁 Try again
                </button>
              )}
              <button
                type="button"
                className={`${common.button} ${phase.again ? t.secondary : ''}`}
                onClick={() => setPhase({ kind: 'pick' })}
              >
                Back to tricks
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
