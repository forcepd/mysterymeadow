import { useCallback, useState } from 'react';
import { RARITY_STYLE, starString } from '../art/palette';
import { appBus } from '../bridge/appBus';
import { RARITIES } from '../sim/types';
import common from './common.module.css';
import { PetPortrait, Silhouette } from './PetPortrait';
import styles from './Screens.module.css';
import { useSim } from './session';
import { useAppEvent } from './useAppEvent';

/**
 * Animal Dex (DESIGN 17.1 #12): every species by rarity. Found species show their colors;
 * undiscovered ones are silhouettes with only their rarity showing.
 */
export function DexScreen() {
  const { sim } = useSim();
  const [open, setOpen] = useState(false);
  useAppEvent(
    'openScreen',
    useCallback(({ screen }) => setOpen(screen === 'dex'), []),
  );
  if (!open) return null;

  const dex = sim.dex();
  const close = () => appBus.emit('openScreen', { screen: null });

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label="Animal Dex">
      <div className={`${common.panel} ${styles.screen}`}>
        <header className={styles.header}>
          <div>
            <h2 className={styles.title}>
              <span aria-hidden="true">📖</span> Animal Dex
            </h2>
            <p className={styles.note} data-testid="dex-progress">
              {dex.speciesFound}/{dex.speciesTotal} animals found · {dex.looksFound}/
              {dex.looksTotal} colors and Sparkles
            </p>
          </div>
          <button type="button" className={common.iconButton} onClick={close} aria-label="Close">
            ✕
          </button>
        </header>

        {RARITIES.map((rarity) => {
          const style = RARITY_STYLE[rarity];
          return (
            <section key={rarity} className={styles.section} aria-label={style.label}>
              <h3 className={styles.heading} style={{ color: style.color }}>
                <span aria-hidden="true">{starString(rarity)}</span> {style.label}
              </h3>
              <div className={styles.dexGrid}>
                {dex.entries
                  .filter((e) => e.species.rarity === rarity)
                  .map((e) =>
                    e.discovered ? (
                      <article
                        key={e.species.id}
                        className={styles.dexCard}
                        aria-label={e.species.name}
                      >
                        <PetPortrait
                          animal={{
                            speciesId: e.species.id,
                            variantId: e.variantsFound[0]!,
                            isSparkle: e.sparkleFound,
                          }}
                        />
                        <span className={styles.dexName}>{e.species.name}</span>
                        <ul className={styles.dots} aria-label="Colors found">
                          {e.species.variants.map((v) => {
                            const found = e.variantsFound.includes(v.id);
                            return (
                              <li
                                key={v.id}
                                className={`${styles.dot} ${found ? '' : styles.missing}`}
                                style={found ? { background: v.colors.main } : undefined}
                                title={found ? v.name : '???'}
                                aria-label={found ? v.name : 'Not found yet'}
                              />
                            );
                          })}
                          <li
                            className={e.sparkleFound ? styles.sparkleFound : styles.sparkleMissing}
                            aria-label={e.sparkleFound ? 'Sparkle' : 'Sparkle not found yet'}
                          >
                            ✦
                          </li>
                        </ul>
                      </article>
                    ) : (
                      <article
                        key={e.species.id}
                        className={`${styles.dexCard} ${styles.unknown}`}
                        aria-label="Undiscovered animal"
                      >
                        <Silhouette speciesId={e.species.id} />
                        <span className={styles.dexName}>???</span>
                        <span className={styles.stars} style={{ color: style.color }}>
                          {starString(rarity)}
                        </span>
                      </article>
                    ),
                  )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
