import { isNonEmptyString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';

import { type EmailSentToApplicantItem } from '@/team-inbox/types/EmailSentToApplicantItem';
import {
  isTeamInboxApplicantMessage,
  type TeamInboxReviewItem,
} from '@/team-inbox/utils/parseTeamInboxReviewItem';

type ReviewEntry = { thread: { id: string }; item: TeamInboxReviewItem };

// One lookup per card, from its newest applicant email; approvals and
// automation issues have no applicant message to answer.
export const getEmailSentToApplicantItem = (
  entries: ReviewEntry[],
): EmailSentToApplicantItem | null => {
  const newest = entries.find(({ item }) => isTeamInboxApplicantMessage(item));

  return isDefined(newest) && isNonEmptyString(newest.item.applicantEmail)
    ? {
        messageThreadId: newest.thread.id,
        applicantEmail: newest.item.applicantEmail,
      }
    : null;
};
