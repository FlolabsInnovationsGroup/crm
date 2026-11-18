import { useQuery } from '@apollo/client/react';

import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { GET_SENDING_DOMAINS } from '@/settings/sending-domains/graphql/queries/getSendingDomains';
import { type SendingDomainList } from '@/settings/sending-domains/types/SendingDomain';

export const useSendingDomains = () => {
  const apolloCoreClient = useApolloCoreClient();

  const { data, loading, error, refetch } = useQuery<{
    getSendingDomains: SendingDomainList;
  }>(GET_SENDING_DOMAINS, {
    client: apolloCoreClient,
    fetchPolicy: 'network-only',
    notifyOnNetworkStatusChange: true,
  });

  return {
    sendingDomainList: data?.getSendingDomains,
    loading,
    error,
    refetch,
  };
};
