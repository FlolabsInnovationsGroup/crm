import { plural, t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';

import {
  type AnalyticsPeriod,
  type AnalyticsTrendPoint,
  type AnalyticsTrends,
} from '@/crm-analytics/types/AnalyticsApi';
import { isAnalyticsRateMetric } from '@/crm-analytics/utils/buildTrendChartSeries';
import { formatAnalyticsRate } from '@/crm-analytics/utils/formatAnalyticsRate';

type BuildTrendsTakeawayArgs = {
  trends: AnalyticsTrends;
  formatNumber: (value: number, options?: { decimals?: number }) => string;
};

type MeasuredTrendPoint = AnalyticsTrendPoint & { value: number };

const MEDIAN_DAYS_DECIMALS = 1;

const roundMedianDays = (days: number) => Math.round(days * 10) / 10;

const getSignedNumber = (
  value: number,
  formatNumber: (value: number) => string,
) => {
  // Rounding a small fall gives -0, which number formatting prints with its sign.
  if (value === 0) {
    return formatNumber(0);
  }

  return value > 0 ? `+${formatNumber(value)}` : formatNumber(value);
};

const getCurrentPeriodPhrase = (period: AnalyticsPeriod) => {
  switch (period) {
    case 'DAY':
      return t`in this day`;
    case 'WEEK':
      return t`in this week`;
    case 'MONTH':
      return t`in this month`;
  }
};

const getLatestCompletePeriodPhrase = (period: AnalyticsPeriod) => {
  switch (period) {
    case 'DAY':
      return t`in the latest complete day`;
    case 'WEEK':
      return t`in the latest complete week`;
    case 'MONTH':
      return t`in the latest complete month`;
  }
};

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
    const points = getSignedNumber(Math.round(value * 100), formatNumber);

    return t`${points} points`;
  }

  if (trends.metric === 'MEDIAN_DAYS') {
    const roundedDays = roundMedianDays(value);
    const days = getSignedNumber(roundedDays, (days) =>
      formatNumber(days, { decimals: MEDIAN_DAYS_DECIMALS }),
    );

    return plural(Math.abs(roundedDays), {
      one: `${days} day`,
      other: `${days} days`,
    });
  }

  return getSignedNumber(value, formatNumber);
};

export const buildTrendsTakeaway = ({
  trends,
  formatNumber,
}: BuildTrendsTakeawayArgs): string => {
  const latestPoint = trends.series.findLast(
    (point): point is MeasuredTrendPoint => isMeasuredPoint(point, trends),
  );

  if (isDefined(trends.unavailableReason) || !isDefined(latestPoint)) {
    return t`No figures for this view yet.`;
  }

  const value = formatValue({
    value: latestPoint.value,
    trends,
    formatNumber,
  });

  const periodPhrase = latestPoint.isPartial
    ? getCurrentPeriodPhrase(trends.period)
    : getLatestCompletePeriodPhrase(trends.period);

  // A point's previousValue is one whole window back, not the bucket before it.
  const precedingPoint = trends.series[trends.series.indexOf(latestPoint) - 1];

  if (!isMeasuredPoint(precedingPoint, trends)) {
    return t`${value} ${periodPhrase}.`;
  }

  const delta = formatDelta({
    value: latestPoint.value - precedingPoint.value,
    trends,
    formatNumber,
  });

  return t`${value} ${periodPhrase}, ${delta} against the previous one.`;
};
