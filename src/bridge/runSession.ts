import { BALANCE } from '../config/balance';
import type { GameSession } from './gameSession';

/** Drives a session from the browser: frames, page visibility, and autosave. Returns a stop function. */
export function runSession(session: GameSession): () => void {
  let raf = requestAnimationFrame(function loop() {
    session.frame();
    raf = requestAnimationFrame(loop);
  });

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') void session.hidden();
    else session.visible();
  };
  const onPageHide = () => void session.hidden();
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide);

  const autosave = setInterval(() => {
    if (document.visibilityState === 'visible') void session.autosave();
  }, BALANCE.save.autosaveSeconds * 1000);

  return () => {
    cancelAnimationFrame(raf);
    clearInterval(autosave);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', onPageHide);
  };
}
