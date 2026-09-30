import { useCallback, useEffect, useRef, useState } from 'react';
import { GameSession } from '../../bridge/gameSession';
import { connectAudio } from '../../bridge/audioBridge';
import { runSession } from '../../bridge/runSession';
import { makePin } from '../../profile/pin';
import { DeviceManager, sortedProfiles, type DeviceRecord } from '../../save/device';
import { SaveManager, type KeyValueStore } from '../../save/SaveManager';
import { newProfile, type SaveFile } from '../../save/schema';
import { App } from '../App';
import { RotateScreen } from '../RotateScreen';
import { StartupScreen } from '../StartupScreen';
import { DeviceContext, newProfileId, newSalt, type DeviceApi } from './device';
import { Onboarding, type NewPlayer } from './Onboarding';
import { PinSetup } from './PinSetup';
import { ProfilePicker } from './ProfilePicker';
import styles from './Root.module.css';

type Stage =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'pinSetup' }
  | { kind: 'picker' }
  | { kind: 'onboarding' }
  | { kind: 'playing'; session: GameSession };

/**
 * The whole app (DESIGN 17.1): first-run PIN setup, the profile picker, onboarding, and the
 * game for the chosen profile. Owns the device record and starts/stops game sessions.
 */
export function Root({ store }: { store: KeyValueStore }) {
  const [stage, setStage] = useState<Stage>({ kind: 'loading' });
  const [record, setRecord] = useState<DeviceRecord | null>(null);
  const [saves] = useState(() => new SaveManager(store));
  const [device] = useState(() => new DeviceManager(store, saves));
  const recordRef = useRef<DeviceRecord | null>(null);
  const running = useRef<{ session: GameSession; stop: () => void; off: () => void } | null>(null);

  const update = useCallback(
    async (change: (r: DeviceRecord) => void) => {
      const next = structuredClone(recordRef.current!);
      change(next);
      recordRef.current = next;
      setRecord(next);
      await device.save(next);
    },
    [device],
  );

  const afterSetup = useCallback((r: DeviceRecord) => {
    setStage(r.profiles.length > 0 ? { kind: 'picker' } : { kind: 'onboarding' });
  }, []);

  useEffect(() => {
    let cancelled = false;
    device.load().then(
      (r) => {
        if (cancelled) return;
        recordRef.current = r;
        setRecord(r);
        if (!r.pin) setStage({ kind: 'pinSetup' });
        else afterSetup(r);
      },
      (error: unknown) => {
        console.error('Could not load the device record', error);
        if (!cancelled) setStage({ kind: 'error' });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [device, afterSetup]);

  /** Starts a game session for a profile (loading its save, or creating a new player). */
  const play = useCallback(
    async (options: { profileId: string } | { create: NewPlayer }) => {
      setStage({ kind: 'loading' });
      try {
        const session =
          'create' in options
            ? await GameSession.start({
                store,
                create: {
                  profile: newProfile(
                    newProfileId(),
                    options.create.username,
                    options.create.avatar,
                  ),
                  houseColor: options.create.houseColor,
                },
              })
            : await GameSession.start({ store, profileId: options.profileId });
        const summary = () => ({
          id: session.profile.id,
          username: session.profile.username,
          avatar: structuredClone(session.profile.avatar),
          lastPlayedAt: Date.now(),
        });
        await update((r) => {
          r.profiles = [...r.profiles.filter((p) => p.id !== session.profile.id), summary()];
        });
        // Keep the picker's copy of the name and avatar current.
        const off = session.events.on(
          'profileChanged',
          () =>
            void update((r) => {
              r.profiles = r.profiles.map((p) => (p.id === session.profile.id ? summary() : p));
            }),
        );
        const stopRun = runSession(session);
        const stopAudio = connectAudio(session);
        const stop = () => {
          stopAudio();
          stopRun();
        };
        running.current = { session, stop, off };
        setStage({ kind: 'playing', session });
      } catch (error) {
        console.error('Could not start the game', error);
        setStage({ kind: 'error' });
      }
    },
    [store, update],
  );

  /** Stops the running game (saving it unless `save` is false). */
  const stopRunning = useCallback(async (save = true) => {
    const run = running.current;
    running.current = null;
    if (!run) return;
    run.stop();
    run.off();
    if (save) await run.session.stop();
    else run.session.abandon();
  }, []);

  const api: DeviceApi | null = record
    ? {
        record,
        store,
        update,
        switchPlayer: async () => {
          await stopRunning();
          setStage({ kind: 'picker' });
        },
        resetProfile: async (profileId) => {
          const current = running.current?.session.profile.id === profileId;
          const file = current
            ? running.current!.session.toSaveFile()
            : await saves.load(profileId);
          if (!file) return;
          if (current) await stopRunning(false);
          const fresh = await GameSession.start({
            store,
            create: {
              profile: { ...file.profile, tutorial: 'done' },
              houseColor: file.world.house.exteriorColor,
              tutorial: false,
            },
          });
          await fresh.stop();
          if (current) await play({ profileId });
        },
        renameProfile: async (profileId, username) => {
          const run = running.current;
          if (run && run.session.profile.id === profileId) run.session.rename(username);
          else {
            const file = await saves.load(profileId);
            if (file) await saves.save({ ...file, profile: { ...file.profile, username } });
          }
          await update((r) => {
            r.profiles = r.profiles.map((p) => (p.id === profileId ? { ...p, username } : p));
          });
        },
        deleteProfile: async (profileId) => {
          if (running.current?.session.profile.id === profileId) return;
          await saves.delete(profileId);
          await update((r) => {
            r.profiles = r.profiles.filter((p) => p.id !== profileId);
          });
        },
        exportSaves: async () => {
          const out: SaveFile[] = [];
          for (const p of recordRef.current!.profiles) {
            const run = running.current;
            if (run && run.session.profile.id === p.id) out.push(run.session.toSaveFile());
            else {
              const file = await saves.load(p.id).catch(() => undefined);
              if (file) out.push(file);
            }
          }
          return out;
        },
        importSaves: async (files) => {
          // The imported saves replace whatever is there, including the game being played.
          await stopRunning(false);
          for (const file of files) await saves.save(file);
          await update((r) => {
            for (const file of files) {
              const summary = {
                id: file.profile.id,
                username: file.profile.username,
                avatar: file.profile.avatar,
                lastPlayedAt: file.meta.lastSeenAt,
              };
              r.profiles = [...r.profiles.filter((p) => p.id !== file.profile.id), summary];
            }
          });
          setStage({ kind: 'picker' });
        },
      }
    : null;

  return (
    <>
      {renderStage()}
      {/* Landscape only (DESIGN 2), on every screen. */}
      <RotateScreen />
    </>
  );

  function renderStage() {
    let content;
    switch (stage.kind) {
      case 'loading':
        return <StartupScreen />;
      case 'error':
        return <StartupScreen error />;
      case 'pinSetup':
        content = (
          <PinSetup
            onDone={async (pin) => {
              await update((r) => (r.pin = makePin(pin, newSalt())));
              afterSetup(recordRef.current!);
            }}
          />
        );
        break;
      case 'picker':
        content = (
          <ProfilePicker
            profiles={sortedProfiles(record!)}
            onPick={(id) => void play({ profileId: id })}
            onNew={() => setStage({ kind: 'onboarding' })}
          />
        );
        break;
      case 'onboarding':
        content = (
          <Onboarding
            takenNames={record!.profiles.map((p) => p.username)}
            onDone={(player) => void play({ create: player })}
            {...(record!.profiles.length > 0
              ? { onCancel: () => setStage({ kind: 'picker' }) }
              : {})}
          />
        );
        break;
      case 'playing':
        return (
          <DeviceContext.Provider value={api}>
            <App key={stage.session.profile.id} session={stage.session} />
          </DeviceContext.Provider>
        );
    }
    return <div className={styles.screen}>{content}</div>;
  }
}
