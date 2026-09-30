import { useEffect, useState } from 'react';
import { appBus } from '../bridge/appBus';
import { TOASTS, type ToastMessage } from '../bridge/toasts';
import type { SimEvents } from '../sim/events';
import styles from './Toasts.module.css';
import { useSession } from './session';

const SHOW_MS = 3500;
const MAX_VISIBLE = 3;

interface Toast extends ToastMessage {
  id: number;
}

/** DESIGN 17.4 in-game toasts, from sim events and app messages. */
export function Toasts() {
  const session = useSession();
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    let nextId = 1;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const push = (message: ToastMessage | null) => {
      if (!message) return;
      const id = nextId++;
      setToasts((list) => [...list, { ...message, id }].slice(-MAX_VISIBLE));
      const timer = setTimeout(() => {
        timers.delete(timer);
        setToasts((list) => list.filter((t) => t.id !== id));
      }, SHOW_MS);
      timers.add(timer);
    };

    const offs = (Object.keys(TOASTS) as (keyof SimEvents)[]).map((event) =>
      session.sim.events.on(event, (payload) => {
        const make = TOASTS[event] as ((p: typeof payload) => ToastMessage | null) | undefined;
        push(make?.(payload) ?? null);
      }),
    );
    offs.push(appBus.on('toast', push));
    offs.push(
      session.events.on('saveFailed', () =>
        push({ icon: '💾', text: 'Saving isn’t working in this browser right now.' }),
      ),
    );
    return () => {
      offs.forEach((off) => off());
      timers.forEach(clearTimeout);
    };
  }, [session]);

  return (
    <div className={styles.stack} role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={styles.toast}>
          <span className={styles.icon} aria-hidden="true">
            {t.icon}
          </span>
          {t.text}
        </div>
      ))}
    </div>
  );
}
