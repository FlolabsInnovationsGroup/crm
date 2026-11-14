import { isDefined } from 'twenty-shared/utils';

export type ManualReviewSubject = {
  reason: string;
  note: string | null;
  applicantEmail: string | null;
  originalSubject: string;
};

// Matches the n8n reply-triage subject, for example
// "[Reply triage] question (CONTACTED already sent): a@b.co - Re: Internship".
const MANUAL_REVIEW_SUBJECT_REGEX =
  /^\[Reply triage\]\s*([^:(]+?)\s*(?:\(([^)]*)\))?\s*:\s*(\S+@\S+)\s+-\s+(.*)$/i;

export const parseManualReviewSubject = (
  subject: string,
): ManualReviewSubject => {
  const match = subject.match(MANUAL_REVIEW_SUBJECT_REGEX);

  if (!isDefined(match)) {
    return {
      reason: '',
      note: null,
      applicantEmail: null,
      originalSubject: subject,
    };
  }

  const [, reason, note, applicantEmail, originalSubject] = match;

  return {
    reason: reason.replace(/_/g, ' '),
    note: note ?? null,
    applicantEmail,
    originalSubject,
  };
};
