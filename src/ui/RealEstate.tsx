import { useCallback, useState } from 'react';
import { appBus } from '../bridge/appBus';
import type { HouseTier } from '../config/balance';
import { HOUSE_COLORS } from '../config/houseColors';
import type { Purchase } from '../sim/systems/realEstate';
import common from './common.module.css';
import styles from './Screens.module.css';
import re from './RealEstate.module.css';
import { useSim } from './session';
import { useAppEvent } from './useAppEvent';

/** What changes between two house tiers, all read from balance.ts. */
function tierRows(from: HouseTier, to: HouseTier) {
  return [
    { icon: '🐾', label: 'Animals', from: from.baseCapacity, to: to.baseCapacity },
    {
      icon: '⏰',
      label: 'A visitor every',
      from: `${from.visitorMinutes} min`,
      to: `${to.visitorMinutes} min`,
    },
    {
      icon: '🏠',
      label: 'Room to decorate',
      from: `${from.interiorGrid[0]}×${from.interiorGrid[1]}`,
      to: `${to.interiorGrid[0]}×${to.interiorGrid[1]}`,
    },
    { icon: '🌷', label: 'Lure slots', from: from.lureSlots, to: to.lureSlots },
    { icon: '🌟', label: 'Lure bonus', from: `+${from.baseLure}`, to: `+${to.baseLure}` },
  ];
}

/**
 * Real Estate (DESIGN 13.2, 12.1, 12.5): upgrade the house (next tier only, with a free
 * repaint), extra rooms, Pet Slots, Pet Storage, and paint.
 */
export function RealEstate() {
  const { sim } = useSim();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [color, setColor] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  useAppEvent(
    'openScreen',
    useCallback(({ screen }) => {
      setOpen(screen === 'realEstate');
      setConfirming(false);
      setMessage(null);
    }, []),
  );
  if (!open) return null;

  const offers = sim.realEstate();
  const world = sim.state.world;
  const coins = world.coins;
  const close = () => appBus.emit('openScreen', { screen: null });
  const act = (result: { ok: boolean; reason?: string }, success: string) =>
    setMessage(result.ok ? { text: success, ok: true } : { text: result.reason ?? '', ok: false });

  const moveIn = () => {
    const next = offers.next;
    if (!next) return;
    const result = sim.upgradeHouse(color ?? undefined);
    setConfirming(false);
    act(result, `🎉 Welcome to your ${next.name}!`);
  };

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label="Real Estate">
      <div className={`${common.panel} ${styles.screen}`}>
        <header className={styles.header}>
          <h2 className={styles.title}>
            <span aria-hidden="true">🏡</span> Real Estate
          </h2>
          <span className={styles.count}>🪙 {coins}</span>
          <span className={re.spacer} />
          <button type="button" className={common.iconButton} onClick={close} aria-label="Close">
            ✕
          </button>
        </header>

        {message && (
          <p className={message.ok ? styles.success : styles.refusal} role="status">
            {message.text}
          </p>
        )}

        <section className={re.house} aria-label="Your house">
          <div className={re.tierCard}>
            <span className={re.tierLabel}>Your house</span>
            <strong className={re.tierName} data-testid="house-tier">
              {offers.tier.name}
            </strong>
          </div>
          {offers.next ? (
            <>
              <span className={re.arrow} aria-hidden="true">
                ➜
              </span>
              <div className={`${re.tierCard} ${re.nextCard}`}>
                <span className={re.tierLabel}>Next house</span>
                <strong className={re.tierName}>{offers.next.name}</strong>
                <ul className={re.rows}>
                  {tierRows(offers.tier, offers.next).map((r) => (
                    <li key={r.label}>
                      <span aria-hidden="true">{r.icon}</span> {r.label}: {r.from} →{' '}
                      <strong>{r.to}</strong>
                    </li>
                  ))}
                </ul>
                {!confirming && (
                  <button
                    type="button"
                    className={common.button}
                    aria-disabled={coins < offers.next.cost}
                    onClick={() => {
                      if (coins < offers.next!.cost) {
                        setMessage({ text: 'Not enough coins yet. Keep going!', ok: false });
                        return;
                      }
                      setColor(world.house.exteriorColor);
                      setConfirming(true);
                      setMessage(null);
                    }}
                  >
                    <span aria-hidden="true">🪙</span> Upgrade for {offers.next.cost}
                  </button>
                )}
              </div>
            </>
          ) : (
            <p className={re.maxed}>⭐ You have the grandest house there is!</p>
          )}
        </section>

        {confirming && offers.next && (
          <section className={re.confirm} aria-label="Move in">
            <h3 className={styles.heading}>
              Move to the {offers.next.name}? Pick a color for it: free!
            </h3>
            <Swatches selected={color} onPick={setColor} />
            <p className={styles.note}>All your animals and furniture come too.</p>
            <div className={re.buttons}>
              <button type="button" className={common.button} onClick={moveIn}>
                <span aria-hidden="true">🎉</span> Move in!
              </button>
              <button
                type="button"
                className={`${common.button} ${re.secondary}`}
                onClick={() => setConfirming(false)}
              >
                Not yet
              </button>
            </div>
          </section>
        )}

        <div className={re.extras}>
          <Extra
            icon="🚪"
            name="Extra Room"
            what="+1 animal"
            offer={offers.rooms}
            maxedText="Upgrade your house for more rooms"
            coins={coins}
            onBuy={() => act(sim.buyRoomExpansion(), '🚪 More room for animals!')}
          />
          <Extra
            icon="♥"
            name="Pet Slot"
            what="+1 pet out at once"
            offer={offers.petSlots}
            maxedText="You have every Pet Slot!"
            coins={coins}
            onBuy={() => act(sim.buyPetSlot(), '♥ Another Pet Slot!')}
          />
          <Extra
            icon="📦"
            name="Pet Storage"
            what="+10 resting spaces"
            offer={offers.storage}
            maxedText="Storage is as big as it gets!"
            coins={coins}
            onBuy={() => act(sim.buyStorageExpansion(), '📦 Bigger Pet Storage!')}
          />
        </div>

        <section className={styles.section} aria-label="Paint the house">
          <h3 className={styles.heading}>
            <span aria-hidden="true">🎨</span> Paint the house{' '}
            <span className={styles.count}>🪙 {offers.colorCost}</span>
          </h3>
          <Swatches
            selected={world.house.exteriorColor}
            onPick={(id) => act(sim.changeHouseColor(id), '🎨 Fresh paint!')}
          />
        </section>
      </div>
    </div>
  );
}

function Swatches({ selected, onPick }: { selected: string | null; onPick: (id: string) => void }) {
  return (
    <div className={re.swatches} role="radiogroup" aria-label="House colors">
      {HOUSE_COLORS.map((c) => (
        <button
          key={c.id}
          type="button"
          role="radio"
          aria-checked={selected === c.id}
          aria-label={c.name}
          className={`${re.swatch} ${selected === c.id ? re.swatchOn : ''}`}
          style={{ background: c.color }}
          onClick={() => onPick(c.id)}
        />
      ))}
    </div>
  );
}

function Extra({
  icon,
  name,
  what,
  offer,
  maxedText,
  coins,
  onBuy,
}: {
  icon: string;
  name: string;
  what: string;
  offer: Purchase;
  maxedText: string;
  coins: number;
  onBuy: () => void;
}) {
  return (
    <article className={re.extra} aria-label={name}>
      <span className={re.extraIcon} aria-hidden="true">
        {icon}
      </span>
      <strong>{name}</strong>
      <span className={styles.note}>{what}</span>
      <span className={styles.count} data-testid={`${name}-count`}>
        {offer.bought}/{offer.max}
      </span>
      {offer.nextCost === null ? (
        <span className={re.maxedSmall}>{maxedText}</span>
      ) : (
        <button
          type="button"
          className={`${common.button} ${re.buy}`}
          aria-disabled={coins < offer.nextCost}
          onClick={onBuy}
        >
          <span aria-hidden="true">🪙</span> {offer.nextCost}
        </button>
      )}
    </article>
  );
}
