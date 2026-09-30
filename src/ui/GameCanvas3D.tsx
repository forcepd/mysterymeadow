import { useCallback, useEffect, useRef, useState } from 'react';
import { appBus } from '../bridge/appBus';
import type {} from '../world3d/testHooks';
import { World3D } from '../world3d/World3D';
import common from './common.module.css';
import styles from './GameCanvas.module.css';
import { useSession } from './session';
import { useAppEvent } from './useAppEvent';

/** Hosts the Three.js world underneath the React overlay (the `?3d` renderer). */
export default function GameCanvas3D() {
  const session = useSession();
  const hostRef = useRef<HTMLDivElement>(null);
  const [atHome, setAtHome] = useState(true);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const world = new World3D(host, session);
    window.meadow3d = {
      projectObject: (kind, id) => world.projectObject(kind, id),
      projectWorld: (p, height) => world.projectWorld(p, height),
      view: () => world.view(),
      stats: () => world.stats(),
      particles: () => world.particles(),
    };
    let taps = 0;
    const offs = [
      appBus.on('canvasTap', () => host.setAttribute('data-canvas-taps', String(++taps))),
      appBus.on('worldReady', () => host.setAttribute('data-world-ready', 'true')),
      appBus.on('sceneChanged', ({ scene }) => host.setAttribute('data-scene', scene)),
      // The Vet Clinic scene arrives in Phase 3D-5. Until then the clinic panel still opens
      // over the world, and closing it goes back to the zone that was showing.
      appBus.on('openVet', () => appBus.emit('sceneChanged', { scene: 'vet' })),
      appBus.on('closeVet', () => appBus.emit('sceneChanged', { scene: world.view().zone })),
    ];
    return () => {
      offs.forEach((off) => off());
      delete window.meadow3d;
      world.destroy();
      host.removeAttribute('data-world-ready');
    };
  }, [session]);

  useAppEvent(
    'viewChanged',
    useCallback(({ atHome }) => setAtHome(atHome), []),
  );
  // Like the ⚙️ button, step aside while decorating (the tray) and in the Vet Clinic.
  const [decorating, setDecorating] = useState(false);
  const [inVet, setInVet] = useState(false);
  useAppEvent(
    'decorate',
    useCallback(({ on }) => setDecorating(on), []),
  );
  useAppEvent(
    'sceneChanged',
    useCallback(({ scene }) => setInVet(scene === 'vet'), []),
  );

  return (
    <>
      <div
        ref={hostRef}
        className={styles.host}
        data-testid="game-canvas"
        data-renderer="3d"
        data-canvas-taps="0"
        data-scene="yard"
      />
      <button
        type="button"
        className={`${common.iconButton} ${styles.resetView}`}
        aria-label="Reset view"
        data-testid="reset-view"
        hidden={atHome || decorating || inVet}
        onClick={() => appBus.emit('resetView', undefined)}
      >
        🎥
      </button>
    </>
  );
}
