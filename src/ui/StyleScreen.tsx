import { audio } from '../audio/AudioEngine';
import { useCallback, useState } from 'react';
import { appBus } from '../bridge/appBus';
import { getAvatarItem } from '../config/avatarItems';
import { isValidLoadout, owns, wornItems, type AvatarLoadout } from '../profile/avatar';
import { AvatarStudio } from './AvatarStudio';
import { AvatarView } from './AvatarView';
import common from './common.module.css';
import { GemGrant } from './GemGrant';
import { PinGate } from './PinGate';
import styles from './Screens.module.css';
import style from './StyleScreen.module.css';
import { useSim } from './session';
import { useAppEvent } from './useAppEvent';

type Tab = 'wardrobe' | 'boutique';

/**
 * Wardrobe and Boutique (DESIGN 13.3, 17.1 #9-10). The Wardrobe changes outfits for free with
 * owned items and keeps 3 favorites; the Boutique sells more for gems with a live try-on.
 * "Get Gems" asks a grown-up (PIN), who grants gems (DESIGN 20).
 */
export function StyleScreen() {
  const session = useSim();
  const { sim, profile } = session;
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('wardrobe');
  const [draft, setDraft] = useState<AvatarLoadout>(profile.avatar);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [gems, setGems] = useState<'closed' | 'pin' | 'grant'>('closed');

  useAppEvent(
    'openScreen',
    useCallback(
      ({ screen }) => {
        setOpen(screen === 'style');
        setDraft(session.profile.avatar);
        setMessage(null);
        setGems('closed');
        setTab('wardrobe');
      },
      [session],
    ),
  );
  if (!open) return null;

  const close = () => appBus.emit('openScreen', { screen: null });
  const owned = profile.ownedAvatarItems;
  const tryingOn = wornItems(draft)
    .filter((id) => !owns(owned, id))
    .map((id) => getAvatarItem(id)!);
  const changed = JSON.stringify(draft) !== JSON.stringify(profile.avatar);

  const wear = () => {
    const result = session.wear(draft);
    setMessage(
      result.ok ? { text: '✨ Looking great!', ok: true } : { text: result.reason, ok: false },
    );
  };

  const buy = (itemId: string) => {
    const result = session.buyAvatarItem(itemId);
    if (!result.ok) {
      setMessage({ text: result.reason, ok: false });
      return;
    }
    audio.play('purchase');
    setMessage({ text: `💎 It’s yours: ${getAvatarItem(itemId)!.name}!`, ok: true });
    // Wear the try-on right away once everything in it is owned.
    if (isValidLoadout(draft, session.profile.ownedAvatarItems)) session.wear(draft);
  };

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label="My style">
      <div className={`${common.panel} ${styles.screen}`}>
        <header className={styles.header}>
          <div className={style.tabs} role="tablist">
            {(['wardrobe', 'boutique'] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                className={tab === t ? style.tabOn : style.tab}
                onClick={() => {
                  setTab(t);
                  setDraft(session.profile.avatar);
                  setMessage(null);
                }}
              >
                {t === 'wardrobe' ? '👗 Wardrobe' : '🛍️ Boutique'}
              </button>
            ))}
          </div>
          <span className={styles.count} data-testid="style-gems">
            💎 {sim.state.world.gems}
          </span>
          <button type="button" className={common.iconButton} onClick={close} aria-label="Close">
            ✕
          </button>
        </header>

        {gems !== 'closed' ? (
          <section className={style.gems} aria-label="Get gems">
            {gems === 'pin' ? (
              <PinGate
                title="Ask a grown-up! 💎"
                onUnlock={() => setGems('grant')}
                onCancel={() => setGems('closed')}
              />
            ) : (
              <>
                <h3 className={styles.heading}>How many gems?</h3>
                <GemGrant />
                <button type="button" className={common.button} onClick={() => setGems('closed')}>
                  Done
                </button>
              </>
            )}
          </section>
        ) : (
          <>
            <AvatarStudio
              mode={tab}
              loadout={draft}
              owned={owned}
              onChange={(l) => {
                setDraft(l);
                setMessage(null);
              }}
            />

            {tab === 'wardrobe' ? (
              <div className={style.bar}>
                <button
                  type="button"
                  className={common.button}
                  aria-disabled={!changed}
                  onClick={wear}
                >
                  ✓ Wear it
                </button>
                <div className={style.outfits} aria-label="Favorite outfits">
                  {profile.savedOutfits.map((outfit, i) => (
                    <div key={i} className={style.outfit}>
                      {outfit ? (
                        <button
                          type="button"
                          className={style.outfitWear}
                          aria-label={`Wear favorite ${i + 1}`}
                          onClick={() => {
                            const r = session.wearOutfit(i);
                            if (r.ok) setDraft(outfit);
                          }}
                        >
                          <AvatarView loadout={outfit} height={70} />
                        </button>
                      ) : (
                        <span className={style.empty}>Empty</span>
                      )}
                      <button
                        type="button"
                        className={style.saveHere}
                        onClick={() => {
                          session.saveOutfit(i);
                          setMessage({ text: `⭐ Saved as favorite ${i + 1}`, ok: true });
                        }}
                      >
                        ⭐ Save {i + 1}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className={style.bar}>
                {tryingOn.length === 0 ? (
                  <p className={styles.hint}>Tap anything to try it on!</p>
                ) : (
                  tryingOn.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={common.button}
                      aria-disabled={sim.state.world.gems < item.cost}
                      onClick={() => buy(item.id)}
                    >
                      Buy {item.name} 💎{item.cost}
                    </button>
                  ))
                )}
                <span className={style.spacer} />
                <button
                  type="button"
                  className={`${common.button} ${style.getGems}`}
                  onClick={() => setGems('pin')}
                >
                  💎 Get Gems
                </button>
              </div>
            )}
          </>
        )}

        {message && (
          <p className={message.ok ? styles.success : styles.refusal} role="status">
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}
