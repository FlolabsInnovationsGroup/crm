import { gql } from '@apollo/client';

export const GET_APPLICANT_EMAIL_HISTORY = gql`
  query GetApplicantEmailHistory($applicantEmail: String!, $personId: UUID) {
    getApplicantEmailHistory(
      applicantEmail: $applicantEmail
      personId: $personId
    ) {
      isTruncated
      messages {
        id
        messageThreadId
        subject
        text
        receivedAt
        headerMessageId
        direction
        isFromApplicant
        sender {
          role
          handle
          displayName
        }
        recipients {
          role
          handle
          displayName
        }
      }
    }
  }
`;
