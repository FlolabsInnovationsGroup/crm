import { plural, t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';

import {
  type AnalyticsBase,
  type AnalyticsPeriod,
  type AnalyticsTrendMetric,
  type AnalyticsTrendPoint,
} from '@/crm-analytics/types/AnalyticsApi';
import { isAnalyticsRateMetric } from '@/crm-analytics/utils/isAnalyticsRateMetric';
import { isAnalyticsRunningCountMetric } from '@/crm-analytics/utils/isAnalyticsRunningCountMetric';
import { formatAnalyticsBucketLabel } from '@/crm-analytics/utils/formatAnalyticsBucketLabel';
import { formatAnalyticsSignedNumber } from '@/crm-analytics/utils/formatAnalyticsSignedNumber';
import { formatAnalyticsTrendValue } from '@/crm-analytics/utils/formatAnalyticsTrendValue';
import { getAnalyticsBucketDescription } from '@/crm-analytics/utils/getAnalyticsBucketDescription';
import { isAnalyticsPeriodFullyTracked } from '@/crm-analytics/utils/isAnalyticsPeriodFullyTracked';

type FormatNumber = (value: number, options?: { decimals?: number }) => string;

type SummarizeAnalyticsTrendSeriesArgs = {
  points: AnalyticsTrendPoint[];
  metric: AnalyticsTrendMetric;
  period: AnalyticsPeriod;
  base: Pick<
    AnalyticsBase,
    'minimumSample' | 'trackingStartedAt' | 'reportingTimeZone'
  >;
  formatNumber: FormatNumber;
};

export type AnalyticsTrendSummary = {
  value: string;
  detail: string;
  isSmallSample: boolean;
};

const getCurrentPeriodText = (period: AnalyticsPeriod, isRunning: boolean) => {
  switch (period) {
    case 'DAY':
      return isRunning ? t`So far today` : t`Today`;
    case 'WEEK':
      return isRunning ? t`So far this week` : t`This week`;
    case 'MONTH':
      return isRunning ? t`So far this month` : t`This month`;
  }
};

const getPrecedingPeriodText = (period: AnalyticsPeriod) => {
  switch (period) {
    case 'DAY':
      return t`the day before`;
    case 'WEEK':
      return t`the week before`;
    case 'MONTH':
      return t`the month before`;
  }
};

const getWhenText = (
  { bucketStart, isPartial, size }: AnalyticsTrendPoint,
  metric: AnalyticsTrendMetric,
  period: AnalyticsPeriod,
  formatNumber: FormatNumber,
) => {
  if (isAnalyticsRateMetric(metric)) {
    const label = formatAnalyticsBucketLabel({ bucketStart, period });
    const count = isDefined(size) ? formatNumber(size) : null;
    const people = isDefined(size)
      ? plural(size, {
          one: `${count} person`,
          other: `${count} people`,
        })
      : t`People`;

    return period === 'WEEK'
      ? t`${people} who applied in the week of ${label}`
      : t`${people} who applied in ${label}`;
  }

  const description = isPartial
    ? getCurrentPeriodText(period, isAnalyticsRunningCountMetric(metric))
    : getAnalyticsBucketDescription(bucketStart, period);

  if (metric !== 'MEDIAN_DAYS' || !isDefined(size)) {
    return description;
  }

  const count = formatNumber(size);
  const stays = plural(size, {
    one: `${count} completed stay`,
    other: `${count} completed stays`,
  });

  return t`${description}, from ${stays}`;
};

const formatDelta = (
  delta: number,
  metric: AnalyticsTrendMetric,
  formatNumber: FormatNumber,
) => {
  if (isAnalyticsRateMetric(metric)) {
    const points = formatAnalyticsSignedNumber(
      Math.round(delta * 100),
      formatNumber,
    );

    return t`${points} points`;
  }

  if (metric === 'MEDIAN_DAYS') {
    const roundedDays = Math.round(delta * 10) / 10;
    const days = formatAnalyticsSignedNumber(roundedDays, (value) =>
      formatNumber(value, { decimals: 1 }),
    );

    return plural(Math.abs(roundedDays), {
      one: `${days} day`,
      other: `${days} days`,
    });
  }

  return formatAnalyticsSignedNumber(delta, formatNumber);
};

// A rate's latest known point can be months old, so the text always says which period it is.
export const summarizeAnalyticsTrendSeries = ({
  points,
  metric,
  period,
  base,
  formatNumber,
}: SummarizeAnalyticsTrendSeriesArgs): AnalyticsTrendSummary | null => {
  const latestPoint = points.findLast((point) => isDefined(point.value));

  if (!isDefined(latestPoint) || !isDefined(latestPoint.value)) {
    return null;
  }

  const isUnderMinimum = ({ size }: AnalyticsTrendPoint) =>
    isDefined(size) && size < base.minimumSample;

  const isRunningCount = isAnalyticsRunningCountMetric(metric);
  const whenText = getWhenText(latestPoint, metric, period, formatNumber);
  const precedingPoint = points[points.indexOf(latestPoint) - 1];
  const precedingPeriod = getPrecedingPeriodText(period);

  const getChangeText = () => {
    if (
      !isDefined(precedingPoint) ||
      !isDefined(precedingPoint.value) ||
      isUnderMinimum(latestPoint) ||
      isUnderMinimum(precedingPoint) ||
      (isRunningCount &&
        !isAnalyticsPeriodFullyTracked(precedingPoint.bucketStart, base))
    ) {
      return null;
    }

    // Subtracting a finished period from a running count would read as a fall every Monday.
    if (isRunningCount && latestPoint.isPartial) {
      const precedingValue = formatNumber(precedingPoint.value);

      return t`${precedingValue} ${precedingPeriod}`;
    }

    const delta = formatDelta(
      (latestPoint.value ?? 0) - precedingPoint.value,
      metric,
      formatNumber,
    );

    return t`${delta} against ${precedingPeriod}`;
  };

  const changeText = getChangeText();

  return {
    value: formatAnalyticsTrendValue(latestPoint.value, metric, formatNumber),
    detail: isDefined(changeText)
      ? t`${whenText}. ${changeText}.`
      : t`${whenText}.`,
    isSmallSample: isUnderMinimum(latestPoint),
  };
};
