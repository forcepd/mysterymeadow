import { useState } from 'react';
import { HOUSE_COLORS, DEFAULT_HOUSE_COLOR } from '../../config/houseColors';
import { DEFAULT_LOADOUT, type AvatarLoadout } from '../../profile/avatar';
import { checkUsername } from '../../profile/username';
import { AvatarStudio } from '../AvatarStudio';
import common from '../common.module.css';
import styles from './Root.module.css';

export interface NewPlayer {
  username: string;
  avatar: AvatarLoadout;
  houseColor: string;
}

/** DESIGN 5 steps 1-3: username, avatar (starter set), house color. The tutorial follows. */
export function Onboarding({
  takenNames,
  onDone,
  onCancel,
}: {
  takenNames: readonly string[];
  onDone: (player: NewPlayer) => void;
  onCancel?: () => void;
}) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<AvatarLoadout>(DEFAULT_LOADOUT);
  const [teaser, setTeaser] = useState(false);
  const [color, setColor] = useState(DEFAULT_HOUSE_COLOR);
  const houseHex = HOUSE_COLORS.find((c) => c.id === color)?.color ?? '#f6d77a';

  const next = () => {
    if (step === 0) {
      const check = checkUsername(name, takenNames);
      if (!check.ok) {
        setNameError(check.reason);
        return;
      }
      setName(check.name);
    }
    if (step < 2) setStep(step + 1);
    else onDone({ username: name.trim(), avatar, houseColor: color });
  };

  return (
    <div className={`${common.panel} ${styles.box}`}>
      <div className={styles.steps} aria-label={`Step ${step + 1} of 3`}>
        {[0, 1, 2].map((i) => (
          <span key={i} className={i <= step ? styles.stepOn : styles.step} />
        ))}
      </div>

      {step === 0 && (
        <form
          className={styles.box}
          onSubmit={(e) => {
            e.preventDefault();
            next();
          }}
        >
          <h1 className={styles.title}>What should we call you?</h1>
          <p className={styles.hint}>Pick a fun nickname (not your real name).</p>
          <input
            className={styles.nameInput}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameError(null);
            }}
            maxLength={16}
            aria-label="Nickname"
            placeholder="Sunny_Fox"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            autoFocus
            enterKeyHint="next"
          />
          {nameError && (
            <p className={styles.error} role="alert">
              {nameError}
            </p>
          )}
          <p className={styles.hint}>3 to 16 letters, numbers, or _</p>
        </form>
      )}

      {step === 1 && (
        <>
          <h1 className={styles.title}>Make your look!</h1>
          <AvatarStudio
            mode="create"
            loadout={avatar}
            owned={[]}
            onChange={setAvatar}
            onLocked={() => setTeaser(true)}
          />
          {teaser && (
            <p className={styles.teaser} role="status">
              💎 More styles in the Boutique! You can shop there later.
            </p>
          )}
        </>
      )}

      {step === 2 && (
        <>
          <h1 className={styles.title}>Pick your house color</h1>
          <CottagePreview color={houseHex} />
          <div className={styles.colors} role="radiogroup" aria-label="House colors">
            {HOUSE_COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={c.id === color}
                aria-label={c.name}
                className={`${styles.swatch} ${c.id === color ? styles.swatchOn : ''}`}
                style={{ background: c.color }}
                onClick={() => setColor(c.id)}
              />
            ))}
          </div>
        </>
      )}

      <div className={styles.buttons}>
        {step > 0 ? (
          <button
            type="button"
            className={`${common.button} ${styles.secondary}`}
            onClick={() => setStep(step - 1)}
          >
            ← Back
          </button>
        ) : (
          onCancel && (
            <button
              type="button"
              className={`${common.button} ${styles.secondary}`}
              onClick={onCancel}
            >
              ← Back
            </button>
          )
        )}
        <button type="button" className={common.button} onClick={next}>
          {step < 2 ? 'Next →' : '🏡 Let’s go!'}
        </button>
      </div>
    </div>
  );
}

/** A little live preview of the starter cottage in the chosen color (DESIGN 5 step 3). */
function CottagePreview({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 220 160" width="260" height="190" aria-label="Your cottage" role="img">
      <rect x="0" y="130" width="220" height="30" rx="10" fill="#9fd98a" />
      <rect x="130" y="20" width="22" height="40" fill="#a9544a" />
      <rect
        x="40"
        y="70"
        width="140"
        height="70"
        rx="8"
        fill={color}
        stroke="#4a3b33"
        strokeWidth="4"
      />
      <polygon points="25,74 110,18 195,74" fill="#d9776a" stroke="#a9544a" strokeWidth="4" />
      <rect
        x="93"
        y="92"
        width="34"
        height="48"
        rx="14"
        fill="#9b6a45"
        stroke="#4a3b33"
        strokeWidth="3"
      />
      <rect
        x="54"
        y="88"
        width="28"
        height="24"
        rx="4"
        fill="#bfe3f5"
        stroke="#4a3b33"
        strokeWidth="3"
      />
      <rect
        x="138"
        y="88"
        width="28"
        height="24"
        rx="4"
        fill="#bfe3f5"
        stroke="#4a3b33"
        strokeWidth="3"
      />
    </svg>
  );
}
