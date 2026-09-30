import type { ProfileSummary } from '../../save/device';
import { AvatarView } from '../AvatarView';
import common from '../common.module.css';
import styles from './Root.module.css';

/** DESIGN 17.1 #1: who's playing? */
export function ProfilePicker({
  profiles,
  onPick,
  onNew,
}: {
  profiles: readonly ProfileSummary[];
  onPick: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <div className={`${common.panel} ${styles.box}`}>
      <h1 className={styles.title}>🌼 Mystery Meadow 3D</h1>
      <p className={styles.text}>Who’s playing?</p>
      <div className={styles.profiles}>
        {profiles.map((p) => (
          <button
            key={p.id}
            type="button"
            className={styles.profile}
            onClick={() => onPick(p.id)}
            aria-label={`Play as ${p.username}`}
          >
            <AvatarView loadout={p.avatar} height={130} />
            {p.username}
          </button>
        ))}
        <button type="button" className={`${styles.profile} ${styles.newProfile}`} onClick={onNew}>
          <span className={styles.plus} aria-hidden="true">
            ➕
          </span>
          New player
        </button>
      </div>
    </div>
  );
}
