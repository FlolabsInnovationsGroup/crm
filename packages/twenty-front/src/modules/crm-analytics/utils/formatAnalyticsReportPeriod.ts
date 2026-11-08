import { i18n } from '@lingui/core';
import { t } from '@lingui/core/macro';

import { type AnalyticsReportListItem } from '@/crm-analytics/types/AnalyticsApi';
import { toAnalyticsLocalDate } from '@/crm-analytics/utils/toAnalyticsLocalDate';

const MILLISECONDS_PER_DAY = 86_400_000;

// periodEnd is exclusive, so a week has to step back a day to read Monday to Sunday.
export const formatAnalyticsReportPeriod = ({
  periodType,
  periodStart,
  periodEnd,
}: AnalyticsReportListItem) => {
  const startDate = toAnalyticsLocalDate(periodStart);

  if (periodType === 'MONTH') {
    return i18n.date(startDate, {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }

  const dateRangeFrom = i18n.date(startDate, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  const dateRangeTo = i18n.date(
    new Date(toAnalyticsLocalDate(periodEnd).getTime() - MILLISECONDS_PER_DAY),
    { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' },
  );

  return t`${dateRangeFrom} to ${dateRangeTo}`;
};
