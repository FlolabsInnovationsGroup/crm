import { isDefined } from 'twenty-shared/utils';

import { mySenderConnectedAccountsState } from '@/accounts/states/mySenderConnectedAccountsState';
import { findFirstConnectedAccountAbleToSendEmail } from '@/accounts/utils/findFirstConnectedAccountAbleToSendEmail';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';

export const useFirstConnectedAccount = () => {
  const mySenderConnectedAccounts = useAtomStateValue(
    mySenderConnectedAccountsState,
  );

  const firstAccount = findFirstConnectedAccountAbleToSendEmail(
    mySenderConnectedAccounts ?? [],
  );

  return {
    connectedAccountId: firstAccount?.id ?? null,
    connectedAccountHandle: firstAccount?.handle ?? null,
    loading: !isDefined(mySenderConnectedAccounts),
  };
};
