import { plural, t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';

import {
  type AnalyticsPeriod,
  type AnalyticsTrendPoint,
  type AnalyticsTrends,
} from '@/crm-analytics/types/AnalyticsApi';
import {
  hasNoKnownAnalyticsRate,
  isAnalyticsRateMetric,
  isAnalyticsRunningCountMetric,
} from '@/crm-analytics/utils/buildTrendChartSeries';
import { formatAnalyticsBucketLabel } from '@/crm-analytics/utils/formatAnalyticsBucketLabel';
import { formatAnalyticsRate } from '@/crm-analytics/utils/formatAnalyticsRate';
import { formatAnalyticsSignedNumber } from '@/crm-analytics/utils/formatAnalyticsSignedNumber';
import { isAnalyticsPeriodFullyTracked } from '@/crm-analytics/utils/isAnalyticsPeriodFullyTracked';

type BuildTrendsTakeawayArgs = {
  trends: AnalyticsTrends;
  formatNumber: (value: number, options?: { decimals?: number }) => string;
};

type MeasuredTrendPoint = AnalyticsTrendPoint & { value: number };

const MEDIAN_DAYS_DECIMALS = 1;

const roundMedianDays = (days: number) => Math.round(days * 10) / 10;

const getCurrentPeriodPhrase = (period: AnalyticsPeriod) => {
  switch (period) {
    case 'DAY':
      return t`today`;
    case 'WEEK':
      return t`in this week`;
    case 'MONTH':
      return t`in this month`;
  }
};

const getLatestCompletePeriodPhrase = (period: AnalyticsPeriod) => {
  switch (period) {
    case 'DAY':
      return t`on the latest complete day`;
    case 'WEEK':
      return t`in the latest complete week`;
    case 'MONTH':
      return t`in the latest complete month`;
  }
};

const getNamedPeriodPhrase = (bucketStart: string, trends: AnalyticsTrends) => {
  const label = formatAnalyticsBucketLabel({
    bucketStart,
    period: trends.period,
  });
  const isByApplicationDate = isAnalyticsRateMetric(trends.metric);

  switch (trends.period) {
    case 'DAY':
      return isByApplicationDate
        ? t`for people who applied on ${label}`
        : t`on ${label}`;
    case 'WEEK':
      return isByApplicationDate
        ? t`for people who applied in the week of ${label}`
        : t`in the week of ${label}`;
    case 'MONTH':
      return isByApplicationDate
        ? t`for people who applied in ${label}`
        : t`in ${label}`;
  }
};

const getPrecedingPeriodPhrase = (period: AnalyticsPeriod) =>
  period === 'DAY' ? t`the day before` : t`the previous one`;

const isMeasuredBySample = (trends: AnalyticsTrends) =>
  isAnalyticsRateMetric(trends.metric) || trends.metric === 'MEDIAN_DAYS';

const isMeasuredPoint = (
  point: AnalyticsTrendPoint | undefined,
  trends: AnalyticsTrends,
): point is MeasuredTrendPoint =>
  isDefined(point) &&
  isDefined(point.value) &&
  (!isMeasuredBySample(trends) ||
    (isDefined(point.size) && point.size >= trends.minimumSample));

const isComparablePoint = (
  point: AnalyticsTrendPoint | undefined,
  trends: AnalyticsTrends,
): point is MeasuredTrendPoint =>
  isMeasuredPoint(point, trends) &&
  (!isAnalyticsRunningCountMetric(trends.metric) ||
    isAnalyticsPeriodFullyTracked(point.bucketStart, trends));

const formatValue = ({
  value,
  trends,
  formatNumber,
}: BuildTrendsTakeawayArgs & { value: number }) => {
  const count = formatNumber(value);
  const rate = formatAnalyticsRate(value);

  switch (trends.metric) {
    case 'NEW_APPLICATIONS':
      return plural(value, {
        one: `${count} new application`,
        other: `${count} new applications`,
      });
    case 'TOTAL_CONTACTS':
      return plural(value, {
        one: `${count} contact`,
        other: `${count} contacts`,
      });
    case 'ACTIVE_PEOPLE':
      return plural(value, {
        one: `${count} active person`,
        other: `${count} active people`,
      });
    case 'STAGE_COUNT':
      return plural(value, {
        one: `${count} person in this stage`,
        other: `${count} people in this stage`,
      });
    case 'OVERALL_CONVERSION':
      return t`${rate} overall conversion`;
    case 'DROP_OFF':
      return t`${rate} drop-off`;
    case 'MEDIAN_DAYS': {
      const roundedDays = roundMedianDays(value);
      const days = formatNumber(roundedDays, {
        decimals: MEDIAN_DAYS_DECIMALS,
      });

      return plural(roundedDays, {
        one: `Median of ${days} day`,
        other: `Median of ${days} days`,
      });
    }
  }
};

const formatDelta = ({
  value,
  trends,
  formatNumber,
}: BuildTrendsTakeawayArgs & { value: number }) => {
  if (isAnalyticsRateMetric(trends.metric)) {
    const points = formatAnalyticsSignedNumber(
      Math.round(value * 100),
      formatNumber,
    );

    return t`${points} points`;
  }

  if (trends.metric === 'MEDIAN_DAYS') {
    const roundedDays = roundMedianDays(value);
    const days = formatAnalyticsSignedNumber(roundedDays, (days) =>
      formatNumber(days, { decimals: MEDIAN_DAYS_DECIMALS }),
    );

    return plural(Math.abs(roundedDays), {
      one: `${days} day`,
      other: `${days} days`,
    });
  }

  return formatAnalyticsSignedNumber(value, formatNumber);
};

export const buildTrendsTakeaway = ({
  trends,
  formatNumber,
}: BuildTrendsTakeawayArgs): string => {
  if (isDefined(trends.unavailableReason)) {
    return t`No figures for this view yet.`;
  }

  if (hasNoKnownAnalyticsRate(trends)) {
    return t`No period in this view has fully passed the window yet.`;
  }

  const latestPoint = trends.series.findLast(
    (point): point is MeasuredTrendPoint => isMeasuredPoint(point, trends),
  );

  if (!isDefined(latestPoint)) {
    return t`No figures for this view yet.`;
  }

  const value = formatValue({
    value: latestPoint.value,
    trends,
    formatNumber,
  });

  // Rates skip buckets still inside their window, so the last measured one can be months old.
  const isBucketBeforeCurrent =
    trends.series.at(-1)?.isPartial === true &&
    trends.series.at(-2) === latestPoint;

  const periodPhrase = latestPoint.isPartial
    ? getCurrentPeriodPhrase(trends.period)
    : isBucketBeforeCurrent
      ? getLatestCompletePeriodPhrase(trends.period)
      : getNamedPeriodPhrase(latestPoint.bucketStart, trends);

  const precedingPhrase = getPrecedingPeriodPhrase(trends.period);

  const isCountSoFar =
    latestPoint.isPartial && isAnalyticsRunningCountMetric(trends.metric);

  // A point's previousValue is one whole window back, not the bucket before it.
  const precedingPoint = trends.series[trends.series.indexOf(latestPoint) - 1];

  if (!isComparablePoint(precedingPoint, trends)) {
    return isCountSoFar
      ? t`${value} so far ${periodPhrase}.`
      : t`${value} ${periodPhrase}.`;
  }

  // Subtracting a finished period from a running count would read as a fall every Monday.
  if (isCountSoFar) {
    const precedingCount = formatNumber(precedingPoint.value);

    return t`${value} so far ${periodPhrase}; ${precedingPhrase} had ${precedingCount}.`;
  }

  const delta = formatDelta({
    value: latestPoint.value - precedingPoint.value,
    trends,
    formatNumber,
  });

  return t`${value} ${periodPhrase}, ${delta} against ${precedingPhrase}.`;
};
