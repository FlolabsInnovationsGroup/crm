import { gql } from '@apollo/client';

const PERSON_FIELDS = `
  id
  name {
    firstName
    lastName
  }
  emails {
    primaryEmail
  }
`;

export const SEARCH_AGREEMENT_PEOPLE = gql`
  query SearchAgreementPeople($filter: PersonFilterInput) {
    people(first: 8, filter: $filter, orderBy: [{ createdAt: DescNullsLast }]) {
      edges {
        node {
          ${PERSON_FIELDS}
        }
      }
    }
  }
`;

export const GET_AGREEMENT_PERSON = gql`
  query GetAgreementPerson($personId: UUID!) {
    person(filter: { id: { eq: $personId } }) {
      ${PERSON_FIELDS}
    }
  }
`;

export const GET_AGREEMENT_TEMPLATES = gql`
  query GetAgreementTemplates {
    agreementTemplates(first: 100, orderBy: [{ name: AscNullsLast }]) {
      edges {
        node {
          id
          name
          isActive
          paymentPlan
        }
      }
    }
  }
`;

export const GET_AGREEMENT_REQUESTS = gql`
  query GetAgreementRequests {
    agreementRequests(first: 50, orderBy: [{ createdAt: DescNullsLast }]) {
      edges {
        node {
          id
          documents
          status
          sentAt
          completedAt
          person {
            ${PERSON_FIELDS}
          }
        }
      }
    }
  }
`;

export const PREVIEW_AGREEMENT = gql`
  query PreviewAgreement($templateId: UUID!, $personId: UUID!) {
    previewAgreement(templateId: $templateId, personId: $personId) {
      templateName
      text
      missingPlaceholders
    }
  }
`;
