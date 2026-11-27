import { type DocumentNode } from '@apollo/client';
import { useMutation } from '@apollo/client/react';
import { useToast } from 'twenty-ui/components/feedback';

import { getToastOptionsFromError } from '@/error-handler/utils/getToastOptionsFromError';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';

// Runs an agreement mutation and toasts a failure; null means it failed.
export const useAgreementMutation = <TData>(mutation: DocumentNode) => {
  const apolloCoreClient = useApolloCoreClient();
  const { enqueueToast } = useToast();
  const [runMutation, { loading }] = useMutation<TData>(mutation, {
    client: apolloCoreClient,
  });

  const run = async (
    variables: Record<string, unknown>,
  ): Promise<TData | null> => {
    try {
      const { data } = await runMutation({ variables });

      return data ?? null;
    } catch (error) {
      enqueueToast(getToastOptionsFromError({ error }));

      return null;
    }
  };

  return { run, loading };
};
