import { useCallback, useRef, useState, type ChangeEvent } from 'react';
import { appBus } from '../bridge/appBus';
import { BALANCE } from '../config/balance';
import { makePin } from '../profile/pin';
import { checkUsername } from '../profile/username';
import { backupFileName, makeBackup, readBackup } from '../save/backup';
import type { SaveFile } from '../save/schema';
import { AvatarView } from './AvatarView';
import common from './common.module.css';
import { GemGrant } from './GemGrant';
import { PinGate } from './PinGate';
import { newSalt, useDevice } from './root/device';
import { PinSetup } from './root/PinSetup';
import styles from './Screens.module.css';
import s from './SettingsScreen.module.css';
import { useSim } from './session';
import { useAppEvent } from './useAppEvent';

type View = 'settings' | 'pin' | 'parent';

/**
 * Settings (DESIGN 17.1 #13) for the kid, and behind the Parent PIN, Parent Mode (DESIGN 20):
 * gems, recent activity, game settings, players, backups, and the PIN.
 */
export function SettingsScreen() {
  const { sim } = useSim();
  const device = useDevice();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('settings');
  useAppEvent(
    'openScreen',
    useCallback(({ screen }) => {
      setOpen(screen === 'settings');
      setView('settings');
    }, []),
  );
  if (!open) return null;
  const close = () => appBus.emit('openScreen', { screen: null });
  const settings = sim.state.world.settings;

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label="Settings">
      <div className={`${common.panel} ${styles.screen}`}>
        <header className={styles.header}>
          <h2 className={styles.title}>{view === 'parent' ? '🔒 Parent Mode' : '⚙️ Settings'}</h2>
          <button type="button" className={common.iconButton} onClick={close} aria-label="Close">
            ✕
          </button>
        </header>

        {view === 'settings' && (
          <>
            <Toggle
              label="🔇 All sounds off"
              checked={settings.muted}
              onChange={(v) => sim.updateSettings({ muted: v })}
            />
            <Slider
              label="🎵 Music"
              value={settings.musicVolume}
              disabled={settings.muted}
              onChange={(v) => sim.updateSettings({ musicVolume: v })}
            />
            <Slider
              label="🔊 Sounds"
              value={settings.sfxVolume}
              disabled={settings.muted}
              onChange={(v) => sim.updateSettings({ sfxVolume: v })}
            />
            <Toggle
              label="🐢 Less motion (calmer animations)"
              checked={settings.reducedMotion}
              onChange={(v) => sim.updateSettings({ reducedMotion: v })}
            />
            <div className={s.buttons}>
              <button
                type="button"
                className={common.button}
                onClick={() => void device.switchPlayer()}
              >
                👥 Switch player
              </button>
              <button
                type="button"
                className={`${common.button} ${s.secondary}`}
                onClick={() => setView('pin')}
              >
                🔒 Parent Mode
              </button>
            </div>
          </>
        )}

        {view === 'pin' && (
          <PinGate
            title="Parent Mode"
            onUnlock={() => setView('parent')}
            onCancel={() => setView('settings')}
          />
        )}

        {view === 'parent' && <ParentMode />}
      </div>
    </div>
  );
}

/** A 0..1 volume shown as 0..10 steps, big enough for small fingers. */
function Slider({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  const steps = Math.round(value * 10);
  return (
    <label className={s.slider}>
      <span>{label}</span>
      <input
        type="range"
        min={0}
        max={10}
        step={1}
        value={steps}
        disabled={disabled}
        aria-valuetext={steps === 0 ? 'Off' : `${steps} of 10`}
        onChange={(e) => onChange(Number(e.target.value) / 10)}
      />
      <span className={s.sliderValue} aria-hidden="true">
        {steps === 0 ? 'Off' : steps}
      </span>
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className={s.toggle}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function ParentMode() {
  const session = useSim();
  const { sim } = session;
  const device = useDevice();
  const settings = sim.state.world.settings;
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [confirm, setConfirm] = useState<{ text: string; run: () => Promise<void> } | null>(null);
  const [pendingImport, setPendingImport] = useState<SaveFile[] | null>(null);
  const [changingPin, setChangingPin] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const currentId = session.profile.id;

  const say = (text: string, ok = true) => setMessage({ text, ok });

  const exportBackup = async () => {
    const files = await device.exportSaves();
    const blob = new Blob([JSON.stringify(makeBackup(files, Date.now()))], {
      type: 'application/json',
    });
    // A local download: nothing leaves the device except as a file the grown-up saves.
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = backupFileName(Date.now());
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    say(`💾 Saved a backup of ${files.length} player${files.length === 1 ? '' : 's'}.`);
  };

  const importFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setPendingImport(readBackup(await file.text()));
      setMessage(null);
    } catch (error) {
      say(error instanceof Error ? error.message : 'That file didn’t work.', false);
    }
  };

  const rename = async (id: string) => {
    const taken = device.record.profiles.filter((p) => p.id !== id).map((p) => p.username);
    const check = checkUsername(newName, taken);
    if (!check.ok) {
      say(check.reason, false);
      return;
    }
    await device.renameProfile(id, check.name);
    setRenaming(null);
    say(`✏️ Renamed to ${check.name}.`);
  };

  if (changingPin) {
    return (
      <PinSetup
        title="Pick a new Parent PIN"
        onCancel={() => setChangingPin(false)}
        onDone={async (pin) => {
          await device.update((r) => (r.pin = makePin(pin, newSalt())));
          setChangingPin(false);
          say('🔑 The Parent PIN was changed.');
        }}
      />
    );
  }

  return (
    <div className={s.parent}>
      {message && (
        <p className={message.ok ? styles.success : styles.refusal} role="status">
          {message.text}
        </p>
      )}
      {confirm && (
        <div className={s.confirm} role="alertdialog" aria-label="Are you sure?">
          <p>{confirm.text}</p>
          <div className={s.buttons}>
            <button
              type="button"
              className={common.button}
              onClick={async () => {
                const run = confirm.run;
                setConfirm(null);
                await run();
              }}
            >
              Yes
            </button>
            <button
              type="button"
              className={`${common.button} ${s.secondary}`}
              onClick={() => setConfirm(null)}
            >
              No
            </button>
          </div>
        </div>
      )}

      <section className={s.section} aria-label="Gems">
        <h3 className={styles.heading}>💎 Give {session.profile.username} gems</h3>
        <p className={styles.note}>Gems buy avatar clothes and looks in the Boutique.</p>
        <GemGrant />
      </section>

      <section className={s.section} aria-label="Game settings">
        <h3 className={styles.heading}>🎮 Game settings</h3>
        <Toggle
          label="⏳ Things keep going while away (visitors, babies, timers)"
          checked={settings.offlineProgress}
          onChange={(v) => sim.updateSettings({ offlineProgress: v })}
        />
        <Toggle
          label="🤒 Animals can get sick"
          checked={settings.sicknessEnabled}
          onChange={(v) => sim.updateSettings({ sicknessEnabled: v })}
        />
        <label className={s.number}>
          <span>🎓 Most gems a day from tricks</span>
          <input
            type="number"
            min={0}
            max={BALANCE.tricks.dailyGemCap * 5}
            value={settings.dailyTrickGemCap}
            onChange={(e) => {
              const v = Math.max(
                0,
                Math.min(BALANCE.tricks.dailyGemCap * 5, Math.round(Number(e.target.value) || 0)),
              );
              sim.updateSettings({ dailyTrickGemCap: v });
            }}
          />
        </label>
      </section>

      <section className={s.section} aria-label="Recent activity">
        <h3 className={styles.heading}>📜 Recent activity</h3>
        {session.activity.length === 0 ? (
          <p className={styles.note}>Nothing yet.</p>
        ) : (
          <ul className={s.activity}>
            {session.activity.slice(0, 20).map((a, i) => (
              <li key={i}>
                <span className={s.when}>
                  {new Date(a.at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                </span>{' '}
                <span aria-hidden="true">{a.icon}</span> {a.text}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={s.section} aria-label="Players">
        <h3 className={styles.heading}>👥 Players</h3>
        <ul className={s.players}>
          {device.record.profiles.map((p) => (
            <li key={p.id} className={s.player}>
              <AvatarView loadout={p.avatar} height={56} />
              {renaming === p.id ? (
                <form
                  className={s.renameForm}
                  onSubmit={(e) => {
                    e.preventDefault();
                    void rename(p.id);
                  }}
                >
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    aria-label={`New name for ${p.username}`}
                    maxLength={16}
                    autoFocus
                  />
                  <button type="submit" className={s.small}>
                    Save
                  </button>
                  <button type="button" className={s.small} onClick={() => setRenaming(null)}>
                    Cancel
                  </button>
                </form>
              ) : (
                <>
                  <strong className={s.playerName}>
                    {p.username}
                    {p.id === currentId && ' (playing now)'}
                  </strong>
                  <button
                    type="button"
                    className={s.small}
                    onClick={() => {
                      setRenaming(p.id);
                      setNewName(p.username);
                    }}
                  >
                    ✏️ Rename
                  </button>
                  <button
                    type="button"
                    className={s.small}
                    onClick={() =>
                      setConfirm({
                        text: `Start ${p.username}'s meadow over? Their animals, coins, and house go away. Their name and look stay.`,
                        run: async () => {
                          await device.resetProfile(p.id);
                          say(`🌱 ${p.username} has a fresh meadow.`);
                        },
                      })
                    }
                  >
                    🌱 Reset
                  </button>
                  {p.id !== currentId && (
                    <button
                      type="button"
                      className={s.small}
                      onClick={() =>
                        setConfirm({
                          text: `Delete ${p.username} and everything in their meadow? This can’t be undone.`,
                          run: async () => {
                            await device.deleteProfile(p.id);
                            say(`🗑️ ${p.username} was deleted.`);
                          },
                        })
                      }
                    >
                      🗑️ Delete
                    </button>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className={s.section} aria-label="Backups">
        <h3 className={styles.heading}>💾 Backups</h3>
        <p className={styles.note}>
          Save a backup file of every player on this device, and load it again later (for example
          after clearing the browser). It stays on your device.
        </p>
        {pendingImport ? (
          <div className={s.confirm}>
            <p>
              Load {pendingImport.map((f) => f.profile.username).join(', ')} from the backup? A
              player with the same name here is replaced.
            </p>
            <div className={s.buttons}>
              <button
                type="button"
                className={common.button}
                onClick={() => {
                  const files = pendingImport;
                  setPendingImport(null);
                  void device.importSaves(files);
                }}
              >
                Load backup
              </button>
              <button
                type="button"
                className={`${common.button} ${s.secondary}`}
                onClick={() => setPendingImport(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className={s.buttons}>
            <button type="button" className={common.button} onClick={() => void exportBackup()}>
              ⬇️ Save a backup
            </button>
            <button
              type="button"
              className={`${common.button} ${s.secondary}`}
              onClick={() => fileInput.current?.click()}
            >
              ⬆️ Load a backup
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              hidden
              aria-label="Backup file"
              onChange={(e) => void importFile(e)}
            />
          </div>
        )}
      </section>

      <section className={s.section} aria-label="Parent PIN">
        <h3 className={styles.heading}>🔑 Parent PIN</h3>
        <button
          type="button"
          className={`${common.button} ${s.secondary}`}
          onClick={() => setChangingPin(true)}
        >
          Change the PIN
        </button>
      </section>
    </div>
  );
}
