import { useState } from 'react';
import {
  AVATAR_CATEGORIES,
  REQUIRED_SLOTS,
  SLOT_NAMES,
  itemsForSlot,
  type AvatarItemDef,
  type AvatarSlot,
} from '../config/avatarItems';
import { equip, owns, unequip, wornIn, type AvatarLoadout } from '../profile/avatar';
import styles from './AvatarStudio.module.css';
import { AvatarView } from './AvatarView';

export type StudioMode = 'create' | 'wardrobe' | 'boutique';

/** How many locked Boutique items onboarding teases per slot (DESIGN 5 step 2). */
const TEASERS_PER_SLOT = 2;

/**
 * Avatar Creator / Wardrobe / Boutique (DESIGN 13.3): a live preview and item choices by
 * category. `create` shows the free starter set (with a few locked Boutique teasers),
 * `wardrobe` only what the player owns, `boutique` everything with gem prices (tap to try on).
 */
export function AvatarStudio({
  mode,
  loadout,
  owned,
  onChange,
  onLocked,
}: {
  mode: StudioMode;
  loadout: AvatarLoadout;
  owned: readonly string[];
  onChange: (loadout: AvatarLoadout) => void;
  /** Tapped a locked teaser (create mode). */
  onLocked?: (item: AvatarItemDef) => void;
}) {
  const [category, setCategory] = useState(AVATAR_CATEGORIES[0]!.id);
  const current = AVATAR_CATEGORIES.find((c) => c.id === category)!;

  const choices = (slot: AvatarSlot) => {
    const all = itemsForSlot(slot);
    if (mode === 'boutique') return { items: all, locked: [] };
    const mine = all.filter((a) => owns(owned, a.id));
    if (mode === 'wardrobe') return { items: mine, locked: [] };
    return {
      items: all.filter((a) => a.cost === 0),
      locked: all.filter((a) => a.cost > 0).slice(0, TEASERS_PER_SLOT),
    };
  };

  return (
    <div className={styles.studio}>
      <div className={styles.preview}>
        <AvatarView loadout={loadout} height={260} label="Your avatar" />
      </div>
      <div className={styles.side}>
        <div className={styles.tabs} role="tablist" aria-label="Categories">
          {AVATAR_CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={c.id === category}
              className={c.id === category ? styles.tabOn : styles.tab}
              onClick={() => setCategory(c.id)}
            >
              <span aria-hidden="true">{c.icon}</span> {c.name}
            </button>
          ))}
        </div>
        <div className={styles.slots}>
          {current.slots.map((slot) => {
            const { items, locked } = choices(slot);
            const worn = wornIn(loadout, slot);
            const optional = !REQUIRED_SLOTS.includes(slot);
            return (
              <section key={slot} className={styles.slot} aria-label={SLOT_NAMES[slot]}>
                <h4 className={styles.slotName}>{SLOT_NAMES[slot]}</h4>
                <div className={styles.row}>
                  {optional && (
                    <button
                      type="button"
                      className={`${styles.item} ${worn ? '' : styles.on}`}
                      aria-pressed={!worn}
                      onClick={() => onChange(unequip(loadout, slot))}
                    >
                      <span className={styles.none} aria-hidden="true">
                        ✕
                      </span>
                      <span className={styles.itemName}>None</span>
                    </button>
                  )}
                  {items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`${styles.item} ${worn === item.id ? styles.on : ''}`}
                      aria-pressed={worn === item.id}
                      aria-label={item.name}
                      onClick={() => onChange(equip(loadout, item.id))}
                    >
                      <Swatch item={item} />
                      <span className={styles.itemName}>{item.name}</span>
                      {mode === 'boutique' && !owns(owned, item.id) && (
                        <span className={styles.price}>💎{item.cost}</span>
                      )}
                    </button>
                  ))}
                  {locked.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`${styles.item} ${styles.locked}`}
                      aria-label={`${item.name} (in the Boutique)`}
                      onClick={() => onLocked?.(item)}
                    >
                      <Swatch item={item} />
                      <span className={styles.itemName}>🔒 {item.name}</span>
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Swatch({ item }: { item: AvatarItemDef }) {
  const face = item.slot === 'eyes' || item.slot === 'brows' || item.slot === 'mouth';
  const shape = item.slot === 'bodyShape' || item.slot === 'hairStyle';
  if (face || shape) {
    const icon = { eyes: '👀', brows: '〰️', mouth: '👄', bodyShape: '🧍', hairStyle: '💇' }[
      item.slot as 'eyes'
    ];
    return (
      <span className={styles.swatch} aria-hidden="true">
        {icon}
      </span>
    );
  }
  return (
    <span
      className={styles.swatch}
      aria-hidden="true"
      style={{
        background: item.color2
          ? `linear-gradient(135deg, ${item.color} 55%, ${item.color2} 55%)`
          : item.color,
      }}
    />
  );
}
