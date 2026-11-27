import { isNonEmptyString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';

import { getTeamInboxReviewExcerpt } from '@/team-inbox/utils/getTeamInboxReviewExcerpt';
import {
  isTeamInboxApplicantMessage,
  type TeamInboxReviewItem,
} from '@/team-inbox/utils/parseTeamInboxReviewItem';

type ReviewEntry = {
  thread: { id: string; lastMessageBody: string };
  item: TeamInboxReviewItem;
  reply: string | null;
};

export type ManualReviewAnswerContext = {
  applicantEmail: string;
  // The newest applicant email; the answer row is keyed by it.
  reviewThreadId: string;
  applicantMessageThreadIds: string[];
  question: string;
  category: string;
};

// A card's entries are newest first; the question reads oldest first, the way
// the applicant wrote it.
export const buildManualReviewAnswerContext = (
  entries: ReviewEntry[],
): ManualReviewAnswerContext | null => {
  const applicantMessages = entries.filter(({ item }) =>
    isTeamInboxApplicantMessage(item),
  );
  const newest = applicantMessages[0];

  if (!isDefined(newest) || !isDefined(newest.item.applicantEmail)) {
    return null;
  }

  const question = [...applicantMessages]
    .reverse()
    .map(({ thread, item, reply }) =>
      isNonEmptyString(reply?.trim())
        ? reply.trim()
        : item.kind === 'STUCK_APPLICANT'
          ? getTeamInboxReviewExcerpt(thread.lastMessageBody)
          : '',
    )
    .filter(isNonEmptyString)
    .join('\n\n');

  return {
    applicantEmail: newest.item.applicantEmail,
    reviewThreadId: newest.thread.id,
    applicantMessageThreadIds: applicantMessages.map(({ thread }) => thread.id),
    question,
    category:
      newest.item.kind === 'STUCK_APPLICANT'
        ? 'stuck'
        : (newest.item.triage?.reason ?? ''),
  };
};
