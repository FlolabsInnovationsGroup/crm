import { useStore } from 'jotai';
import { useCallback } from 'react';

import { mySenderConnectedAccountsState } from '@/accounts/states/mySenderConnectedAccountsState';
import { findFirstConnectedAccountAbleToSendEmail } from '@/accounts/utils/findFirstConnectedAccountAbleToSendEmail';
import { useOpenComposeEmailInSidePanel } from '@/side-panel/hooks/useOpenComposeEmailInSidePanel';
import { isDefined } from 'twenty-shared/utils';
import { openUrlInNewTab } from '~/utils/openUrlInNewTab';

export const useOpenEmailInAppOrFallback = () => {
  const store = useStore();
  const { openComposeEmailInSidePanel } = useOpenComposeEmailInSidePanel();

  const openEmail = useCallback(
    (email: string) => {
      const connectedAccount = findFirstConnectedAccountAbleToSendEmail(
        store.get(mySenderConnectedAccountsState.atom) ?? [],
      );

      if (isDefined(connectedAccount)) {
        openComposeEmailInSidePanel({
          connectedAccountId: connectedAccount.id,
          defaultTo: email,
        });

        return;
      }

      openUrlInNewTab(`mailto:${email}`);
    },
    [store, openComposeEmailInSidePanel],
  );

  return { openEmail };
};
