import { i18n } from '@lingui/core';
import { t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';

import { type AnalyticsMeta } from '@/crm-analytics/types/AnalyticsApi';

const DAILY_COUNT_LATE_AFTER_IN_MS = 26 * 60 * 60 * 1000;

export const getAnalyticsDailyCountWarning = ({
  asOf,
  reportingTimeZone,
  sync: { lastReconciliationAt },
}: Pick<AnalyticsMeta, 'asOf' | 'reportingTimeZone' | 'sync'>) => {
  if (!isDefined(lastReconciliationAt)) {
    return t`The daily count has not run yet. Trends and reports may be missing.`;
  }

  const lastRunAt = new Date(lastReconciliationAt);

  if (
    new Date(asOf).getTime() - lastRunAt.getTime() <=
    DAILY_COUNT_LATE_AFTER_IN_MS
  ) {
    return null;
  }

  const lastRunOn = i18n.date(lastRunAt, {
    dateStyle: 'medium',
    timeZone: reportingTimeZone,
  });

  return t`The daily count has not run since ${lastRunOn}. Trends and reports may be missing.`;
};
