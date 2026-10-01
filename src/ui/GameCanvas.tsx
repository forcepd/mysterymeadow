import { lazy, Suspense } from 'react';
import { useWorldStyle } from './worldStyle';

// Each world loads only when it's chosen: the 3D game never downloads Phaser, and the classic
// 2D game never downloads Three.js.
const GameCanvas3D = lazy(() => import('./GameCanvas3D'));
const GameCanvas2D = lazy(() => import('./GameCanvas2D'));

/** The world under the React overlay: 3D by default, or the classic 2D world (`?2d`/Settings). */
export function GameCanvas() {
  const style = useWorldStyle();
  return (
    <Suspense fallback={null}>{style === '3d' ? <GameCanvas3D /> : <GameCanvas2D />}</Suspense>
  );
}
