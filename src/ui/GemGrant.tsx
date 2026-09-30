import { useState } from 'react';
import { BALANCE } from '../config/balance';
import common from './common.module.css';
import styles from './GemGrant.module.css';
import { useSim } from './session';

/** Parent Mode gem grants (DESIGN 20): preset packs or a custom amount. */
export function GemGrant({ onGranted }: { onGranted?: (amount: number) => void }) {
  const { sim } = useSim();
  const [custom, setCustom] = useState('');
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const grant = (amount: number) => {
    const result = sim.grantGems(amount);
    setMessage(
      result.ok ? { text: `💎 +${amount} gems!`, ok: true } : { text: result.reason, ok: false },
    );
    if (result.ok) onGranted?.(amount);
  };

  return (
    <div className={styles.grant}>
      <div className={styles.row}>
        {BALANCE.gems.grantPresets.map((n) => (
          <button key={n} type="button" className={common.button} onClick={() => grant(n)}>
            💎 {n}
          </button>
        ))}
      </div>
      <form
        className={styles.row}
        onSubmit={(e) => {
          e.preventDefault();
          grant(Number(custom));
        }}
      >
        <input
          className={styles.input}
          inputMode="numeric"
          value={custom}
          onChange={(e) => setCustom(e.target.value.replace(/[^\d]/g, ''))}
          aria-label="Custom gem amount"
          placeholder={`1–${BALANCE.gems.maxGrant}`}
        />
        <button type="submit" className={`${common.button} ${styles.secondary}`}>
          Give
        </button>
      </form>
      {message && (
        <p className={message.ok ? styles.ok : styles.error} role="status">
          {message.text}
        </p>
      )}
    </div>
  );
}
