import { isDefined } from 'twenty-shared/utils';

export type ConversationMessage = {
  receivedAt: Date;
  isFromApplicant: boolean;
  isSentToApplicant: boolean;
};

export type ApplicantReplyState = {
  lastApplicantMessageAt: Date | null;
  lastSentToApplicantAt: Date | null;
};

const latest = (dates: Date[]) =>
  dates.reduce<Date | null>(
    (newest, date) =>
      !isDefined(newest) || date.getTime() > newest.getTime() ? date : newest,
    null,
  );

export const getApplicantReplyState = ({
  messages,
  before,
}: {
  messages: ConversationMessage[];
  before?: Date;
}): ApplicantReplyState => {
  const counted = messages.filter(
    (message) =>
      !isDefined(before) || message.receivedAt.getTime() < before.getTime(),
  );

  return {
    lastApplicantMessageAt: latest(
      counted
        .filter((message) => message.isFromApplicant)
        .map((message) => message.receivedAt),
    ),
    lastSentToApplicantAt: latest(
      counted
        .filter((message) => message.isSentToApplicant)
        .map((message) => message.receivedAt),
    ),
  };
};

// The applicant wrote last, so the next email from us should be an answer,
// not a reminder.
export const isAwaitingOurReply = ({
  lastApplicantMessageAt,
  lastSentToApplicantAt,
}: ApplicantReplyState) =>
  isDefined(lastApplicantMessageAt) &&
  (!isDefined(lastSentToApplicantAt) ||
    lastApplicantMessageAt.getTime() > lastSentToApplicantAt.getTime());
