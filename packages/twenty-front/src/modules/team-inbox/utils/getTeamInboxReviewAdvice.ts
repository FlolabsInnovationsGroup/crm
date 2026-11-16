import { t } from '@lingui/core/macro';

import { getManualReviewAdvice } from '@/team-inbox/utils/getManualReviewAdvice';
import { type TeamInboxReviewItem } from '@/team-inbox/utils/parseTeamInboxReviewItem';

// Mirrors the guidance in each n8n email, so the card says what to do.
export const getTeamInboxReviewAdvice = (item: TeamInboxReviewItem) => {
  switch (item.kind) {
    case 'REPLY_TRIAGE':
      return getManualReviewAdvice(
        item.triage?.reason ?? '',
        item.triage?.note ?? null,
      );
    case 'STUCK_APPLICANT':
      return t`The applicant asked a question, got no answer and was moved to No answer. Reply, then set the right stage.`;
    case 'FORM_1_APPROVAL':
      return t`Open the approval page and choose whether to send the Before Meeting email. Nothing is sent until you press Submit.`;
    case 'ORIENTATION_APPROVAL':
      return t`Open the approval page, pick the date, time and Zoom link, then send the invitation. Nothing is sent until you press Submit.`;
    case 'AUTOMATION_SENT_NOT_UPDATED':
      return t`The email was sent, but the stage or note was not updated. Set the stage by hand and do not resend.`;
    case 'AUTOMATION_FIRST_EMAIL_FAILED':
      return t`The first email to this new applicant failed. Check their record and send it by hand.`;
    case 'AUTOMATION_NEEDS_ATTENTION':
      return t`A step failed before anything was sent. Handle this applicant by hand.`;
    case 'OTHER':
      return t`Open the email and handle it by hand.`;
  }
};
