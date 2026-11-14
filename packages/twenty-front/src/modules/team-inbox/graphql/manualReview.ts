import { gql } from '@apollo/client';

export const GET_MANUAL_REVIEW_COUNT = gql`
  query GetManualReviewCount {
    getManualReviewCount
  }
`;

export const SET_MANUAL_REVIEW_DONE = gql`
  mutation SetManualReviewDone($messageThreadId: UUID!, $isDone: Boolean!) {
    setManualReviewDone(messageThreadId: $messageThreadId, isDone: $isDone)
  }
`;
