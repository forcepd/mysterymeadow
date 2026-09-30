import { useState } from 'react';
import { checkPin, makePin, numberInWords } from '../profile/pin';
import common from './common.module.css';
import { PinPad } from './PinPad';
import { newSalt, useDevice } from './root/device';
import { PinSetup } from './root/PinSetup';
import styles from './PinGate.module.css';

/**
 * "Ask a grown-up!" (DESIGN 20): the Parent PIN pad in front of grown-up things. "Forgot PIN?"
 * asks for a number written in words (your choice), then lets them set a new PIN.
 */
export function PinGate({
  title,
  onUnlock,
  onCancel,
}: {
  title: string;
  onUnlock: () => void;
  onCancel: () => void;
}) {
  const device = useDevice();
  const [mode, setMode] = useState<'pin' | 'forgot' | 'newPin'>('pin');
  const [challenge] = useState(() => 1000 + Math.floor(Math.random() * 98_000));
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (mode === 'newPin') {
    return (
      <PinSetup
        title="Pick a new Parent PIN"
        onCancel={onCancel}
        onDone={async (pin) => {
          await device.update((r) => (r.pin = makePin(pin, newSalt())));
          onUnlock();
        }}
      />
    );
  }

  if (mode === 'forgot') {
    return (
      <form
        className={styles.forgot}
        onSubmit={(e) => {
          e.preventDefault();
          if (Number(answer.replace(/[^\d]/g, '')) === challenge) setMode('newPin');
          else setError('That’s not it. Try again!');
        }}
      >
        <p className={styles.title}>Grown-up check</p>
        <p>Type this number using digits:</p>
        <p className={styles.words} data-testid="pin-challenge">
          {numberInWords(challenge)}
        </p>
        <input
          className={styles.input}
          inputMode="numeric"
          value={answer}
          onChange={(e) => {
            setAnswer(e.target.value);
            setError(null);
          }}
          aria-label="The number in digits"
          autoComplete="off"
        />
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.buttons}>
          <button
            type="button"
            className={`${common.button} ${styles.secondary}`}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button type="submit" className={common.button}>
            Check
          </button>
        </div>
      </form>
    );
  }

  return (
    <PinPad
      title={title}
      hint="Ask a grown-up to type the Parent PIN."
      onCancel={onCancel}
      onForgot={() => setMode('forgot')}
      onSubmit={(pin) => {
        if (!checkPin(device.record.pin, pin)) return 'That’s not the PIN.';
        onUnlock();
        return null;
      }}
    />
  );
}
