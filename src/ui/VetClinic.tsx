import { useCallback, useEffect, useState } from 'react';
import { appBus } from '../bridge/appBus';
import { displayName, formatCountdown } from '../bridge/describe';
import { EXAM_TOOLS, TREATMENTS, getIllness, type ClueDef } from '../config/illnesses';
import common from './common.module.css';
import { useSim } from './session';
import { useAppEvent } from './useAppEvent';
import styles from './VetClinic.module.css';

const WRONG = 'Hmm, that didn’t work. Look at the clues again.';
const ONE_MORE = 'Great, that fixed one thing! One more to go. Look for new clues.';

/**
 * Vet Clinic panel (DESIGN 9.5, 17.1): the clue notebook and the treatment cabinet, next to
 * the clinic scene where the exam tools are.
 */
export function VetClinic() {
  const { sim } = useSim();
  const [animalId, setAnimalId] = useState<string | null>(null);
  const [clues, setClues] = useState<Record<string, readonly ClueDef[]>>({});
  const [message, setMessage] = useState<{ text: string; good?: boolean } | null>(null);
  const [curedName, setCuredName] = useState<string | null>(null);

  useAppEvent(
    'openVet',
    useCallback(({ animalId: id }) => {
      setAnimalId(id);
      setClues({});
      setMessage(null);
      setCuredName(null);
    }, []),
  );
  useAppEvent(
    'closeVet',
    useCallback(() => setAnimalId(null), []),
  );
  useAppEvent(
    'vetExamined',
    useCallback(({ toolId, result }) => {
      if (result.ok) {
        setClues((c) => ({ ...c, [toolId]: result.clues }));
        setMessage(null);
      } else {
        setMessage({ text: result.reason });
      }
    }, []),
  );

  const animal = animalId ? sim.getAnimal(animalId) : undefined;

  // Gone (can't really happen while sick, but never leave a dead screen up).
  useEffect(() => {
    if (animalId && !animal) appBus.emit('closeVet', undefined);
  }, [animalId, animal]);

  if (!animalId || !animal) return null;

  const name = displayName(animal);
  const leave = () => appBus.emit('closeVet', undefined);

  if (curedName !== null || !animal.sickness) {
    return (
      <aside className={`${common.panel} ${styles.panel} ${styles.cured}`} aria-label="Vet Clinic">
        <p className={styles.bigIcon} aria-hidden="true">
          💖
        </p>
        <h2 className={styles.title}>{curedName ?? name} is all better!</h2>
        <p className={styles.note}>Healthy, happy, and ready for the yard.</p>
        <button type="button" className={common.button} onClick={leave}>
          <span aria-hidden="true">🏡</span> Back to the yard
        </button>
      </aside>
    );
  }

  const illness = getIllness(animal.sickness.illnessId);
  const second = animal.sickness.secondIllnessId
    ? getIllness(animal.sickness.secondIllnessId)
    : undefined;
  const free = animal.sickness.visit === 'free';
  const until = animal.sickness.atClinicUntil;
  const waiting = until !== undefined;
  const cost = sim.treatmentCost(animal.id) ?? 0;
  const found = EXAM_TOOLS.filter((t) => clues[t.id]);

  const treat = (treatmentId: string) => {
    const result = sim.vetTreat(animal.id, treatmentId);
    if (!result.ok) setMessage({ text: result.reason });
    else if (result.cured) setCuredName(name);
    else if (result.helped) {
      // Half of a tricky case: a fresh notebook for the one that's left.
      setClues({});
      setMessage({ text: ONE_MORE, good: true });
    } else setMessage({ text: WRONG });
  };

  return (
    <aside className={`${common.panel} ${styles.panel}`} aria-label="Vet Clinic">
      <header className={styles.header}>
        <button
          type="button"
          className={common.iconButton}
          onClick={leave}
          aria-label="Back to the yard"
        >
          ←
        </button>
        <div>
          <h2 className={styles.title}>
            <span aria-hidden="true">🏥</span> Vet Clinic
          </h2>
          <p className={styles.patient}>
            {name}: <span aria-hidden="true">{illness?.symptomIcon}</span> {illness?.symptoms}
            {second && (
              <>
                {' '}
                and <span aria-hidden="true">{second.symptomIcon}</span> {second.symptoms}
              </>
            )}
          </p>
        </div>
      </header>
      {second && (
        <p className={styles.tricky} data-testid="tricky-case">
          <span aria-hidden="true">🔍</span> Tricky case! Two things are wrong. Find both
          treatments.
        </p>
      )}
      <p className={styles.visit} data-testid="visit-type">
        {free ? '🏥 Free Clinic: treatments are free' : '✅ Visit paid'}
      </p>

      {waiting ? (
        <div className={styles.waiting} role="status" data-testid="clinic-waiting">
          <span className={styles.bigIcon} aria-hidden="true">
            ⏳
          </span>
          <p>
            Waiting room. The vet will see {name} in{' '}
            <strong>{formatCountdown(until - sim.now())}</strong>
          </p>
          <p className={styles.note}>You can go back to the yard and come back later.</p>
        </div>
      ) : (
        <>
          <section className={styles.section} aria-label="Clues">
            <h3 className={styles.heading}>
              <span aria-hidden="true">📒</span> Clues
            </h3>
            {found.length === 0 ? (
              <p className={styles.note}>Tap a tool, or drag it onto {name}, to look for clues!</p>
            ) : (
              <ul className={styles.clues}>
                {found.map((tool) =>
                  clues[tool.id]!.map((clue) => (
                    <li key={`${tool.id}:${clue.text}`}>
                      <span aria-hidden="true" className={styles.clueTool}>
                        {tool.icon}
                      </span>
                      <span aria-hidden="true">{clue.icon}</span> {clue.text}
                    </li>
                  )),
                )}
              </ul>
            )}
          </section>

          <section className={styles.section} aria-label="Medicine cabinet">
            <h3 className={styles.heading}>
              <span aria-hidden="true">🧰</span> Pick a treatment{' '}
              <span className={styles.cost}>{cost === 0 ? 'Free' : `${cost} coins each`}</span>
            </h3>
            <div className={styles.cabinet}>
              {TREATMENTS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={styles.treatment}
                  onClick={() => treat(t.id)}
                >
                  <span className={styles.treatmentIcon} aria-hidden="true">
                    {t.icon}
                  </span>
                  {t.name}
                </button>
              ))}
            </div>
          </section>
        </>
      )}

      {message && (
        <p className={`${styles.message} ${message.good ? styles.good : ''}`} role="status">
          {message.text}
        </p>
      )}
    </aside>
  );
}
