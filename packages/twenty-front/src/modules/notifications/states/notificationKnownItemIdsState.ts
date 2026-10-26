import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

export const notificationKnownItemIdsState = createAtomState<string[] | null>({
  key: 'notificationKnownItemIdsState',
  defaultValue: null,
});
