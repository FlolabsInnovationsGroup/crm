import { isNonEmptyString } from '@sniptt/guards';
import { t } from '@lingui/core/macro';

import { type InboxPersonByEmail } from '@/team-inbox/hooks/useInboxPeopleByEmail';
import { beautifyPastDateRelativeToNow } from '~/utils/date-utils';

// What they applied for, where they live and how long they have waited,
// shown before the booking email is approved.
export const getApprovalApplicantSummary = (
  person: InboxPersonByEmail,
): string[] => {
  const { positions, location } = person;
  const appliedAgo = isNonEmptyString(person.applicationDate)
    ? beautifyPastDateRelativeToNow(person.applicationDate)
    : null;

  return [
    isNonEmptyString(positions) ? t`Applied for: ${positions}` : null,
    isNonEmptyString(location) ? t`Lives in: ${location}` : null,
    isNonEmptyString(appliedAgo) ? t`Applied ${appliedAgo}` : null,
  ].filter(isNonEmptyString);
};
