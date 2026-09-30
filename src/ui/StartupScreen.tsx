import styles from './StartupScreen.module.css';
import common from './common.module.css';

/** Shown while the save loads, or if it can't be loaded. */
export function StartupScreen({ error }: { error?: boolean }) {
  return (
    <div className={styles.screen}>
      {error ? (
        <div className={`${common.panel} ${styles.box}`} role="alert">
          <p className={styles.big} aria-hidden="true">
            🐾
          </p>
          <p>Oops! We couldn’t open your meadow.</p>
          <button type="button" className={common.button} onClick={() => location.reload()}>
            <span aria-hidden="true">🔄</span> Try again
          </button>
        </div>
      ) : (
        <p className={styles.big} aria-label="Loading">
          🌼
        </p>
      )}
    </div>
  );
}
