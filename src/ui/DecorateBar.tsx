import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { appBus } from '../bridge/appBus';
import {
  ITEMS,
  allowedZones,
  getItem,
  isPlaceable,
  type ItemDef,
  type SurfaceItemDef,
} from '../config/items';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../game/constants';
import common from './common.module.css';
import styles from './DecorateBar.module.css';
import { useSim } from './session';
import { useAppEvent } from './useAppEvent';

/** A press on a tray item has to move this far (CSS px) before it's a drag. */
const DRAG_START = 10;

/** Canvas point (unzoomed world units) under a client point, or null off the canvas. */
function canvasPoint(clientX: number, clientY: number): { x: number; y: number } | null {
  const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="game-canvas"] canvas');
  const r = canvas?.getBoundingClientRect();
  if (!r || clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) {
    return null;
  }
  return {
    x: ((clientX - r.left) / r.width) * WORLD_WIDTH,
    y: ((clientY - r.top) / r.height) * WORLD_HEIGHT,
  };
}

/**
 * Decorate mode (DESIGN 12.3): the inventory tray along the bottom. Tap an item then a spot in
 * the room, or drag it into the room. Tap a placed item to turn it or put it away (drag it to
 * move). In the house, wallpaper and flooring apply with a tap.
 */
export function DecorateBar() {
  const { sim } = useSim();
  const [on, setOn] = useState(false);
  const [zone, setZone] = useState<'yard' | 'house'>('yard');
  const [tab, setTab] = useState<'items' | 'surfaces'>('items');
  const [picked, setPicked] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useAppEvent(
    'decorate',
    useCallback(({ on: next }) => {
      setOn(next);
      setPicked(null);
      setSelected(null);
      setMessage(null);
    }, []),
  );
  useAppEvent(
    'sceneChanged',
    useCallback(({ scene }) => {
      if (scene === 'vet') return;
      setZone(scene);
      setTab('items');
      setPicked(null);
    }, []),
  );
  useAppEvent(
    'decorSelect',
    useCallback(({ placedId }) => {
      setSelected(placedId);
      setMessage(null);
    }, []),
  );
  useAppEvent(
    'decorPlaced',
    useCallback(() => setPicked(null), []),
  );

  const pick = (itemId: string | null) => {
    setPicked(itemId);
    appBus.emit('decorPick', { itemId });
  };
  const drag = useTrayDrag(pick);

  if (!on) return null;

  const world = sim.state.world;
  const placeable = ITEMS.filter(
    (i) => isPlaceable(i) && allowedZones(i).includes(zone) && (world.inventory[i.id] ?? 0) > 0,
  );
  const surfaces = ITEMS.filter(
    (i): i is SurfaceItemDef =>
      (i.category === 'wallpaper' || i.category === 'flooring') && sim.ownedCount(i.id) > 0,
  );
  const selectedItem = selected ? world.placedItems.find((p) => p.id === selected) : undefined;
  const selectedDef = selectedItem && getItem(selectedItem.itemId);

  const act = (result: { ok: boolean; reason?: string }, after?: () => void) => {
    setMessage(result.ok ? null : (result.reason ?? null));
    if (result.ok) after?.();
  };
  const done = () => appBus.emit('decorate', { on: false });
  const lure = sim.lureSlots();
  const beds = sim.indoorSlots();

  return (
    <section className={`${common.panel} ${styles.bar}`} aria-label="Decorate">
      <header className={styles.header}>
        <strong className={styles.title}>
          <span aria-hidden="true">🛠</span> Decorating the {zone === 'yard' ? 'Yard' : 'House'}
        </strong>
        {zone === 'yard' ? (
          <span className={styles.stat} data-testid="lure-stat">
            🌟 Lure {sim.lureScore()} · slots {lure.used}/{lure.total}
          </span>
        ) : (
          <span className={styles.stat} data-testid="house-stat">
            ✨ Cozy {sim.coziness()} · 🛏️ beds {beds.total}
          </span>
        )}
        {zone === 'house' && (
          <div className={styles.tabs} role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'items'}
              className={tab === 'items' ? styles.tabOn : styles.tab}
              onClick={() => setTab('items')}
            >
              Things
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'surfaces'}
              className={tab === 'surfaces' ? styles.tabOn : styles.tab}
              onClick={() => {
                setTab('surfaces');
                pick(null);
              }}
            >
              Walls &amp; Floors
            </button>
          </div>
        )}
        <span className={styles.spacer} />
        <button
          type="button"
          className={`${common.button} ${styles.small}`}
          onClick={() => appBus.emit('openScreen', { screen: 'store' })}
        >
          <span aria-hidden="true">🛒</span> Store
        </button>
        <button type="button" className={`${common.button} ${styles.small}`} onClick={done}>
          ✓ Done
        </button>
      </header>

      {selectedItem && selectedDef ? (
        <div className={styles.actions}>
          <span className={styles.selectedName}>
            <span aria-hidden="true">{selectedDef.icon}</span> {selectedDef.name}
          </span>
          <span className={styles.hint}>Drag it to move.</span>
          <button
            type="button"
            className={`${common.button} ${styles.small} ${styles.secondary}`}
            onClick={() => act(sim.rotateItem(selectedItem.id))}
          >
            <span aria-hidden="true">🔄</span> Turn
          </button>
          <button
            type="button"
            className={`${common.button} ${styles.small} ${styles.secondary}`}
            onClick={() =>
              act(sim.storeItem(selectedItem.id), () => {
                setSelected(null);
                appBus.emit('decorSelect', { placedId: null });
              })
            }
          >
            <span aria-hidden="true">📦</span> Put away
          </button>
        </div>
      ) : (
        <p className={styles.hint}>
          {picked
            ? 'Now tap a spot to place it (green = fits).'
            : tab === 'surfaces'
              ? 'Tap to use it.'
              : 'Tap an item, then a spot. Or drag it in! Tap something already placed to change it.'}
        </p>
      )}

      <div className={styles.tray} role="list">
        {tab === 'items' &&
          placeable.map((def) => (
            <TrayItem
              key={def.id}
              def={def}
              count={world.inventory[def.id] ?? 0}
              picked={picked === def.id}
              onTap={() => drag.clickAllowed() && pick(picked === def.id ? null : def.id)}
              onPointerDown={(e) => drag.down(e, def.id)}
            />
          ))}
        {tab === 'items' && placeable.length === 0 && (
          <p className={styles.empty}>
            Nothing to place here. Visit the <strong>🛒 Home Store</strong>!
          </p>
        )}
        {tab === 'surfaces' &&
          surfaces.map((def) => {
            const applied = world.house.wallpaperId === def.id || world.house.flooringId === def.id;
            return (
              <button
                key={def.id}
                type="button"
                role="listitem"
                className={`${styles.item} ${applied ? styles.picked : ''}`}
                aria-pressed={applied}
                onClick={() => act(sim.applySurface(def.id))}
              >
                <span
                  className={styles.swatch}
                  style={{ background: def.color }}
                  aria-hidden="true"
                />
                <span className={styles.itemName}>{def.name}</span>
                {applied && <span className={styles.count}>✓</span>}
              </button>
            );
          })}
      </div>

      {message && (
        <p className={styles.message} role="status">
          {message}
        </p>
      )}
    </section>
  );
}

function TrayItem({
  def,
  count,
  picked,
  onTap,
  onPointerDown,
}: {
  def: ItemDef;
  count: number;
  picked: boolean;
  onTap: () => void;
  onPointerDown: (e: PointerEvent) => void;
}) {
  return (
    <button
      type="button"
      role="listitem"
      className={`${styles.item} ${picked ? styles.picked : ''}`}
      aria-pressed={picked}
      aria-label={`${def.name}, ${count} to place`}
      onClick={onTap}
      onPointerDown={onPointerDown}
    >
      <span className={styles.itemIcon} aria-hidden="true">
        {def.icon}
      </span>
      <span className={styles.itemName}>{def.name}</span>
      <span className={styles.count}>×{count}</span>
    </button>
  );
}

/** Dragging an item from the tray into the room (pointer events: touch or mouse). */
function useTrayDrag(pick: (itemId: string | null) => void) {
  const press = useRef<{ itemId: string; x: number; y: number; dragging: boolean } | null>(null);
  const suppressClick = useRef(false);
  const pickRef = useRef(pick);
  useEffect(() => {
    pickRef.current = pick;
  });

  useEffect(() => {
    const move = (e: globalThis.PointerEvent) => {
      const p = press.current;
      if (!p) return;
      if (!p.dragging && Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_START) return;
      if (!p.dragging) pickRef.current(null);
      p.dragging = true;
      appBus.emit('decorDrag', {
        itemId: p.itemId,
        at: canvasPoint(e.clientX, e.clientY),
        drop: false,
        client: { x: e.clientX, y: e.clientY },
      });
    };
    const up = (e: globalThis.PointerEvent) => {
      const p = press.current;
      press.current = null;
      if (!p?.dragging) return;
      suppressClick.current = true;
      setTimeout(() => (suppressClick.current = false), 0);
      // Dropped on the tray (or off the canvas): nothing happens. (Not e.target: on touch
      // that's always the tray item the finger started on.)
      const under = document.elementFromPoint(e.clientX, e.clientY);
      const onTray = under?.closest('[aria-label="Decorate"]');
      const at = onTray ? null : canvasPoint(e.clientX, e.clientY);
      appBus.emit('decorDrag', {
        itemId: p.itemId,
        at,
        drop: at !== null,
        ...(at ? { client: { x: e.clientX, y: e.clientY } } : {}),
      });
    };
    const cancel = () => {
      const p = press.current;
      press.current = null;
      if (p?.dragging) appBus.emit('decorDrag', { itemId: p.itemId, at: null, drop: false });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
  }, []);

  return {
    down(e: PointerEvent, itemId: string) {
      press.current = { itemId, x: e.clientX, y: e.clientY, dragging: false };
    },
    clickAllowed: () => !suppressClick.current,
  };
}
