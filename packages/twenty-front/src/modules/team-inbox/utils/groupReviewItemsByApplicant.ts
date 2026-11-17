import { isDefined } from 'twenty-shared/utils';

import { type TeamInboxReviewItem } from '@/team-inbox/utils/parseTeamInboxReviewItem';

type ReviewEntry = { thread: { id: string }; item: TeamInboxReviewItem };

const isGroupedByApplicant = (item: TeamInboxReviewItem) =>
  item.kind === 'REPLY_TRIAGE' || item.kind === 'STUCK_APPLICANT';

// Each applicant reply is its own triage email, so one person can have
// several open cards; they are answered together, so they show as one.
export const groupReviewItemsByApplicant = <TEntry extends ReviewEntry>(
  entries: TEntry[],
): (TEntry & { earlier: TEntry[] })[] => {
  const groups: (TEntry & { earlier: TEntry[] })[] = [];
  const groupIndexByApplicant = new Map<string, number>();

  for (const entry of entries) {
    const applicantKey =
      isGroupedByApplicant(entry.item) && isDefined(entry.item.applicantEmail)
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
