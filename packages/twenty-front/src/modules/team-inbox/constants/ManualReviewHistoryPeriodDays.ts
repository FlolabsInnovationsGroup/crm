import { type ManualReviewHistoryPeriod } from '@/team-inbox/types/ManualReviewHistoryPeriod';

// Days before today; "Last 7 days" is today and the 6 days before it.
export const MANUAL_REVIEW_HISTORY_PERIOD_DAYS: Record<
  ManualReviewHistoryPeriod,
  number
> = {
  TODAY: 0,
  LAST_7_DAYS: 6,
  LAST_30_DAYS: 29,
};
