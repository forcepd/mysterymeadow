import { useEffect, useState } from 'react';
import { appBus } from '../bridge/appBus';
import { displayName, inMinutes } from '../bridge/describe';
import common from './common.module.css';
import { useSim } from './session';
import styles from './TutorialCoach.module.css';

/**
 * The onboarding tutorial (DESIGN 5 step 4): a coach bubble that follows real play. The first
 * visitor arrives right away; the kid reveals it, fills the (empty) bowl so it eats, cleans its
 * poop, and opens its card to see the 20-minute "Ready to sell" countdown. Skippable (your
 * choice). The step is saved with the profile, so a reload picks up where it left off.
 */
export function TutorialCoach() {
  const session = useSim();
  const { sim } = session;
  const step = session.profile.tutorial;
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    if (session.profile.tutorial === 'done') return;
    const first = () => sim.state.world.animals[0];
    // Picked up after a reload with the visitor already in: carry on from "feed".
    if (session.profile.tutorial === 'reveal' && first()) {
      sim.tutorialNudge(first()!.id);
      session.setTutorial('feed');
    }
    const offs = [
      sim.events.on('visitorEntered', ({ animal }) => {
        if (session.profile.tutorial !== 'reveal') return;
        sim.tutorialNudge(animal.id);
        session.setTutorial('feed');
      }),
      sim.events.on('animalAte', () => {
        if (session.profile.tutorial === 'feed') session.setTutorial('poop');
      }),
      sim.events.on('poopCleaned', () => {
        if (session.profile.tutorial === 'poop') session.setTutorial('card');
      }),
      appBus.on('selectAnimal', ({ id }) => {
        if (id && session.profile.tutorial === 'card') setFinished(true);
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [session, sim]);

  if (step === 'done') return null;

  const animal = sim.state.world.animals[0];
  const name = animal ? displayName(animal) : 'your visitor';
  const hasPoop = sim.state.world.poops.length > 0;
  const done = () => session.setTutorial('done');

  let icon: string;
  let text: string;
  if (finished) {
    icon = '🎉';
    text =
      'Great job! Keep your animals fed, happy, and clean. When the timer is done, sell them to a loving home and see who visits next!';
  } else if (step === 'reveal') {
    icon = '❓';
    text = 'A mystery visitor is at the gate! Tap it to see who it is.';
  } else if (step === 'feed') {
    icon = '🥣';
    text = `${name} is hungry! Tap the food bowl to fill it up.`;
  } else if (step === 'poop') {
    icon = hasPoop ? '✨' : '👀';
    text = hasPoop
      ? `Oops! ${name} made a mess. Tap the poop to clean it up.`
      : `Yum! Keep an eye on ${name}…`;
  } else {
    icon = '👆';
    // The real wait (new players' first animals are ready sooner, BALANCE.welcome).
    const wait = animal ? inMinutes(animal.holdUntil - sim.now()) : 'Soon';
    text = `Tap ${name} to see its card. ${wait} it’s ready for a new home!`;
  }

  return (
    <aside
      className={`${common.panel} ${styles.coach}`}
      aria-label="Tutorial"
      data-step={finished ? 'finished' : step}
    >
      <span className={styles.icon} aria-hidden="true">
        {icon}
      </span>
      <p className={styles.text} role="status">
        {text}
      </p>
      {finished ? (
        <button type="button" className={common.button} onClick={done}>
          Let’s play!
        </button>
      ) : (
        <button type="button" className={styles.skip} onClick={done}>
          Skip tutorial
        </button>
      )}
    </aside>
  );
}
