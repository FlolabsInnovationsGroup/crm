import { type InboxThread } from '@/team-inbox/types/InboxThread';
import { type ManualReviewGroup } from '@/team-inbox/types/ManualReviewGroup';
import { groupReviewItemsByApplicant } from '@/team-inbox/utils/groupReviewItemsByApplicant';
import { parseManualReviewBody } from '@/team-inbox/utils/parseManualReviewBody';
import { parseTeamInboxReviewItem } from '@/team-inbox/utils/parseTeamInboxReviewItem';
import { sortByLastMessage } from '@/team-inbox/utils/sortByLastMessage';

// Grouped newest first whatever the display order, so a card always shows
// the applicant's newest item with the older ones folded in.
export const buildManualReviewGroups = (
  threads: InboxThread[],
): ManualReviewGroup[] =>
  groupReviewItemsByApplicant(
    sortByLastMessage(
      threads.map((thread) => ({
        thread,
        item: parseTeamInboxReviewItem(thread.subject, thread.lastMessageBody),
        reply: parseManualReviewBody(thread.lastMessageBody).reply,
      })),
      'NEWEST_FIRST',
    ),
  );
