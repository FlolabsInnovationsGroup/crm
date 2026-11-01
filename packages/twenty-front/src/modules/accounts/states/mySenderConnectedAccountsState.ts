import { type SenderConnectedAccount } from '@/accounts/types/SenderConnectedAccount';
import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

export const mySenderConnectedAccountsState = createAtomState<
  SenderConnectedAccount[] | null
>({
  key: 'mySenderConnectedAccountsState',
  defaultValue: null,
});
