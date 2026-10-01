import { useEffect, useState } from 'react';
import { rewardText } from '../bridge/rewards';
import type { DailyGiftReward } from '../sim/systems/dailyGift';
import common from './common.module.css';
import styles from './AwayCard.module.css';
import d from './DailyGift.module.css';
import { useSim } from './session';

/**
 * A present on the first play of each day (early-game pass). Waits for the tutorial and the
 * "While you were away" card (and the birthday card, on the birthday), then asks to be opened.
 */
export function DailyGift() {
  const session = useSim();
  const { sim } = session;
  const [opened, setOpened] = useState<DailyGiftReward | null>(null);
  const [awayOpen, setAwayOpen] = useState(session.away !== null);
  useEffect(
    () => session.events.on('awayChanged', ({ card }) => setAwayOpen(card !== null)),
    [session],
  );

  // On the birthday, the birthday card comes first.
  const ready =
    sim.dailyGiftReady() &&
    !sim.birthdayGreetingReady() &&
    session.profile.tutorial === 'done' &&
    !awayOpen;
  if (!opened && !ready) return null;

  const open = () => {
    const r = sim.openDailyGift();
    if (r.ok) setOpened(r.reward);
  };

  return (
    <div className={styles.backdrop}>
      <section
        className={`${common.panel} ${styles.card}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="gift-title"
      >
        {opened ? (
          <>
            <h2 id="gift-title" className={styles.title}>
              <span aria-hidden="true">🎉</span> For you!
            </h2>
            <p className={d.reward} data-testid="gift-reward">
              {rewardText(opened)}
            </p>
            {opened.itemId && (
              <p className={styles.time}>It’s waiting in 🛠 Decorate, ready to put in the yard.</p>
            )}
            <button
              type="button"
              className={common.button}
              onClick={() => setOpened(null)}
              autoFocus
            >
              <span aria-hidden="true">💖</span> Yay!
            </button>
          </>
        ) : (
          <>
            <h2 id="gift-title" className={styles.title}>
              A present for today!
            </h2>
            <button
              type="button"
              className={d.box}
              onClick={open}
              aria-label="Open the present"
              autoFocus
            >
              <span aria-hidden="true">🎁</span>
            </button>
            <p className={styles.time}>Tap to open it</p>
          </>
        )}
      </section>
    </div>
  );
}
