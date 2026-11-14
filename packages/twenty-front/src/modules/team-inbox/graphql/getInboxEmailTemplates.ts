import { gql } from '@apollo/client';

export const GET_INBOX_EMAIL_TEMPLATES = gql`
  query GetInboxEmailTemplates {
    emailTemplates(first: 200, orderBy: [{ name: AscNullsLast }]) {
      edges {
        node {
          id
          name
          subject
          body {
            markdown
          }
          bodyHtml
        }
      }
    }
  }
`;
