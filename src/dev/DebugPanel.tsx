import { useState } from 'react';
import { ILLNESSES } from '../config/illnesses';
import { SPECIES } from '../config/species';
import {
  debugAddCoins,
  debugAddGems,
  debugCureAll,
  debugGiveItems,
  debugMakeSick,
  debugRunOnline,
  debugSetNeeds,
  debugSetSicknessEnabled,
  debugSpawnVisitor,
  type DebugVisitorOptions,
} from '../sim/debugCommands';
import { RARITIES, type Rarity } from '../sim/types';
import { useSim } from '../ui/session';
import styles from './DebugPanel.module.css';

const SCALES = [1, 10, 30, 60, 120];
const ADVANCE_MINUTES = [1, 5, 20, 60];

/** Dev-only tools (DESIGN 21 Phase 2). Never included in production builds. */
export default function DebugPanel() {
  const session = useSim();
  const { sim, clock } = session;
  const [open, setOpen] = useState(false);
  const [rarity, setRarity] = useState<Rarity | ''>('');
  const [speciesId, setSpeciesId] = useState('');
  const [sparkle, setSparkle] = useState<'' | 'yes' | 'no'>('');
  const [pregnant, setPregnant] = useState<'' | 'no' | '1' | '2' | '3' | '4' | '5'>('');
  const [message, setMessage] = useState('');
  const [illnessId, setIllnessId] = useState('');

  if (!open) {
    return (
      <button type="button" className={styles.toggle} onClick={() => setOpen(true)}>
        🛠 Debug
      </button>
    );
  }

  const speciesChoices = SPECIES.filter((s) => !rarity || s.rarity === rarity);

  const spawn = () => {
    const opts: DebugVisitorOptions = {};
    if (rarity) opts.rarity = rarity;
    if (speciesId) opts.speciesId = speciesId;
    if (sparkle) opts.isSparkle = sparkle === 'yes';
    if (pregnant) opts.pregnant = pregnant === 'no' ? 0 : Number(pregnant);
    const result = debugSpawnVisitor(sim, opts);
    setMessage(result.ok ? 'Visitor at the gate!' : result.reason);
  };

  const advance = (minutes: number) => {
    clock.jump(minutes * 60_000);
    debugRunOnline(sim);
    setMessage(`Advanced ${minutes} min`);
  };

  const makeSick = (all: boolean, tricky = false) => {
    const n = debugMakeSick(sim, { all, tricky, ...(illnessId ? { illnessId } : {}) });
    setMessage(n === 0 ? 'Nobody healthy to make sick' : `${n} got sick`);
  };
  const sicknessOn = sim.state.world.settings.sicknessEnabled;

  const newGame = async () => {
    if (!confirm('Delete this save and start a new game?')) return;
    await session.deleteSave();
    location.reload();
  };

  return (
    <section className={styles.panel} aria-label="Debug panel">
      <header className={styles.header}>
        <strong>🛠 Debug</strong>
        <span className={styles.dim}>{new Date(sim.now()).toLocaleTimeString()}</span>
        <button type="button" className={styles.small} onClick={() => setOpen(false)}>
          ✕
        </button>
      </header>

      <div className={styles.row}>
        <span>Speed</span>
        {SCALES.map((s) => (
          <button
            key={s}
            type="button"
            className={clock.getScale() === s ? styles.active : styles.small}
            onClick={() => {
              clock.setScale(s);
              setMessage(`Time x${s}`);
            }}
          >
            {s}x
          </button>
        ))}
      </div>

      <div className={styles.row}>
        <span>Advance</span>
        {ADVANCE_MINUTES.map((m) => (
          <button key={m} type="button" className={styles.small} onClick={() => advance(m)}>
            +{m}m
          </button>
        ))}
      </div>

      <fieldset className={styles.group}>
        <legend>Spawn visitor now</legend>
        <select
          value={rarity}
          onChange={(e) => {
            setRarity(e.target.value as Rarity | '');
            setSpeciesId('');
          }}
        >
          <option value="">Any rarity</option>
          {RARITIES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select value={speciesId} onChange={(e) => setSpeciesId(e.target.value)}>
          <option value="">Any species</option>
          {speciesChoices.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select value={sparkle} onChange={(e) => setSparkle(e.target.value as typeof sparkle)}>
          <option value="">Sparkle: roll</option>
          <option value="yes">Sparkle: yes</option>
          <option value="no">Sparkle: no</option>
        </select>
        <select value={pregnant} onChange={(e) => setPregnant(e.target.value as typeof pregnant)}>
          <option value="">Pregnant: roll</option>
          <option value="no">Not pregnant</option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={String(n)}>
              Pregnant: {n} babies
            </option>
          ))}
        </select>
        <button type="button" className={styles.small} onClick={spawn}>
          Spawn
        </button>
      </fieldset>

      <div className={styles.row}>
        <button type="button" className={styles.small} onClick={() => debugAddCoins(sim, 100)}>
          +100 🪙
        </button>
        <button type="button" className={styles.small} onClick={() => debugAddCoins(sim, 1000)}>
          +1000 🪙
        </button>
        <button type="button" className={styles.small} onClick={() => debugAddCoins(sim, 10_000)}>
          +10k 🪙
        </button>
        <button type="button" className={styles.small} onClick={() => debugAddGems(sim, 10)}>
          +10 💎
        </button>
        <button type="button" className={styles.small} onClick={() => debugAddGems(sim, 100)}>
          +100 💎
        </button>
      </div>

      <div className={styles.row}>
        <span>Needs</span>
        <button type="button" className={styles.small} onClick={() => debugSetNeeds(sim, 10, 10)}>
          😢 Neglect all
        </button>
        <button type="button" className={styles.small} onClick={() => debugSetNeeds(sim, 100, 100)}>
          💖 Fill all
        </button>
      </div>

      <div className={styles.row}>
        <span>House</span>
        <button
          type="button"
          className={styles.small}
          onClick={() => {
            debugGiveItems(sim, { bed_basic: 3, bed_royal: 1, sofa: 1, round_rug: 1, tv: 1 });
            setMessage('Beds and furniture in the inventory');
          }}
        >
          🛏️ Free house kit
        </button>
        <button
          type="button"
          className={styles.small}
          onClick={() => {
            debugGiveItems(sim, { carrot_patch: 1, little_pond: 1, rainbow_fountain: 1 });
            setMessage('Lures in the inventory');
          }}
        >
          🌷 Free lures
        </button>
      </div>

      <fieldset className={styles.group}>
        <legend>Sickness</legend>
        <select value={illnessId} onChange={(e) => setIllnessId(e.target.value)}>
          <option value="">Random illness</option>
          {ILLNESSES.map((i) => (
            <option key={i.id} value={i.id}>
              {i.symptomIcon} {i.name}
            </option>
          ))}
        </select>
        <button type="button" className={styles.small} onClick={() => makeSick(false)}>
          🤒 One
        </button>
        <button type="button" className={styles.small} onClick={() => makeSick(true)}>
          🤒 All
        </button>
        <button type="button" className={styles.small} onClick={() => makeSick(false, true)}>
          🤒🤒 Tricky
        </button>
        <button type="button" className={styles.small} onClick={() => debugCureAll(sim)}>
          💊 Cure all
        </button>
        <button
          type="button"
          className={sicknessOn ? styles.active : styles.small}
          onClick={() => debugSetSicknessEnabled(sim, !sicknessOn)}
        >
          Rolls {sicknessOn ? 'on' : 'off'}
        </button>
      </fieldset>

      <div className={styles.row}>
        <button
          type="button"
          className={styles.small}
          onClick={() => void session.save().then(() => setMessage('Saved'))}
        >
          Save now
        </button>
        <button type="button" className={styles.danger} onClick={() => void newGame()}>
          New game
        </button>
      </div>
      {message && <p className={styles.dim}>{message}</p>}
    </section>
  );
}
