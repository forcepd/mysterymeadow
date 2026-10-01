import { lazy, Suspense, type ReactNode } from 'react';
import type { GameSession } from '../bridge/gameSession';
import { AnimalCard } from './AnimalCard';
import { AwayCard } from './AwayCard';
import { BirthdayGreeting } from './BirthdayGreeting';
import { DailyGift } from './DailyGift';
import { DecorateBar } from './DecorateBar';
import { DexScreen } from './DexScreen';
import styles from './App.module.css';
import { GameCanvas } from './GameCanvas';
import { GoalsScreen } from './GoalsScreen';
import { HomeStore } from './HomeStore';
import { Hud } from './Hud';
import { PetsScreen } from './PetsScreen';
import { RealEstate } from './RealEstate';
import { SettingsScreen } from './SettingsScreen';
import { StyleScreen } from './StyleScreen';
import { TutorialCoach } from './TutorialCoach';
import { TrainingScreen } from './TrainingScreen';
import { PetWardrobe } from './PetWardrobe';
import { SessionProvider, useSim } from './session';
import { Toasts } from './Toasts';
import { VetClinic } from './VetClinic';

// Dev builds only: `import.meta.env.DEV` is false in production, so the panel is never bundled.
const DebugPanel = import.meta.env.DEV ? lazy(() => import('../dev/DebugPanel')) : null;

export function App({ session }: { session: GameSession }) {
  return (
    <SessionProvider session={session}>
      <AppFrame>
        <GameCanvas />
        <Hud />
        <AnimalCard />
        <VetClinic />
        <PetsScreen />
        <DexScreen />
        <DecorateBar />
        <HomeStore />
        <RealEstate />
        <StyleScreen />
        <SettingsScreen />
        <TrainingScreen />
        <PetWardrobe />
        <GoalsScreen />
        <TutorialCoach />
        <Toasts />
        <AwayCard />
        <BirthdayGreeting />
        <DailyGift />
        {DebugPanel && (
          <Suspense fallback={null}>
            <DebugPanel />
          </Suspense>
        )}
      </AppFrame>
    </SessionProvider>
  );
}

/** The app's root box. Carries the in-game "Less motion" setting down to the CSS. */
function AppFrame({ children }: { children: ReactNode }) {
  const { sim } = useSim();
  return (
    <div
      className={styles.app}
      data-reduced-motion={sim.state.world.settings.reducedMotion ? 'true' : 'false'}
    >
      {children}
    </div>
  );
}
