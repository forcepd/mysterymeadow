import { useCallback, useState } from 'react';
import { appBus } from '../bridge/appBus';
import { speciesName } from '../bridge/describe';
import { ITEMS, allowedZones, isPlaceable, type ItemDef } from '../config/items';
import common from './common.module.css';
import styles from './Screens.module.css';
import store from './HomeStore.module.css';
import { useSim } from './session';
import { useAppEvent } from './useAppEvent';

type Tab = 'furniture' | 'beds' | 'yard' | 'surfaces' | 'food' | 'petBoutique' | 'helpers';

const TABS: { id: Tab; icon: string; label: string; has: (i: ItemDef) => boolean }[] = [
  { id: 'furniture', icon: '🛋️', label: 'Furniture', has: (i) => i.category === 'furniture' },
  { id: 'beds', icon: '🛏️', label: 'Pet Beds', has: (i) => i.category === 'bed' },
  { id: 'yard', icon: '🌷', label: 'Yard & Lures', has: (i) => i.category === 'lure' },
  {
    id: 'surfaces',
    icon: '🎨',
    label: 'Walls & Floors',
    has: (i) => i.category === 'wallpaper' || i.category === 'flooring',
  },
  { id: 'food', icon: '🥣', label: 'Food & Treats', has: (i) => i.category === 'bowl' },
  { id: 'petBoutique', icon: '🎀', label: 'Pet Boutique', has: (i) => i.category === 'petOutfit' },
  { id: 'helpers', icon: '🤖', label: 'Helpers', has: (i) => i.category === 'helper' },
];

/** Short, kid-friendly lines describing what an item does. */
function details(def: ItemDef): string[] {
  switch (def.category) {
    case 'lure': {
      const who = def.affinity.map(speciesName).join(', ');
      return [`🌟 +${def.lure} Lure`, who ? `Attracts ${who}` : 'Attracts everyone a little'];
    }
    case 'bed':
      return ['🛏️ Room for 1 animal inside', `💗 +${def.happinessPerMinute} happy a minute`];
    case 'furniture':
      return [`✨ +${def.coziness} Cozy`, `${def.size.w}×${def.size.h} tiles`];
    case 'wallpaper':
    case 'flooring':
      return [`✨ +${def.coziness} Cozy`, 'Covers the whole room'];
    case 'bowl':
      return ['🥣 Holds 5 meals', 'Yard or house'];
    case 'helper':
      return [def.description];
    case 'petOutfit':
      return [
        { head: '🎩 On the head', body: '👕 On the body', face: '👓 On the face' }[def.slot],
        'Any of your animals can wear it',
      ];
  }
}

/**
 * Home Store (DESIGN 13.1), for coins. Bought things go to the inventory (place them in
 * Decorate mode); helpers start working right away; pet outfits are worn from an animal's card.
 */
export function HomeStore() {
  const { sim } = useSim();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('furniture');
  const [message, setMessage] = useState<{ text: string; ok: boolean; place?: ItemDef } | null>(
    null,
  );
  useAppEvent(
    'openScreen',
    useCallback(({ screen }) => {
      setOpen(screen === 'store');
      setMessage(null);
    }, []),
  );
  if (!open) return null;

  const close = () => appBus.emit('openScreen', { screen: null });
  const current = TABS.find((t) => t.id === tab)!;
  const coins = sim.state.world.coins;

  const buy = (def: ItemDef) => {
    const result = sim.buyItem(def.id);
    if (!result.ok) setMessage({ text: result.reason, ok: false });
    else if (def.category === 'petOutfit') {
      setMessage({
        text: `${def.icon} ${def.name} is yours! Dress a pet from its card.`,
        ok: true,
      });
    } else if (def.category === 'helper') {
      setMessage({ text: `${def.name} is on the job! ${def.icon}`, ok: true });
    } else setMessage({ text: `You got the ${def.name}!`, ok: true, place: def });
  };

  /** Straight to Decorate mode in the right place. */
  const placeNow = (def: ItemDef) => {
    close();
    const zone = isPlaceable(def) ? allowedZones(def)[0]! : 'house';
    appBus.emit('showZone', { zone: def.category === 'bowl' ? 'yard' : zone });
    appBus.emit('decorate', { on: true });
  };

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label="Home Store">
      <div className={`${common.panel} ${styles.screen}`}>
        <header className={styles.header}>
          <h2 className={styles.title}>
            <span aria-hidden="true">🛒</span> Home Store
          </h2>
          <span className={styles.count}>🪙 {coins}</span>
          <span className={store.spacer} />
          <button type="button" className={common.iconButton} onClick={close} aria-label="Close">
            ✕
          </button>
        </header>

        <div className={store.tabs} role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={tab === t.id ? store.tabOn : store.tab}
              onClick={() => {
                setTab(t.id);
                setMessage(null);
              }}
            >
              <span aria-hidden="true">{t.icon}</span> {t.label}
            </button>
          ))}
        </div>

        {message && (
          <div className={message.ok ? styles.success : styles.refusal} role="status">
            {message.text}{' '}
            {message.place && message.place.category !== 'helper' && (
              <button
                type="button"
                className={`${common.button} ${store.placeNow}`}
                onClick={() => placeNow(message.place!)}
              >
                <span aria-hidden="true">🛠</span>{' '}
                {isPlaceable(message.place) ? 'Place it now' : 'Use it now'}
              </button>
            )}
          </div>
        )}

        <div className={store.grid} role="tabpanel" aria-label={current.label}>
          {ITEMS.filter(current.has).map((def) => {
            const owned = sim.ownedCount(def.id);
            const once = !isPlaceable(def);
            const soldOut = once && owned > 0;
            return (
              <article key={def.id} className={store.card} aria-label={def.name}>
                {def.category === 'wallpaper' || def.category === 'flooring' ? (
                  <span
                    className={store.swatch}
                    style={{ background: def.color }}
                    aria-hidden="true"
                  />
                ) : (
                  <span className={store.icon} aria-hidden="true">
                    {def.icon}
                  </span>
                )}
                <span className={store.name}>{def.name}</span>
                <ul className={store.details}>
                  {details(def).map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
                {owned > 0 && (
                  <span className={store.owned}>{once ? 'Yours!' : `You have ${owned}`}</span>
                )}
                {!soldOut && (
                  <button
                    type="button"
                    className={`${common.button} ${store.buy}`}
                    aria-disabled={coins < def.cost}
                    onClick={() => buy(def)}
                  >
                    <span aria-hidden="true">🪙</span> {def.cost}
                  </button>
                )}
              </article>
            );
          })}
        </div>
        {tab === 'food' && (
          <p className={styles.hint}>
            <span aria-hidden="true">🍪</span> Treats are on each animal’s card. Basic food is
            always free: just tap a bowl!
          </p>
        )}
      </div>
    </div>
  );
}
