import { gql } from '@apollo/client';

export const GET_NOTIFICATION_FORM_SUBMISSIONS = gql`
  query GetNotificationFormSubmissions {
    formSubmissions(orderBy: [{ createdAt: DescNullsLast }], first: 15) {
      edges {
        node {
          id
          name
          createdAt
        }
      }
    }
  }
`;

export const GET_NOTIFICATION_TASKS = gql`
  query GetNotificationTasks($assigneeId: UUID!) {
    tasks(
      filter: { assigneeId: { eq: $assigneeId } }
      orderBy: [{ createdAt: DescNullsLast }]
      first: 15
    ) {
      edges {
        node {
          id
          title
          createdAt
        }
      }
    }
  }
`;
