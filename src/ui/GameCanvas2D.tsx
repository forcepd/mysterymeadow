import { useEffect, useRef } from 'react';
import { appBus } from '../bridge/appBus';
import { createGame } from '../game/createGame';
import styles from './GameCanvas.module.css';
import { useSession } from './session';

const ZONE_SCENES = { yard: 'Yard', house: 'House' } as const;

/** Hosts the original Phaser canvas underneath the React overlay (the classic 2D world). */
export default function GameCanvas2D() {
  const session = useSession();
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const game = createGame(host, session);
    // Counts world taps on the host element, so tests can prove UI taps don't fall through.
    let taps = 0;
    // Phaser converts taps using a cached copy of where the canvas sits on the page. That copy
    // can be stale (the centered canvas moves after boot, the window resizes, the iPad rotates),
    // which made first taps land off target by the letterbox margin. Re-read the canvas position
    // at the start of every press (capture phase, so before Phaser's own listener) and on resize.
    const remeasure = () => game.scale.refresh();
    const updateBounds = () => game.scale.updateBounds();
    const pressEvents = ['pointerdown', 'mousedown', 'touchstart'] as const;
    for (const type of pressEvents) {
      host.addEventListener(type, updateBounds, { capture: true, passive: true });
    }
    const observer = new ResizeObserver(remeasure);
    observer.observe(host);
    let zoneScene: 'Yard' | 'House' = 'Yard';
    const offs = [
      appBus.on('canvasTap', () => host.setAttribute('data-canvas-taps', String(++taps))),
      appBus.on('worldReady', () => {
        remeasure();
        host.setAttribute('data-world-ready', 'true');
      }),
      // Yard <-> House: the one not showing sleeps (keeps its sprites, ignores taps).
      appBus.on('showZone', ({ zone }) => {
        const next = ZONE_SCENES[zone];
        if (next === zoneScene) return;
        game.scene.sleep(zoneScene);
        zoneScene = next;
        // run() starts it the first time, and wakes it after that.
        game.scene.run(zoneScene);
        if (zone === 'house') appBus.emit('sceneChanged', { scene: 'house' });
      }),
      // Vet Clinic: the current zone sleeps while the clinic shows.
      appBus.on('openVet', ({ animalId }) => {
        game.scene.stop('Vet');
        game.scene.sleep(zoneScene);
        game.scene.start('Vet', { animalId });
      }),
      appBus.on('closeVet', () => {
        game.scene.stop('Vet');
        game.scene.wake(zoneScene);
        appBus.emit('sceneChanged', { scene: zoneScene === 'Yard' ? 'yard' : 'house' });
      }),
      appBus.on('sceneChanged', ({ scene }) => host.setAttribute('data-scene', scene)),
    ];
    return () => {
      for (const type of pressEvents)
        host.removeEventListener(type, updateBounds, { capture: true });
      observer.disconnect();
      offs.forEach((off) => off());
      game.destroy(true);
    };
  }, [session]);

  return (
    <div
      ref={hostRef}
      className={styles.host}
      data-testid="game-canvas"
      data-canvas-taps="0"
      data-scene="yard"
    />
  );
}
