import { useEffect, useState } from 'react';
import type { AwayCard as AwayCardData } from '../bridge/away';
import common from './common.module.css';
import styles from './AwayCard.module.css';
import { useSession } from './session';

/** "While you were away…" (DESIGN 14, 17.1 #15): good news from the time away. */
export function AwayCard() {
  const session = useSession();
  const [card, setCard] = useState<AwayCardData | null>(session.away);
  useEffect(() => session.events.on('awayChanged', ({ card: next }) => setCard(next)), [session]);
  if (!card) return null;
  const close = () => session.dismissAway();
  return (
    <div className={styles.backdrop} onClick={close}>
      <section
        className={`${common.panel} ${styles.card}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="away-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="away-title" className={styles.title}>
          <span aria-hidden="true">🌈</span> While you were away…
        </h2>
        <p className={styles.time}>You were gone {card.away}.</p>
        <ul className={styles.lines}>
          {card.lines.map((line) => (
            <li key={line.text}>
              <span className={styles.icon} aria-hidden="true">
                {line.icon}
              </span>
              {line.text}
            </li>
          ))}
        </ul>
        <button type="button" className={common.button} onClick={close} autoFocus>
          <span aria-hidden="true">▶️</span> Let’s play!
        </button>
      </section>
    </div>
  );
}
