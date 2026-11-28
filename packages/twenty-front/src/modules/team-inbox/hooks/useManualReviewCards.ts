import { isDefined } from 'twenty-shared/utils';

import { useEmailsSentToApplicants } from '@/team-inbox/hooks/useEmailsSentToApplicants';
import { useManualReviewThreads } from '@/team-inbox/hooks/useManualReviewThreads';
import { type ManualReviewGroup } from '@/team-inbox/types/ManualReviewGroup';
import { type ManualReviewSortDirection } from '@/team-inbox/types/ManualReviewSortDirection';
import { buildManualReviewGroups } from '@/team-inbox/utils/buildManualReviewGroups';
import { getEmailSentToApplicantItem } from '@/team-inbox/utils/getEmailSentToApplicantItem';
import { splitManualReviewGroups } from '@/team-inbox/utils/splitManualReviewGroups';

// The open Needs review cards, split into the ones to handle and the ones
// someone has emailed since.
export const useManualReviewCards = ({
  sortDirection,
  skip,
}: {
  sortDirection: ManualReviewSortDirection;
  skip: boolean;
}) => {
  const manualReviewThreads = useManualReviewThreads({
    doneSince: null,
    sortDirection,
    skip,
  });
  const groups = buildManualReviewGroups(manualReviewThreads.threads);
  const {
    emailsByThreadId,
    hasLoaded: hasEmailsSentLoaded,
    hasFailed: hasEmailsSentFailed,
  } = useEmailsSentToApplicants(
    groups
      .map((group) => getEmailSentToApplicantItem([group, ...group.earlier]))
      .filter(isDefined),
  );

  // An email to the applicant after their card often means someone answered
  // outside it; it may also be automated, so a person checks before Done.
  const getEmailSentSinceCard = (group: ManualReviewGroup) => {
    const lookup = getEmailSentToApplicantItem([group, ...group.earlier]);

    return isDefined(lookup)
      ? (emailsByThreadId.get(lookup.messageThreadId) ?? null)
      : null;
  };

  const { toHandle, emailedSince } = splitManualReviewGroups(groups, (group) =>
    isDefined(getEmailSentSinceCard(group)),
  );

  return {
    ...manualReviewThreads,
    groups,
    toHandle,
    emailedSince,
    getEmailSentSinceCard,
    // Until the lookup answers, every card would show as one to handle.
    isSplitReady: hasEmailsSentLoaded || hasEmailsSentFailed,
    hasEmailsSentFailed,
  };
};
