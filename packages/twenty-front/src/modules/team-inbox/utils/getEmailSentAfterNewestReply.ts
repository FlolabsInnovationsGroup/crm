import { isDefined } from 'twenty-shared/utils';

import { type EmailSentToApplicant } from '@/team-inbox/types/EmailSentToApplicant';
import { getEmailSentToApplicantItem } from '@/team-inbox/utils/getEmailSentToApplicantItem';
import {
  isTeamInboxApplicantMessage,
  type TeamInboxReviewItem,
} from '@/team-inbox/utils/parseTeamInboxReviewItem';

type ReviewEntry = {
  thread: { id: string; lastMessageReceivedAt: string };
  item: TeamInboxReviewItem;
};

// The server looks from the card's first message, so an email sent between
// two replies would count for the newer, unanswered one. Only an email after
// the newest applicant item counts.
export const getEmailSentAfterNewestReply = (
  entries: ReviewEntry[],
  emailsByThreadId: Map<string, EmailSentToApplicant>,
): EmailSentToApplicant | null => {
  const lookup = getEmailSentToApplicantItem(entries);
  const newestReply = entries.find(({ item }) =>
    isTeamInboxApplicantMessage(item),
  );
  const email = isDefined(lookup)
    ? emailsByThreadId.get(lookup.messageThreadId)
    : undefined;

  if (!isDefined(email) || !isDefined(newestReply)) {
    return null;
  }

  return new Date(email.sentAt).getTime() >
    new Date(newestReply.thread.lastMessageReceivedAt).getTime()
    ? email
    : null;
};
