import { t } from '@lingui/core/macro';
import { isNonEmptyString } from '@sniptt/guards';

// Mirrors the guidance the n8n workflow writes in each triage email.
export const getManualReviewAdvice = (reason: string, note: string | null) => {
  if (reason === 'not interested') {
    return t`Set the lead status to Not interested and send the "Not Interested" template.`;
  }

  if (reason === 'question') {
    return isNonEmptyString(note)
      ? t`Answer the question with the matching template. The automatic email was already sent, so check the stage first.`
      : t`Answer the question with the matching template.`;
  }

  return t`Check the applicant's real stage before replying.`;
};
