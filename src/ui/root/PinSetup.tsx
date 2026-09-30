import { useState } from 'react';
import common from '../common.module.css';
import { PinPad } from '../PinPad';
import styles from './Root.module.css';

/** First run on a device (DESIGN 20): a grown-up picks the Parent PIN (typed twice). */
export function PinSetup({
  onDone,
  onCancel,
  title = 'Hi, grown-up! 👋',
}: {
  onDone: (pin: string) => void | Promise<void>;
  onCancel?: () => void;
  title?: string;
}) {
  const [first, setFirst] = useState<string | null>(null);
  return (
    <div className={`${common.panel} ${styles.box}`}>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.text}>
        Pick a 4-digit <strong>Parent PIN</strong>. You’ll need it to give gems, change settings,
        and manage players. Keep it secret from little ones!
      </p>
      {first === null ? (
        <PinPad
          key="first"
          title="Choose a PIN"
          onSubmit={(pin) => {
            setFirst(pin);
            return null;
          }}
          {...(onCancel ? { onCancel } : {})}
        />
      ) : (
        <PinPad
          key="again"
          title="Type it again"
          onSubmit={async (pin) => {
            if (pin !== first) {
              setFirst(null);
              return 'Those didn’t match. Let’s start again.';
            }
            await onDone(pin);
            return null;
          }}
          onCancel={() => setFirst(null)}
        />
      )}
    </div>
  );
}
