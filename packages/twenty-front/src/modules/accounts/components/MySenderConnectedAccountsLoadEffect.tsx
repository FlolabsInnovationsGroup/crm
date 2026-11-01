import { useQuery } from '@apollo/client/react';
import { useEffect } from 'react';
import { isDefined } from 'twenty-shared/utils';

import { GET_MY_SENDER_CONNECTED_ACCOUNTS } from '@/accounts/graphql/queries/getMySenderConnectedAccounts';
import { mySenderConnectedAccountsState } from '@/accounts/states/mySenderConnectedAccountsState';
import { type SenderConnectedAccount } from '@/accounts/types/SenderConnectedAccount';
import { useIsLogged } from '@/auth/hooks/useIsLogged';
import { useIsOnAuthOrOnboardingPage } from '@/auth/hooks/useIsOnAuthOrOnboardingPage';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';

export const MySenderConnectedAccountsLoadEffect = () => {
  const isLogged = useIsLogged();
  const isOnAuthOrOnboardingPage = useIsOnAuthOrOnboardingPage();
  const setMySenderConnectedAccounts = useSetAtomState(
    mySenderConnectedAccountsState,
  );

  const { data, error } = useQuery<{
    mySenderConnectedAccounts: SenderConnectedAccount[];
  }>(GET_MY_SENDER_CONNECTED_ACCOUNTS, {
    skip: !isLogged || isOnAuthOrOnboardingPage,
  });

  useEffect(() => {
    if (isDefined(data?.mySenderConnectedAccounts)) {
      setMySenderConnectedAccounts(data.mySenderConnectedAccounts);

      return;
    }

    if (isDefined(error)) {
      setMySenderConnectedAccounts([]);
    }
  }, [data, error, setMySenderConnectedAccounts]);

  return null;
};
