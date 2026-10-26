import { gql } from '@apollo/client';

export const GET_PUBLIC_FORM_STATS = gql`
  query GetPublicFormStats($formId: UUID!) {
    getPublicFormStats(formId: $formId) {
      views
      starts
      stepReaches
    }
  }
`;
