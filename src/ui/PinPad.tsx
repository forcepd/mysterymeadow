import { useState } from 'react';
import { BALANCE } from '../config/balance';
import styles from './PinPad.module.css';

/**
 * A big-button PIN pad (DESIGN 20). `onSubmit` gets the digits once they're all entered and
 * returns an error to show (the pad clears), or null when it's accepted.
 */
export function PinPad({
  title,
  hint,
  onSubmit,
  onCancel,
  onForgot,
}: {
  title: string;
  hint?: string;
  onSubmit: (pin: string) => string | null | Promise<string | null>;
  onCancel?: () => void;
  onForgot?: () => void;
}) {
  const [digits, setDigits] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const length = BALANCE.pin.digits;

  const press = async (d: string) => {
    if (busy || digits.length >= length) return;
    const next = digits + d;
    setDigits(next);
    setError(null);
    if (next.length < length) return;
    setBusy(true);
    const result = await onSubmit(next);
    setBusy(false);
    if (result) {
      setError(result);
      setDigits('');
    }
  };

  return (
    <div className={styles.pad} role="group" aria-label={title}>
      <p className={styles.title}>{title}</p>
      {hint && <p className={styles.hint}>{hint}</p>}
      <div className={styles.dots} aria-label={`${digits.length} of ${length} digits`}>
        {Array.from({ length }, (_, i) => (
          <span key={i} className={i < digits.length ? styles.dotOn : styles.dot} />
        ))}
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.keys}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} type="button" className={styles.key} onClick={() => void press(d)}>
            {d}
          </button>
        ))}
        {onCancel ? (
          <button type="button" className={styles.keySmall} onClick={onCancel}>
            Cancel
          </button>
        ) : (
          <span />
        )}
        <button type="button" className={styles.key} onClick={() => void press('0')}>
          0
        </button>
        <button
          type="button"
          className={styles.keySmall}
          aria-label="Delete"
          onClick={() => setDigits((d) => d.slice(0, -1))}
        >
          ⌫
        </button>
      </div>
      {onForgot && (
        <button type="button" className={styles.forgot} onClick={onForgot}>
          Forgot PIN?
        </button>
      )}
    </div>
  );
}
