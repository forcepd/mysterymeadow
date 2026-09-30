import styles from './RotateScreen.module.css';

/** Shown only in portrait (pure CSS), covering the game until the device is turned sideways. */
export function RotateScreen() {
  return (
    <div className={styles.screen} role="alert" data-testid="rotate-screen">
      <div className={styles.device} aria-hidden="true" />
      <p className={styles.text}>Turn your screen sideways to play!</p>
    </div>
  );
}
