import { startOfDay, subDays } from 'date-fns';

import { MANUAL_REVIEW_HISTORY_PERIOD_DAYS } from '@/team-inbox/constants/ManualReviewHistoryPeriodDays';
import { type ManualReviewHistoryPeriod } from '@/team-inbox/types/ManualReviewHistoryPeriod';

export const getManualReviewHistorySince = (
  period: ManualReviewHistoryPeriod,
  now: Date,
) =>
  startOfDay(
    subDays(now, MANUAL_REVIEW_HISTORY_PERIOD_DAYS[period]),
  ).toISOString();
