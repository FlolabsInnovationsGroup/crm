import { gql } from '@apollo/client';

export const GET_EMAILS_SENT_TO_APPLICANTS = gql`
  query GetEmailsSentToApplicants($items: [EmailSentToApplicantItemInput!]!) {
    getEmailsSentToApplicants(items: $items) {
      messageThreadId
      sentAt
      subject
      excerpt
      senderName
      senderEmail
    }
  }
`;
