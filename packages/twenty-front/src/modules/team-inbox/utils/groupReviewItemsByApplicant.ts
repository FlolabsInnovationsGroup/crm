import { isDefined } from 'twenty-shared/utils';

import {
  type TeamInboxReviewItem,
  type TeamInboxReviewKind,
} from '@/team-inbox/utils/parseTeamInboxReviewItem';

type ReviewEntry = { thread: { id: string }; item: TeamInboxReviewItem };

const APPLICANT_KINDS: TeamInboxReviewKind[] = [
  'REPLY_TRIAGE',
  'STUCK_APPLICANT',
  'FORM_1_APPROVAL',
  'ORIENTATION_APPROVAL',
];

// n8n sends a separate email for each reply and each approval, so one person
// can have several open items; they are handled together, so they show as
// one card. Automation issues name a teammate, not an applicant, so they stay
// apart.
export const groupReviewItemsByApplicant = <TEntry extends ReviewEntry>(
  entries: TEntry[],
): (TEntry & { earlier: TEntry[] })[] => {
  const groups: (TEntry & { earlier: TEntry[] })[] = [];
  const groupIndexByApplicant = new Map<string, number>();

  for (const entry of entries) {
    const applicantKey =
      APPLICANT_KINDS.includes(entry.item.kind) &&
      isDefined(entry.item.applicantEmail)
        ? entry.item.applicantEmail.toLowerCase()
        : null;
    const existingIndex = isDefined(applicantKey)
      ? groupIndexByApplicant.get(applicantKey)
      : undefined;

    if (isDefined(existingIndex)) {
      groups[existingIndex].earlier.push(entry);
      continue;
    }

    if (isDefined(applicantKey)) {
      groupIndexByApplicant.set(applicantKey, groups.length);
    }

    groups.push({ ...entry, earlier: [] });
  }

  return groups;
};
