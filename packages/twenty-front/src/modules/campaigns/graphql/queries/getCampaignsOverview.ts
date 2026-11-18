import { gql } from '@apollo/client';

export const GET_CAMPAIGNS_OVERVIEW = gql`
  query GetCampaignsOverview {
    getCampaignsOverview {
      isConfigured
      fromDomains
      audiences {
        id
        name
        subscriberCount
      }
      campaigns {
        id
        name
        subject
        fromEmail
        status
        listNames
        toSend
        sent
        views
        clicks
        bounces
        createdAt
        startedAt
      }
    }
  }
`;
