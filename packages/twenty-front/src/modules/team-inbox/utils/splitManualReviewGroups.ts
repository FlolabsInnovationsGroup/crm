import {
  isTeamInboxApproval,
  type TeamInboxReviewItem,
} from '@/team-inbox/utils/parseTeamInboxReviewItem';

type SplittableGroup = {
  item: TeamInboxReviewItem;
  earlier: { item: TeamInboxReviewItem }[];
};

// An email since the card may be automated, so those cards move to their own
// section instead of being marked done. Approvals wait for a button, not a
// reply, so they always stay to handle.
export const splitManualReviewGroups = <TGroup extends SplittableGroup>(
  groups: TGroup[],
  hasEmailSinceCard: (group: TGroup) => boolean,
): { toHandle: TGroup[]; emailedSince: TGroup[] } => {
  const toHandle: TGroup[] = [];
  const emailedSince: TGroup[] = [];

  for (const group of groups) {
    const hasApproval = [group, ...group.earlier].some(({ item }) =>
      isTeamInboxApproval(item),
    );

    if (!hasApproval && hasEmailSinceCard(group)) {
      emailedSince.push(group);
    } else {
      toHandle.push(group);
    }
  }

  return { toHandle, emailedSince };
};
