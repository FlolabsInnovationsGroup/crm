import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

// Per browser: when the notifications page was last opened, and the time
// before that, so the page can still highlight what was new on arrival.
export const notificationsSeenState = createAtomState<{
  seenAt: string | null;
  previousSeenAt: string | null;
}>({
  key: 'notificationsSeenState',
  defaultValue: { seenAt: null, previousSeenAt: null },
  useLocalStorage: true,
  localStorageOptions: { getOnInit: true },
});
