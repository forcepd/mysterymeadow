import { useCallback, useState } from 'react';
import { appBus } from '../bridge/appBus';
import { rewardText } from '../bridge/rewards';
import { ALL_GOALS_REWARD, GOALS } from '../config/goals';
import common from './common.module.css';
import g from './GoalsScreen.module.css';
import styles from './Screens.module.css';
import { useSim } from './session';
import { useAppEvent } from './useAppEvent';

/** Starter goals ("Meadow Goals"): what to try next, and a little reward for each. */
export function GoalsScreen() {
  const { sim } = useSim();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useAppEvent(
    'openScreen',
    useCallback(({ screen }) => {
      setOpen(screen === 'goals');
      setMessage(null);
    }, []),
  );
  if (!open) return null;
  const close = () => appBus.emit('openScreen', { screen: null });
  const { progress, claimed } = sim.state.world.goals;
  const done = claimed.length;

  const collect = (goalId: string) => {
    const r = sim.claimGoal(goalId);
    setMessage(r.ok ? null : r.reason);
  };

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label="Goals">
      <div className={`${common.panel} ${styles.screen} ${g.screen}`}>
        <header className={styles.header}>
          <div>
            <h2 className={styles.title}>
              <span aria-hidden="true">🎯</span> Meadow Goals
            </h2>
            <p className={styles.note} data-testid="goals-progress">
              {done}/{GOALS.length} done · Finish them all for {rewardText(ALL_GOALS_REWARD)}
            </p>
          </div>
          <button type="button" className={common.iconButton} onClick={close} aria-label="Close">
            ✕
          </button>
        </header>
        <ul className={g.list}>
          {GOALS.map((goal) => {
            const count = Math.min(progress[goal.id] ?? 0, goal.target);
            const isClaimed = claimed.includes(goal.id);
            const ready = !isClaimed && count >= goal.target;
            return (
              <li
                key={goal.id}
                className={`${g.goal} ${isClaimed ? g.claimed : ''} ${ready ? g.ready : ''}`}
                aria-label={goal.text}
              >
                <span className={g.icon} aria-hidden="true">
                  {isClaimed ? '✅' : goal.icon}
                </span>
                <div className={g.body}>
                  <span className={g.text}>{goal.text}</span>
                  <span className={g.bar} aria-hidden="true">
                    <span style={{ width: `${(count / goal.target) * 100}%` }} />
                  </span>
                  <span className={g.count}>
                    {count}/{goal.target} · {rewardText(goal.reward)}
                  </span>
                </div>
                {ready && (
                  <button type="button" className={common.button} onClick={() => collect(goal.id)}>
                    <span aria-hidden="true">🎁</span> Collect
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        {message && (
          <p className={styles.note} role="status">
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
