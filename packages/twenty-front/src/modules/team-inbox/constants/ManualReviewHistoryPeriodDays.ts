import { type ManualReviewHistoryPeriod } from '@/team-inbox/types/ManualReviewHistoryPeriod';

export const MANUAL_REVIEW_HISTORY_PERIOD_DAYS: Record<
  ManualReviewHistoryPeriod,
  number
> = {
  TODAY: 0,
  LAST_7_DAYS: 7,
  LAST_30_DAYS: 30,
};
