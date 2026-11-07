import { t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';

import { type AnalyticsSparklineData } from '@/crm-analytics/charts/AnalyticsSparkline';
import {
  type AnalyticsTrendMetric,
  type AnalyticsTrendPoint,
} from '@/crm-analytics/types/AnalyticsApi';
import { formatAnalyticsOfPeople } from '@/crm-analytics/utils/formatAnalyticsOfPeople';
import { formatAnalyticsTrendValue } from '@/crm-analytics/utils/formatAnalyticsTrendValue';
import { getAnalyticsBucketDescription } from '@/crm-analytics/utils/getAnalyticsBucketDescription';
import { isAnalyticsRateMetric } from '@/crm-analytics/utils/isAnalyticsRateMetric';

type BuildAnalyticsSparklineArgs = {
  points: AnalyticsTrendPoint[];
  metric: AnalyticsTrendMetric;
  label: string;
  minimumSample: number;
  formatNumber: (value: number, options?: { decimals?: number }) => string;
};

// An unfinished period would dip at the end for no reason. Time before the first known value is just empty room.
export const buildAnalyticsSparkline = ({
  points,
  metric,
  label,
  minimumSample,
  formatNumber,
}: BuildAnalyticsSparklineArgs): AnalyticsSparklineData => {
  const finishedPoints = points.filter(({ isPartial }) => !isPartial);
  const firstKnownIndex = finishedPoints.findIndex(({ value }) =>
    isDefined(value),
  );
  const shownPoints =
    firstKnownIndex === -1 ? [] : finishedPoints.slice(firstKnownIndex);

  const isRate = isAnalyticsRateMetric(metric);

  const formatPointValue = ({ value, size }: AnalyticsTrendPoint) => {
    if (!isDefined(value)) {
      return t`Not enough data`;
    }

    const formattedValue = formatAnalyticsTrendValue(
      value,
      metric,
      formatNumber,
    );

    if (!isRate || !isDefined(size)) {
      return formattedValue;
    }

    const ofPeople = formatAnalyticsOfPeople(size, formatNumber);

    return t`${formattedValue} ${ofPeople}`;
  };

  return {
    values: shownPoints.map(({ value }) => value),
    marks: shownPoints.map((point) => ({
      isLighter: isRate && isDefined(point.size) && point.size < minimumSample,
      tooltip: {
        title: getAnalyticsBucketDescription(point.bucketStart, 'WEEK'),
        rows: [{ label, value: formatPointValue(point) }],
      },
    })),
  };
};
