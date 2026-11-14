import { gql } from '@apollo/client';

export const GET_CONTACT_FORM_SUBMISSIONS = gql`
  query GetContactFormSubmissions($personId: UUID!) {
    formSubmissions(
      filter: { personId: { eq: $personId } }
      orderBy: [{ submittedAt: AscNullsLast }]
      first: 50
    ) {
      edges {
        node {
          id
          submittedAt
          createdAt
          form {
            id
            name
          }
        }
      }
    }
  }
`;
