import { useEffect, useState } from 'react';
import { BIRTHDAY } from '../config/birthday';
import { AvatarView } from './AvatarView';
import common from './common.module.css';
import styles from './AwayCard.module.css';
import b from './BirthdayGreeting.module.css';
import { useSim } from './session';

/**
 * The birthday card: on the birthday's first play, after the tutorial and the "While you were
 * away" card (and before the daily present). Shows the avatar in today's birthday hat.
 */
export function BirthdayGreeting() {
  const session = useSim();
  const { sim } = session;
  const [awayOpen, setAwayOpen] = useState(session.away !== null);
  useEffect(
    () => session.events.on('awayChanged', ({ card }) => setAwayOpen(card !== null)),
    [session],
  );

  const ready = sim.birthdayGreetingReady() && session.profile.tutorial === 'done' && !awayOpen;
  if (!ready) return null;

  return (
    <div className={styles.backdrop}>
      <section
        className={`${common.panel} ${styles.card}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="birthday-title"
        data-testid="birthday-card"
      >
        <p className={b.confetti} aria-hidden="true">
          🎈🎂🎉
        </p>
        <h2 id="birthday-title" className={b.title}>
          Happy Birthday {BIRTHDAY.name}!
        </h2>
        <AvatarView loadout={session.shownAvatar} height={180} className={b.avatar} />
        <p className={styles.time}>You get a special birthday hat to wear all day! 🥳</p>
        <button
          type="button"
          className={common.button}
          onClick={() => sim.seeBirthdayGreeting()}
          autoFocus
        >
          <span aria-hidden="true">💖</span> Thank you!
        </button>
      </section>
    </div>
  );
}
