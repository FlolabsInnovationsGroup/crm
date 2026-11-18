import { type DocumentNode } from '@apollo/client';
import { useMutation } from '@apollo/client/react';
import { useToast } from 'twenty-ui/components/feedback';

import { getToastOptionsFromError } from '@/error-handler/utils/getToastOptionsFromError';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';

// Runs a campaign mutation, toasts the outcome and reports success.
export const useCampaignMutation = (mutation: DocumentNode) => {
  const apolloCoreClient = useApolloCoreClient();
  const { enqueueToast } = useToast();
  const [runMutation, { loading }] = useMutation(mutation, {
    client: apolloCoreClient,
  });

  const run = async (
    variables: Record<string, unknown>,
    successMessage: string,
  ): Promise<boolean> => {
    try {
      await runMutation({ variables });
      enqueueToast({ status: 'success', children: successMessage });

      return true;
    } catch (error) {
      enqueueToast(getToastOptionsFromError({ error }));

      return false;
    }
  };

  return { run, loading };
};
