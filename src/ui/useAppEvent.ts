import { useEffect } from 'react';
import { appBus, type AppEvents } from '../bridge/appBus';

export function useAppEvent<K extends keyof AppEvents>(
  event: K,
  listener: (payload: AppEvents[K]) => void,
): void {
  useEffect(() => appBus.on(event, listener), [event, listener]);
}
