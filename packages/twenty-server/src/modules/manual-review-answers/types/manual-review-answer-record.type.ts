export type ManualReviewAnswerSource = 'REPLY_FROM_CARD' | 'MARKED_DONE';

export type ManualReviewAnswerRecord = {
  id: string;
  reviewThreadId: string;
  answer: string | null;
  personId: string | null;
  deletedAt?: string | Date | null;
};
