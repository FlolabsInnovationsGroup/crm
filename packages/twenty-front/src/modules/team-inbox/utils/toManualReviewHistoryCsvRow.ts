import { isNonEmptyString } from '@sniptt/guards';

import { type ManualReviewHistoryEntry } from '@/team-inbox/types/ManualReviewHistoryEntry';
import { type ManualReviewHistoryCsvRow } from '@/team-inbox/utils/buildManualReviewHistoryCsv';
import { getTeamInboxReviewExcerpt } from '@/team-inbox/utils/getTeamInboxReviewExcerpt';
import { parseManualReviewBody } from '@/team-inbox/utils/parseManualReviewBody';
import { type TeamInboxReviewItem } from '@/team-inbox/utils/parseTeamInboxReviewItem';
import { splitQuotedReply } from '@/team-inbox/utils/splitQuotedReply';
import { type TimelineThread } from '~/generated/graphql';

export const toManualReviewHistoryCsvRow = ({
  thread,
  item,
  kindLabel,
  entry,
  suggestedTemplateName,
  formatDateTime,
}: {
  thread: TimelineThread;
  item: TeamInboxReviewItem;
  kindLabel: string;
  entry: ManualReviewHistoryEntry | undefined;
  suggestedTemplateName: string | null;
  formatDateTime: (isoDate: string) => string;
}): ManualReviewHistoryCsvRow => {
  const isTriage = item.kind === 'REPLY_TRIAGE';
  const body = parseManualReviewBody(thread.lastMessageBody);
  const formatOptionalDateTime = (isoDate: string | null | undefined) =>
    isNonEmptyString(isoDate) ? formatDateTime(isoDate) : null;

  return {
    doneAt: formatOptionalDateTime(entry?.doneAt),
    doneByName: entry?.doneByName ?? null,
    applicantEmail: item.applicantEmail,
    kind: kindLabel,
    reason: item.triage?.reason ?? null,
    stage: isTriage ? body.stage : null,
    applicantMessage: isTriage
      ? body.reply
      : getTeamInboxReviewExcerpt(thread.lastMessageBody),
    suggestedTemplate: suggestedTemplateName,
    replyText: isNonEmptyString(entry?.replyText)
      ? splitQuotedReply(entry.replyText).reply
      : null,
    replySentAt: formatOptionalDateTime(entry?.replySentAt),
    reviewReceivedAt: formatOptionalDateTime(thread.lastMessageReceivedAt),
  };
};
