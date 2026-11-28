import { gql } from '@apollo/client';

export const SEND_AGREEMENT = gql`
  mutation SendAgreement($personId: UUID!, $templateIds: [UUID!]!) {
    sendAgreement(personId: $personId, templateIds: $templateIds) {
      agreementRequestId
      emailSent
      emailError
    }
  }
`;

export const RESEND_AGREEMENT_EMAIL = gql`
  mutation ResendAgreementEmail($agreementRequestId: UUID!) {
    resendAgreementEmail(agreementRequestId: $agreementRequestId)
  }
`;

export const SYNC_AGREEMENT_REQUEST = gql`
  mutation SyncAgreementRequest($agreementRequestId: UUID!) {
    syncAgreementRequest(agreementRequestId: $agreementRequestId)
  }
`;
