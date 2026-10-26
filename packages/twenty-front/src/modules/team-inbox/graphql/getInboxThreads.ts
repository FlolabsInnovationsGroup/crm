import { gql } from '@apollo/client';

import { timelineThreadWithTotalFragment } from '@/activities/emails/graphql/queries/fragments/timelineThreadWithTotalFragment';

export const GET_INBOX_THREADS = gql`
  query GetInboxThreads(
    $page: Int!
    $pageSize: Int!
    $direction: String
    $messageChannelId: UUID
    $searchTerm: String
  ) {
    getInboxThreads(
      page: $page
      pageSize: $pageSize
      direction: $direction
      messageChannelId: $messageChannelId
      searchTerm: $searchTerm
    ) {
      ...TimelineThreadsWithTotalFragment
    }
  }
  ${timelineThreadWithTotalFragment}
`;
