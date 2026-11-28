import { isNonEmptyString } from '@sniptt/guards';

import { type ApplicantEmailHistoryMessage } from '@/team-inbox/types/ApplicantEmailHistoryMessage';

export type ApplicantHistoryEntry = {
  message: ApplicantEmailHistoryMessage;
  // Set where a new subject starts, so "Re:" replies stay under theirs.
  threadSubject: string | null;
};

const REPLY_PREFIX = /^\s*((re|fwd?|aw|sv|tr)\s*:\s*)+/i;

const normalizeSubject = (subject: string | null) =>
  (subject ?? '').replace(REPLY_PREFIX, '').trim().toLowerCase();

export const buildApplicantHistoryEntries = (
  messages: ApplicantEmailHistoryMessage[],
): ApplicantHistoryEntry[] =>
  messages.map((message, index) => {
    const previous = messages[index - 1];
    const isNewSubject =
      index === 0 ||
      normalizeSubject(previous.subject) !== normalizeSubject(message.subject);

    return {
      message,
      threadSubject: isNewSubject
        ? isNonEmptyString(message.subject?.trim())
          ? message.subject.trim()
          : ''
        : null,
    };
  });
