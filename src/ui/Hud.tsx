import { useCallback, useState } from 'react';
import { appBus } from '../bridge/appBus';
import { formatCountdown } from '../bridge/describe';
import { GOALS } from '../config/goals';
import { AvatarView } from './AvatarView';
import common from './common.module.css';
import styles from './Hud.module.css';
import { useSim } from './session';
import { useAppEvent } from './useAppEvent';

/**
 * DESIGN 17.2 HUD (through Phase 8): the avatar (My style), coins, gems, Pet Slots, capacity,
 * visitors, Settings, and the menu: Yard/House, Pets, Dex, Home Store, Real Estate, Decorate.
 */
export function Hud() {
  const { sim, profile, shownAvatar } = useSim();
  const [zone, setZone] = useState<'yard' | 'house'>('yard');
  const [decorating, setDecorating] = useState(false);
  const [inVet, setInVet] = useState(false);
  // The menu and ⚙️ step aside while decorating (the tray takes the bottom) and in the Vet
  // Clinic (the exam tools sit along the bottom).
  const hideMenu = decorating || inVet;
  useAppEvent(
    'sceneChanged',
    useCallback(({ scene }) => {
      setInVet(scene === 'vet');
      if (scene !== 'vet') setZone(scene);
    }, []),
  );
  useAppEvent(
    'decorate',
    useCallback(({ on }) => setDecorating(on), []),
  );
  const { coins, gems, gateQueue } = sim.state.world;
  const count = sim.animalCount();
  const capacity = sim.capacity();
  const crowded = sim.isCrowded();
  const waiting = gateQueue.some((v) => !v.revealed);
  const slots = sim.petSlots();
  const indoor = sim.indoorSlots();
  // Starter goals: after the tutorial, until every one is collected.
  const goalsReady = sim.readyGoalCount();
  const showGoals =
    profile.tutorial === 'done' && sim.state.world.goals.claimed.length < GOALS.length;

  let visitorText: string;
  if (crowded) visitorText = 'Too crowded for visitors';
  else if (waiting) visitorText = 'A visitor is at the gate!';
  else visitorText = `Next visitor in ${formatCountdown(sim.msUntilNextVisitor())}`;

  return (
    <div className={styles.overlay}>
      <div className={styles.topLeft}>
        <button
          type="button"
          className={styles.me}
          aria-label={`${profile.username}: my style`}
          onClick={() => appBus.emit('openScreen', { screen: 'style' })}
        >
          <AvatarView loadout={shownAvatar} height={120} className={styles.meFace} />
        </button>
        <div className={common.pill} aria-label={`${coins} coins`} data-testid="coins">
          <span className={`${styles.icon} ${styles.coin}`} aria-hidden="true" />
          {coins}
        </div>
        <div className={common.pill} aria-label={`${gems} gems`} data-testid="gems">
          <span className={`${styles.icon} ${styles.gem}`} aria-hidden="true" />
          {gems}
        </div>
        <div
          className={common.pill}
          aria-label={`${slots.used} of ${slots.total} Pet Slots in use`}
          data-testid="pet-slots"
        >
          <span className={`${styles.emoji} ${styles.heart}`} aria-hidden="true">
            ♥
          </span>
          {slots.used}/{slots.total}
        </div>
        {showGoals && (
          <button
            type="button"
            className={`${common.pill} ${goalsReady > 0 ? styles.goalsReady : ''}`}
            aria-label={goalsReady > 0 ? `Goals: ${goalsReady} ready to collect` : 'Goals'}
            data-testid="goals-button"
            onClick={() => appBus.emit('openScreen', { screen: 'goals' })}
          >
            <span className={styles.emoji} aria-hidden="true">
              🎯
            </span>
            Goals
            {goalsReady > 0 && (
              <span className={styles.badge} aria-hidden="true">
                {goalsReady}
              </span>
            )}
          </button>
        )}
      </div>

      <nav className={styles.nav} aria-label="Menu" hidden={hideMenu}>
        <button
          type="button"
          className={`${common.pill} ${styles.zone}`}
          onClick={() => appBus.emit('showZone', { zone: zone === 'yard' ? 'house' : 'yard' })}
        >
          <span className={styles.emoji} aria-hidden="true">
            {zone === 'yard' ? '🏠' : '🌳'}
          </span>
          {zone === 'yard' ? 'House' : 'Yard'}
          <span className={styles.beds} data-testid="indoor-count">
            🛏️ {indoor.used}/{indoor.total}
          </span>
        </button>
        <button
          type="button"
          className={common.pill}
          onClick={() => appBus.emit('openScreen', { screen: 'pets' })}
        >
          <span className={styles.emoji} aria-hidden="true">
            🐾
          </span>
          Pets
        </button>
        <button
          type="button"
          className={common.pill}
          onClick={() => appBus.emit('openScreen', { screen: 'dex' })}
        >
          <span className={styles.emoji} aria-hidden="true">
            📖
          </span>
          Dex
        </button>
        <button
          type="button"
          className={common.pill}
          onClick={() => appBus.emit('openScreen', { screen: 'store' })}
        >
          <span className={styles.emoji} aria-hidden="true">
            🛒
          </span>
          Store
        </button>
        <button
          type="button"
          className={common.pill}
          onClick={() => appBus.emit('openScreen', { screen: 'realEstate' })}
        >
          <span className={styles.emoji} aria-hidden="true">
            🏡
          </span>
          Real Estate
        </button>
        <button
          type="button"
          className={common.pill}
          onClick={() => {
            appBus.emit('selectAnimal', { id: null });
            appBus.emit('decorate', { on: true });
          }}
        >
          <span className={styles.emoji} aria-hidden="true">
            🛠
          </span>
          Decorate
        </button>
      </nav>

      <div className={styles.topRight}>
        <div className={`${common.pill} ${styles.timer}`} data-testid="next-visitor">
          <span className={styles.emoji} aria-hidden="true">
            {crowded ? '🐾' : waiting ? '❓' : '⏰'}
          </span>
          {visitorText}
        </div>
        <div
          className={`${common.pill} ${crowded ? styles.crowded : ''}`}
          aria-label={`${count} of ${capacity} animals${crowded ? ', crowded' : ''}`}
          data-testid="capacity"
        >
          <span className={styles.emoji} aria-hidden="true">
            🐾
          </span>
          {count}/{capacity}
        </div>
      </div>

      <button
        type="button"
        className={`${common.iconButton} ${styles.gear}`}
        aria-label="Settings"
        hidden={hideMenu}
        onClick={() => appBus.emit('openScreen', { screen: 'settings' })}
      >
        ⚙️
      </button>

      <a className={`${common.link} ${styles.privacy}`} href="./privacy.html">
        Privacy
      </a>
    </div>
  );
}
