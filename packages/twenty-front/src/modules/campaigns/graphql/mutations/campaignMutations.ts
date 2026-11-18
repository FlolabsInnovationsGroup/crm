import { gql } from '@apollo/client';

export const CREATE_CAMPAIGN = gql`
  mutation CreateCampaign($input: CreateCampaignInput!) {
    createCampaign(input: $input) {
      id
    }
  }
`;

export const SEND_CAMPAIGN_TEST = gql`
  mutation SendCampaignTest($campaignId: Int!) {
    sendCampaignTest(campaignId: $campaignId)
  }
`;

export const START_CAMPAIGN = gql`
  mutation StartCampaign($campaignId: Int!) {
    startCampaign(campaignId: $campaignId) {
      id
      status
    }
  }
`;

export const PAUSE_CAMPAIGN = gql`
  mutation PauseCampaign($campaignId: Int!) {
    pauseCampaign(campaignId: $campaignId) {
      id
      status
    }
  }
`;

export const CANCEL_CAMPAIGN = gql`
  mutation CancelCampaign($campaignId: Int!) {
    cancelCampaign(campaignId: $campaignId) {
      id
      status
    }
  }
`;

export const DELETE_CAMPAIGN_DRAFT = gql`
  mutation DeleteCampaignDraft($campaignId: Int!) {
    deleteCampaignDraft(campaignId: $campaignId)
  }
`;
