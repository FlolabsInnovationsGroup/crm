import { gql } from '@apollo/client';

import { timelineThreadWithTotalFragment } from '@/activities/emails/graphql/queries/fragments/timelineThreadWithTotalFragment';

export const GET_INBOX_THREADS = gql`
  query GetInboxThreads(
    $page: Int!
    $pageSize: Int!
    $direction: String
    $messageChannelId: UUID
    $searchTerm: String
    $unreadOnly: Boolean
    $manualReview: Boolean
    $system: Boolean
    $closed: Boolean
    $manualReviewDoneSince: DateTime
    $sortDirection: String
  ) {
    getInboxThreads(
      page: $page
      pageSize: $pageSize
      direction: $direction
      messageChannelId: $messageChannelId
      searchTerm: $searchTerm
      unreadOnly: $unreadOnly
      manualReview: $manualReview
      system: $system
      closed: $closed
      manualReviewDoneSince: $manualReviewDoneSince
      sortDirection: $sortDirection
    ) {
      ...TimelineThreadsWithTotalFragment
      timelineThreads {
        id
        contactDisplayName
        contactPersonId
      }
    }
  }
  ${timelineThreadWithTotalFragment}
`;
