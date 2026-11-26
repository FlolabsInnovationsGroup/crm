import { gql } from '@apollo/client';

export const GET_MANUAL_REVIEW_HISTORY = gql`
  query GetManualReviewHistory($items: [ManualReviewHistoryItemInput!]!) {
    getManualReviewHistory(items: $items) {
      messageThreadId
      doneAt
      doneByName
      replyText
      replySentAt
    }
  }
`;
