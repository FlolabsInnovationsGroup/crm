import { type ApplicantEmailHistoryMessage } from '@/team-inbox/types/ApplicantEmailHistoryMessage';

// Messages are oldest first.
export const pickApplicantHistoryReplyTarget = (
  messages: ApplicantEmailHistoryMessage[],
): ApplicantEmailHistoryMessage | null =>
  messages.findLast((message) => message.isFromApplicant) ??
  messages[messages.length - 1] ??
  null;
