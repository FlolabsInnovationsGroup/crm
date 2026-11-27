const MAX_NAME_LENGTH = 120;

// The record name is what lists and search show, so it is the question itself.
export const toManualReviewAnswerName = (question: string) => {
  const singleLine = question.replace(/\s+/g, ' ').trim();

  if (singleLine.length === 0) {
    return 'Applicant question';
  }

  return singleLine.length > MAX_NAME_LENGTH
    ? `${singleLine.slice(0, MAX_NAME_LENGTH - 1)}…`
    : singleLine;
};
