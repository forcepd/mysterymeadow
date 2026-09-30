import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { appBus } from '../bridge/appBus';
import { displayName } from '../bridge/describe';
import type { GameSim } from '../sim/GameSim';
import type { Animal, CommandResult } from '../sim/types';
import common from './common.module.css';
import { PetPortrait } from './PetPortrait';
import styles from './Screens.module.css';
import { useSim } from './session';
import { useAppEvent } from './useAppEvent';

type Kind = 'incoming' | 'out' | 'stored';
interface PetRef {
  kind: Kind;
  id: string;
}
type Target = PetRef | { kind: 'emptySlot' } | { kind: 'storage' };

/** A press has to move this far (CSS px) before it becomes a drag. */
const DRAG_START = 10;

function parseTarget(value: string | undefined): Target | null {
  if (!value) return null;
  if (value === 'emptySlot' || value === 'storage') return { kind: value };
  const [kind, id] = value.split(':');
  if ((kind === 'incoming' || kind === 'out' || kind === 'stored') && id) return { kind, id };
  return null;
}

const dropValue = (t: Target) => ('id' in t ? `${t.kind}:${t.id}` : t.kind);

/**
 * Pets / Swap screen (DESIGN 10.1): Pet Slots on top, Pet Storage below. Tap a pet, then tap
 * where it should go (or drag it there). A pet being kept while every slot is full arrives as
 * the "new pet" and can take a slot (bumping that pet into Storage) or go straight to Storage.
 */
export function PetsScreen() {
  const { sim } = useSim();
  const [open, setOpen] = useState(false);
  const [incomingId, setIncomingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<PetRef | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  useAppEvent(
    'openScreen',
    useCallback(({ screen, incomingId: incoming }) => {
      setOpen(screen === 'pets');
      setIncomingId(screen === 'pets' ? (incoming ?? null) : null);
      setSelected(screen === 'pets' && incoming ? { kind: 'incoming', id: incoming } : null);
      setMessage(null);
    }, []),
  );

  const perform = (src: PetRef, target: Target) => {
    const result = act(sim, src, target);
    if (!result) {
      // Not a move: pick the tapped pet instead.
      setSelected('id' in target ? target : null);
      return;
    }
    setSelected(null);
    if (!result.ok) {
      setMessage({ text: result.reason, ok: false });
      return;
    }
    setMessage({ text: successText(sim, src, target), ok: true });
    if (src.kind === 'incoming') setIncomingId(null);
  };

  const tap = (target: Target) => {
    if (selected && 'id' in target && target.id === selected.id) setSelected(null);
    else if (selected) perform(selected, target);
    else if ('id' in target) setSelected(target);
  };

  const drag = useDrag(perform);

  if (!open) return null;

  const world = sim.state.world;
  const slots = sim.petSlots();
  const storage = sim.petStorage();
  const out = world.animals.filter((a) => a.isKept);
  const stored = world.petStorage.map((p) => p.animal);
  const incoming = incomingId ? sim.getAnimal(incomingId) : undefined;
  const close = () => appBus.emit('openScreen', { screen: null });
  const now = sim.now();

  const tile = (animal: Readonly<Animal>, kind: Kind) => {
    const ref: PetRef = { kind, id: animal.id };
    const isSelected = selected?.id === animal.id;
    return (
      <button
        key={animal.id}
        type="button"
        className={`${styles.tile} ${isSelected ? styles.selected : ''}`}
        data-drop={dropValue(ref)}
        aria-pressed={isSelected}
        aria-label={`${displayName(animal)}${animal.sickness ? ', sick' : ''}`}
        onClick={() => drag.clickAllowed() && tap(ref)}
        onPointerDown={(e) => drag.down(e, ref)}
      >
        <PetPortrait animal={animal} now={now} />
        <span className={styles.tileName}>{displayName(animal)}</span>
      </button>
    );
  };

  const emptySlots = Math.max(0, slots.total - out.length);

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label="Your pets">
      <div className={`${common.panel} ${styles.screen}`}>
        <header className={styles.header}>
          <h2 className={styles.title}>
            <span aria-hidden="true">🐾</span> Your Pets
          </h2>
          <button type="button" className={common.iconButton} onClick={close} aria-label="Close">
            ✕
          </button>
        </header>

        {incoming && (
          <div className={styles.incoming}>
            {tile(incoming, 'incoming')}
            <p>
              <strong>Keeping {displayName(incoming)}!</strong> Your Pet Slots are full. Tap a pet
              slot to swap (that pet goes to Storage), or tap Storage.
            </p>
          </div>
        )}

        <p className={styles.hint}>
          {selected
            ? 'Now tap where it should go.'
            : 'Tap a pet, then tap where it should go. Or drag it!'}
        </p>

        <section aria-label="Pet Slots" className={styles.section}>
          <h3 className={styles.heading}>
            <span aria-hidden="true">♥</span> Pet Slots{' '}
            <span className={styles.count} data-testid="slots-count">
              {slots.used}/{slots.total}
            </span>
          </h3>
          <div className={styles.row}>
            {out.map((a) => tile(a, 'out'))}
            {Array.from({ length: emptySlots }, (_, i) => (
              <button
                key={`empty${i}`}
                type="button"
                className={`${styles.tile} ${styles.empty}`}
                data-drop="emptySlot"
                onClick={() => drag.clickAllowed() && tap({ kind: 'emptySlot' })}
              >
                <span className={styles.plus} aria-hidden="true">
                  +
                </span>
                <span className={styles.tileName}>Empty slot</span>
              </button>
            ))}
          </div>
        </section>

        <section
          aria-label="Pet Storage"
          className={`${styles.section} ${styles.storage}`}
          data-drop="storage"
          onClick={(e) => {
            if (e.target === e.currentTarget && drag.clickAllowed()) tap({ kind: 'storage' });
          }}
        >
          <h3 className={styles.heading}>
            <span aria-hidden="true">📦</span> Pet Storage{' '}
            <span className={styles.count} data-testid="storage-count">
              {storage.used}/{storage.total}
            </span>
            <span className={styles.note}> Pets here are resting: no hunger, no aging.</span>
          </h3>
          <div className={styles.grid}>
            {stored.map((a) => tile(a, 'stored'))}
            {storage.free > 0 && (
              <button
                type="button"
                className={`${styles.tile} ${styles.empty}`}
                data-drop="storage"
                onClick={() => drag.clickAllowed() && tap({ kind: 'storage' })}
              >
                <span className={styles.plus} aria-hidden="true">
                  📦
                </span>
                <span className={styles.tileName}>Store here</span>
              </button>
            )}
          </div>
        </section>

        {message && (
          <p className={message.ok ? styles.success : styles.refusal} role="status">
            {message.text}
          </p>
        )}
      </div>
      {drag.ghost && (
        <div className={styles.ghost} style={{ left: drag.ghost.x, top: drag.ghost.y }}>
          <PetPortrait animal={drag.ghost.animal} />
        </div>
      )}
    </div>
  );
}

/** What a move does. `null` means it isn't a move (the tap just selects something else). */
function act(sim: GameSim, src: PetRef, target: Target): CommandResult | null {
  switch (src.kind) {
    case 'incoming':
      if (target.kind === 'emptySlot') return sim.keep(src.id);
      if (target.kind === 'out') return sim.keepBumping(src.id, target.id);
      if (target.kind === 'storage' || target.kind === 'stored') return sim.storePet(src.id);
      return null;
    case 'out':
      if (target.kind === 'storage') return sim.storePet(src.id);
      if (target.kind === 'stored') return sim.swapPets(src.id, target.id);
      return null;
    case 'stored':
      if (target.kind === 'emptySlot') return sim.retrievePet(src.id);
      if (target.kind === 'out') return sim.swapPets(target.id, src.id);
      return null;
  }
}

function successText(sim: GameSim, src: PetRef, target: Target): string {
  const name = (id: string) => {
    const a = sim.getAnimal(id) ?? sim.getStoredPet(id);
    return a ? displayName(a) : 'Your pet';
  };
  const other = 'id' in target ? name(target.id) : '';
  if (src.kind === 'incoming') {
    if (target.kind === 'out')
      return `${name(src.id)} is your pet now! ${other} is resting in Storage.`;
    if (target.kind === 'emptySlot') return `${name(src.id)} is your pet now! 💖`;
    return `${name(src.id)} is your pet now, resting in Storage. 💖`;
  }
  if (target.kind === 'storage') return `${name(src.id)} is resting in Storage.`;
  if (target.kind === 'emptySlot') return `${name(src.id)} is out and about!`;
  return `${name(src.id)} and ${other} swapped places!`;
}

interface Ghost {
  x: number;
  y: number;
  animal: Readonly<Animal>;
}

/**
 * Drag a pet tile onto a target (pointer events: works with touch and mouse). The drop target
 * is whatever element with `data-drop` is under the pointer.
 */
function useDrag(perform: (src: PetRef, target: Target) => void) {
  const { sim } = useSim();
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const press = useRef<{ ref: PetRef; x: number; y: number; dragging: boolean } | null>(null);
  const suppressClick = useRef(false);
  const performRef = useRef(perform);
  useEffect(() => {
    performRef.current = perform;
  });

  useEffect(() => {
    const move = (e: globalThis.PointerEvent) => {
      const p = press.current;
      if (!p) return;
      if (!p.dragging && Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_START) return;
      p.dragging = true;
      const animal = sim.getAnimal(p.ref.id) ?? sim.getStoredPet(p.ref.id);
      if (animal) setGhost({ x: e.clientX, y: e.clientY, animal });
    };
    const up = (e: globalThis.PointerEvent) => {
      const p = press.current;
      press.current = null;
      if (!p?.dragging) return;
      setGhost(null);
      suppressClick.current = true;
      setTimeout(() => (suppressClick.current = false), 0);
      const el = document
        .elementFromPoint(e.clientX, e.clientY)
        ?.closest<HTMLElement>('[data-drop]');
      const target = parseTarget(el?.dataset.drop);
      if (target && !('id' in target && target.id === p.ref.id)) performRef.current(p.ref, target);
    };
    const cancel = () => {
      press.current = null;
      setGhost(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
  }, [sim]);

  return {
    ghost,
    down(e: PointerEvent, ref: PetRef) {
      press.current = { ref, x: e.clientX, y: e.clientY, dragging: false };
    },
    /** False right after a drop, so the drop doesn't also count as a tap. */
    clickAllowed: () => !suppressClick.current,
  };
}
