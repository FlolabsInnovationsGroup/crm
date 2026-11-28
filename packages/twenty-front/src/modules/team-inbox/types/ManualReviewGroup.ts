import { type InboxThread } from '@/team-inbox/types/InboxThread';
import { type TeamInboxReviewItem } from '@/team-inbox/utils/parseTeamInboxReviewItem';

export type ManualReviewEntry = {
  thread: InboxThread;
  item: TeamInboxReviewItem;
  reply: string;
};

// One card: the newest entry for an applicant and the ones folded into it.
export type ManualReviewGroup = ManualReviewEntry & {
  earlier: ManualReviewEntry[];
};
