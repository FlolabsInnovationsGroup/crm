import { type OperationVariables } from '@apollo/client';
import { useQuery } from '@apollo/client/react';
import { type DocumentNode } from 'graphql';

import { isCrmAnalyticsForbiddenError } from '@/crm-analytics/utils/isCrmAnalyticsForbiddenError';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';

type CrmAnalyticsQueryData = Record<string, { payload: unknown }>;

type UseCrmAnalyticsQueryArgs = {
  query: DocumentNode;
  rootField: string;
  variables?: OperationVariables;
};

// `payload` is undefined until the first response, and null when analytics is switched off.
export const useCrmAnalyticsQuery = <TPayload>({
  query,
  rootField,
  variables,
}: UseCrmAnalyticsQueryArgs) => {
  const apolloCoreClient = useApolloCoreClient();

  const { data, previousData, loading, error, refetch } =
    useQuery<CrmAnalyticsQueryData>(query, {
      client: apolloCoreClient,
      variables,
      fetchPolicy: 'cache-and-network',
    });

  // A filter change keeps the last result on screen instead of flashing skeletons.
  const currentData = data ?? previousData;

  const retry = () => {
    // A failed retry already surfaces through `error`.
    refetch().catch(() => undefined);
  };

  return {
    payload: currentData?.[rootField]?.payload as TPayload | null | undefined,
    isFirstLoad: loading && currentData === undefined,
    isRefetching: loading && currentData !== undefined,
    isForbidden: isCrmAnalyticsForbiddenError(error),
    error,
    retry,
  };
};
