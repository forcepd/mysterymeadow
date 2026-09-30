import { useCallback, useState } from 'react';
import { appBus } from '../bridge/appBus';
import { displayName } from '../bridge/describe';
import { ITEMS, getItem, type OutfitSlot, type PetOutfitItemDef } from '../config/items';
import common from './common.module.css';
import { PetPortrait } from './PetPortrait';
import styles from './Screens.module.css';
import w from './PetWardrobe.module.css';
import { useSim } from './session';
import { useAppEvent } from './useAppEvent';

const SLOTS: { slot: OutfitSlot; name: string; icon: string }[] = [
  { slot: 'head', name: 'Head', icon: '🎩' },
  { slot: 'body', name: 'Body', icon: '👕' },
  { slot: 'face', name: 'Face', icon: '👓' },
];

/**
 * Pet Wardrobe (DESIGN 10.3, 17.1 #10): Head, Body, and Face slots. Outfits come from the
 * Pet Boutique; once bought, any animal can wear them (your choice).
 */
export function PetWardrobe() {
  const { sim } = useSim();
  const [animalId, setAnimalId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useAppEvent(
    'openScreen',
    useCallback(({ screen, animalId: id }) => {
      setAnimalId(screen === 'petWardrobe' ? (id ?? null) : null);
      setMessage(null);
    }, []),
  );
  const animal = animalId ? sim.getAnimal(animalId) : undefined;
  if (!animalId || !animal) return null;

  const owned = ITEMS.filter(
    (i): i is PetOutfitItemDef =>
      i.category === 'petOutfit' && (sim.state.world.inventory[i.id] ?? 0) > 0,
  );
  const close = () => appBus.emit('openScreen', { screen: null });
  const act = (r: { ok: boolean; reason?: string }) => setMessage(r.ok ? null : (r.reason ?? null));

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label="Pet wardrobe">
      <div className={`${common.panel} ${styles.screen}`}>
        <header className={styles.header}>
          <h2 className={styles.title}>
            <span aria-hidden="true">👒</span> Dress {displayName(animal)}
          </h2>
          <button type="button" className={common.iconButton} onClick={close} aria-label="Close">
            ✕
          </button>
        </header>
        <div className={w.body}>
          <div className={w.preview} aria-label="Wearing">
            <PetPortrait animal={animal} size={110} />
            <ul className={w.worn}>
              {SLOTS.map(({ slot }) => {
                const def = animal.outfit[slot] ? getItem(animal.outfit[slot]!) : undefined;
                return def ? (
                  <li key={slot}>
                    {def.icon} {def.name}
                  </li>
                ) : null;
              })}
            </ul>
          </div>
          <div className={w.slots}>
            {SLOTS.map(({ slot, name, icon }) => {
              const worn = animal.outfit[slot];
              const choices = owned.filter((o) => o.slot === slot);
              return (
                <section key={slot} className={w.slot} aria-label={name}>
                  <h3 className={styles.heading}>
                    <span aria-hidden="true">{icon}</span> {name}
                  </h3>
                  <div className={w.row}>
                    <button
                      type="button"
                      className={`${w.item} ${worn ? '' : w.on}`}
                      aria-pressed={!worn}
                      onClick={() => worn && act(sim.undressPet(animal.id, slot))}
                    >
                      <span className={w.itemIcon} aria-hidden="true">
                        ✕
                      </span>
                      Nothing
                    </button>
                    {choices.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        className={`${w.item} ${worn === o.id ? w.on : ''}`}
                        aria-pressed={worn === o.id}
                        onClick={() => act(sim.dressPet(animal.id, o.id))}
                      >
                        <span className={w.itemIcon} aria-hidden="true">
                          {o.icon}
                        </span>
                        {o.name}
                      </button>
                    ))}
                  </div>
                </section>
              );
            })}
            {owned.length === 0 && (
              <p className={styles.hint}>
                No outfits yet! Find hats, capes, and glasses in the{' '}
                <button
                  type="button"
                  className={w.link}
                  onClick={() => appBus.emit('openScreen', { screen: 'store' })}
                >
                  🎀 Pet Boutique
                </button>
                .
              </p>
            )}
          </div>
        </div>
        {message && (
          <p className={styles.refusal} role="status">
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
