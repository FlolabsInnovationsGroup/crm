import { useQuery } from '@apollo/client/react';

import { GET_CAMPAIGNS_OVERVIEW } from '@/campaigns/graphql/queries/getCampaignsOverview';
import { type CampaignsOverview } from '@/campaigns/types/Campaign';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';

export const useCampaignsOverview = () => {
  const apolloCoreClient = useApolloCoreClient();

  const { data, loading, error, refetch } = useQuery<{
    getCampaignsOverview: CampaignsOverview;
  }>(GET_CAMPAIGNS_OVERVIEW, {
    client: apolloCoreClient,
    fetchPolicy: 'cache-and-network',
    notifyOnNetworkStatusChange: true,
  });

  return {
    overview: data?.getCampaignsOverview,
    loading,
    error,
    refetch,
  };
};
