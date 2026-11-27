import { isNonEmptyString } from '@sniptt/guards';
import { t } from '@lingui/core/macro';

import { type InboxPersonByEmail } from '@/team-inbox/hooks/useInboxPeopleByEmail';
import { beautifyPastDateRelativeToNow } from '~/utils/date-utils';

// What the approver needs before sending the booking email: who the person
// is, what they applied for, where they live and how long they have waited.
export const getApprovalApplicantSummary = (
  person: InboxPersonByEmail,
): string[] => {
  const appliedAgo = isNonEmptyString(person.applicationDate)
    ? beautifyPastDateRelativeToNow(person.applicationDate)
    : null;

  return [
    isNonEmptyString(person.positions)
      ? t`Applied for: ${person.positions}`
      : null,
    isNonEmptyString(person.location) ? t`Lives in: ${person.location}` : null,
    isNonEmptyString(appliedAgo) ? t`Applied ${appliedAgo}` : null,
  ].filter(isNonEmptyString);
};
