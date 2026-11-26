import { type ManualReviewHistoryEntry } from '@/team-inbox/types/ManualReviewHistoryEntry';
import { type ManualReviewHistoryCsvRow } from '@/team-inbox/utils/buildManualReviewHistoryCsv';
import { getTeamInboxReviewExcerpt } from '@/team-inbox/utils/getTeamInboxReviewExcerpt';
import { parseManualReviewBody } from '@/team-inbox/utils/parseManualReviewBody';
import { type TeamInboxReviewItem } from '@/team-inbox/utils/parseTeamInboxReviewItem';
import { type TimelineThread } from '~/generated/graphql';

export const toManualReviewHistoryCsvRow = ({
  thread,
  item,
  kindLabel,
  entry,
  suggestedTemplateName,
}: {
  thread: TimelineThread;
  item: TeamInboxReviewItem;
  kindLabel: string;
  entry: ManualReviewHistoryEntry | undefined;
  suggestedTemplateName: string | null;
}): ManualReviewHistoryCsvRow => {
  const isTriage = item.kind === 'REPLY_TRIAGE';
  const body = parseManualReviewBody(thread.lastMessageBody);

  return {
    doneAt: entry?.doneAt ?? null,
    doneByName: entry?.doneByName ?? null,
    applicantEmail: item.applicantEmail,
    kind: kindLabel,
    reason: item.triage?.reason ?? null,
    stage: isTriage ? body.stage : null,
    applicantMessage: isTriage
      ? body.reply
      : getTeamInboxReviewExcerpt(thread.lastMessageBody),
    suggestedTemplate: suggestedTemplateName,
    replyText: entry?.replyText ?? null,
    replySentAt: entry?.replySentAt ?? null,
    reviewReceivedAt: thread.lastMessageReceivedAt,
  };
};
