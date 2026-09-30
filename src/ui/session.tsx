import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import type { GameSession } from '../bridge/gameSession';

const SessionContext = createContext<GameSession | null>(null);

export function SessionProvider({
  session,
  children,
}: {
  session: GameSession;
  children: ReactNode;
}) {
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export function useSession(): GameSession {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession must be used inside <SessionProvider>');
  return session;
}

/**
 * Re-renders whenever the sim state may have changed (at most once per sim tick or command),
 * and returns the session for reading state.
 */
export function useSim(): GameSession {
  const session = useSession();
  useSyncExternalStore(session.subscribe, () => session.version);
  return session;
}
