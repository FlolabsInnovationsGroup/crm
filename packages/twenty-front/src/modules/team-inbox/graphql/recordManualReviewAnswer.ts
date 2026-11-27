import { gql } from '@apollo/client';

export const RECORD_MANUAL_REVIEW_ANSWER = gql`
  mutation RecordManualReviewAnswer($input: RecordManualReviewAnswerInput!) {
    recordManualReviewAnswer(input: $input)
  }
`;
