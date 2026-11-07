import { Temporal } from 'temporal-polyfill';

import { type AnalyticsBase } from '@/crm-analytics/types/AnalyticsApi';

// Tracking counts nothing before it starts, so an earlier period's count looks known but is not.
export const isAnalyticsPeriodFullyTracked = (
  periodStart: string,
  {
    trackingStartedAt,
    reportingTimeZone,
  }: Pick<AnalyticsBase, 'trackingStartedAt' | 'reportingTimeZone'>,
) => {
  const trackingStart =
    Temporal.Instant.from(trackingStartedAt).toZonedDateTimeISO(
      reportingTimeZone,
    );
  const startsAtMidnight = trackingStart
    .toPlainTime()
    .equals(new Temporal.PlainTime());
  const firstFullDate = startsAtMidnight
    ? trackingStart.toPlainDate()
    : trackingStart.toPlainDate().add({ days: 1 });

  return (
    Temporal.PlainDate.compare(periodStart.slice(0, 10), firstFullDate) >= 0
  );
};
