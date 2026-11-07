import { Temporal } from 'temporal-polyfill';
import { isDefined } from 'twenty-shared/utils';

import {
  type AnalyticsPeriod,
  type AnalyticsReportPeriodType,
  type AnalyticsTrendMetric,
} from 'src/modules/analytics/types/analytics-api.type';

export type CrmAnalyticsReportPeriod = {
  periodType: AnalyticsReportPeriodType;
  periodStart: string;
  // Exclusive, as analytics.report.period_end.
  periodEnd: string;
};

export type CrmAnalyticsTrendBucket = {
  bucketStart: string;
  previousBucketStart: string;
  isPartial: boolean;
};

const REPORTS_PER_RUN_LIMIT = 8;
const MAXIMUM_TREND_BUCKET_COUNT = 60;

const DEFAULT_TREND_BUCKET_COUNTS: Record<AnalyticsPeriod, number> = {
  DAY: 30,
  WEEK: 12,
  MONTH: 12,
};

// Twelve weeks are shorter than the overall window, so no bucket would ever be old enough.
const OVERALL_CONVERSION_WEEK_BUCKET_COUNT = 26;

const REPORT_PERIOD_TYPES: AnalyticsReportPeriodType[] = ['WEEK', 'MONTH'];

const computeDefaultTrendBucketCount = (
  period: AnalyticsPeriod,
  metric: AnalyticsTrendMetric | undefined,
): number =>
  metric === 'OVERALL_CONVERSION' && period === 'WEEK'
    ? OVERALL_CONVERSION_WEEK_BUCKET_COUNT
    : DEFAULT_TREND_BUCKET_COUNTS[period];

const buildPeriodDuration = (period: AnalyticsPeriod, count: number) => {
  switch (period) {
    case 'DAY':
      return { days: count };
    case 'WEEK':
      return { weeks: count };
    case 'MONTH':
      return { months: count };
  }
};

// The drivers behind the page and job connections return timestamps as Date objects
// or strings depending on their parsers; payloads always carry ISO strings.
export const toCrmAnalyticsIsoString = (value: unknown): string =>
  value instanceof Date
    ? value.toISOString()
    : new Date(String(value)).toISOString();

export const computeCrmAnalyticsLocalDate = (
  instant: string,
  timeZone: string,
): string =>
  Temporal.Instant.from(instant)
    .toZonedDateTimeISO(timeZone)
    .toPlainDate()
    .toString();

export const computeCrmAnalyticsLocalDayStart = (
  localDate: string,
  timeZone: string,
): string =>
  Temporal.PlainDate.from(localDate)
    .toZonedDateTime(timeZone)
    .toInstant()
    .toString();

export const addCrmAnalyticsLocalDays = (
  localDate: string,
  days: number,
): string => Temporal.PlainDate.from(localDate).add({ days }).toString();

// Inclusive of both ends.
export const countCrmAnalyticsLocalDays = (from: string, to: string): number =>
  Temporal.PlainDate.from(from).until(to, { largestUnit: 'days' }).days + 1;

// Weeks start on Monday, as Postgres date_trunc('week') does.
export const computeCrmAnalyticsPeriodStart = (
  localDate: string,
  period: AnalyticsPeriod,
): string => {
  const date = Temporal.PlainDate.from(localDate);

  switch (period) {
    case 'DAY':
      return date.toString();
    case 'WEEK':
      return date.subtract({ days: date.dayOfWeek - 1 }).toString();
    case 'MONTH':
      return date.with({ day: 1 }).toString();
  }
};

export const addCrmAnalyticsPeriods = (
  periodStart: string,
  period: AnalyticsPeriod,
  count: number,
): string =>
  Temporal.PlainDate.from(periodStart)
    .add(buildPeriodDuration(period, count))
    .toString();

// Buckets are whole periods so every value compares with its previous one like for
// like; a date filter that starts mid week still shows that whole week.
export const computeCrmAnalyticsTrendBuckets = ({
  dateFrom,
  dateTo,
  period,
  localToday,
  metric,
}: {
  dateFrom: string | null;
  dateTo: string | null;
  period: AnalyticsPeriod;
  localToday: string;
  metric?: AnalyticsTrendMetric;
}): CrmAnalyticsTrendBucket[] => {
  const lastDate = isDefined(dateTo) && dateTo < localToday ? dateTo : localToday;
  const lastBucketStart = computeCrmAnalyticsPeriodStart(lastDate, period);
  const firstBucketStart = isDefined(dateFrom)
    ? computeCrmAnalyticsPeriodStart(dateFrom, period)
    : addCrmAnalyticsPeriods(
        lastBucketStart,
        period,
        1 - computeDefaultTrendBucketCount(period, metric),
      );

  const bucketStarts: string[] = [];
  let bucketStart = lastBucketStart;

  while (
    bucketStart >= firstBucketStart &&
    bucketStarts.length < MAXIMUM_TREND_BUCKET_COUNT
  ) {
    bucketStarts.unshift(bucketStart);
    bucketStart = addCrmAnalyticsPeriods(bucketStart, period, -1);
  }

  const currentBucketStart = computeCrmAnalyticsPeriodStart(localToday, period);

  return bucketStarts.map((start) => ({
    bucketStart: start,
    previousBucketStart: addCrmAnalyticsPeriods(
      start,
      period,
      -bucketStarts.length,
    ),
    isPartial: start === currentBucketStart,
  }));
};

export const computeCrmAnalyticsPreviousReportPeriod = ({
  periodType,
  periodStart,
}: CrmAnalyticsReportPeriod): CrmAnalyticsReportPeriod => ({
  periodType,
  periodStart: addCrmAnalyticsPeriods(periodStart, periodType, -1),
  periodEnd: periodStart,
});

export const computeCrmAnalyticsFirstFullLocalDate = (
  trackingStartAt: string,
  timeZone: string,
): string => {
  const zonedStart =
    Temporal.Instant.from(trackingStartAt).toZonedDateTimeISO(timeZone);
  const startDate = zonedStart.toPlainDate();
  const startsAtMidnight = zonedStart
    .toPlainTime()
    .equals(new Temporal.PlainTime());

  return (startsAtMidnight ? startDate : startDate.add({ days: 1 })).toString();
};

const computeFirstPeriodStart = (
  firstFullLocalDate: string,
  periodType: AnalyticsReportPeriodType,
): string => {
  const periodStart = computeCrmAnalyticsPeriodStart(
    firstFullLocalDate,
    periodType,
  );

  return periodStart === firstFullLocalDate
    ? periodStart
    : addCrmAnalyticsPeriods(periodStart, periodType, 1);
};

const listFinishedPeriods = (
  periodType: AnalyticsReportPeriodType,
  firstFullLocalDate: string,
  localToday: string,
): CrmAnalyticsReportPeriod[] => {
  const periods: CrmAnalyticsReportPeriod[] = [];
  let periodStart = computeFirstPeriodStart(firstFullLocalDate, periodType);
  let periodEnd = addCrmAnalyticsPeriods(periodStart, periodType, 1);

  while (periodEnd <= localToday) {
    periods.push({ periodType, periodStart, periodEnd });
    periodStart = periodEnd;
    periodEnd = addCrmAnalyticsPeriods(periodStart, periodType, 1);
  }

  return periods;
};

const buildPeriodKey = ({
  periodType,
  periodStart,
}: {
  periodType: string;
  periodStart: string;
}): string => `${periodType}:${periodStart}`;

const comparePeriods = (
  first: CrmAnalyticsReportPeriod,
  second: CrmAnalyticsReportPeriod,
): number => {
  if (first.periodEnd !== second.periodEnd) {
    return first.periodEnd < second.periodEnd ? -1 : 1;
  }

  return first.periodType < second.periodType ? -1 : 1;
};

// Finished periods only, from the first one wholly after tracking start. Oldest
// first, so a long outage catches up in the order the reports would have been made.
export const computeCrmAnalyticsReportPeriods = ({
  trackingStartAt,
  now,
  timeZone,
  existingPeriods,
  limit = REPORTS_PER_RUN_LIMIT,
}: {
  trackingStartAt: string;
  now: string;
  timeZone: string;
  existingPeriods: { periodType: string; periodStart: string }[];
  limit?: number;
}): CrmAnalyticsReportPeriod[] => {
  const localToday = computeCrmAnalyticsLocalDate(now, timeZone);
  const firstFullLocalDate = computeCrmAnalyticsFirstFullLocalDate(
    trackingStartAt,
    timeZone,
  );
  const existingKeys = new Set(existingPeriods.map(buildPeriodKey));

  return REPORT_PERIOD_TYPES.flatMap((periodType) =>
    listFinishedPeriods(periodType, firstFullLocalDate, localToday),
  )
    .filter((period) => !existingKeys.has(buildPeriodKey(period)))
    .sort(comparePeriods)
    .slice(0, limit);
};
