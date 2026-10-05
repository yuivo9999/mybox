import { useSyncExternalStore } from 'react';
import { sessionStateStore } from './sessionStateStore.js';

export function useSessionState() {
  return useSyncExternalStore(
    sessionStateStore.subscribe,
    sessionStateStore.getSnapshot,
    sessionStateStore.getSnapshot,
  );
}
