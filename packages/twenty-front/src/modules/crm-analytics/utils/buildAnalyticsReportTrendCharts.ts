import { t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';

import {
  type AnalyticsLineChartBucket,
  type AnalyticsLineChartSeries,
} from '@/crm-analytics/charts/AnalyticsLineChart';
import {
  type AnalyticsReport,
  type AnalyticsTrendMetric,
} from '@/crm-analytics/types/AnalyticsApi';
import { buildAnalyticsSeriesBuckets } from '@/crm-analytics/utils/buildAnalyticsSeriesBuckets';
import { buildAnalyticsSeriesSample } from '@/crm-analytics/utils/buildAnalyticsSeriesSample';
import { formatAnalyticsTrendValue } from '@/crm-analytics/utils/formatAnalyticsTrendValue';
import { getAnalyticsSeriesUnavailableText } from '@/crm-analytics/utils/getAnalyticsSeriesEmptyText';
import { isAnalyticsRateMetric } from '@/crm-analytics/utils/isAnalyticsRateMetric';

export type AnalyticsReportTrendChart = {
  key: string;
  title: string;
  seriesLabel: string;
  note?: string;
  unavailableMessage: string | null;
  buckets: AnalyticsLineChartBucket[];
  values: (number | null)[];
  previousValues?: (number | null)[];
  sample: Pick<
    AnalyticsLineChartSeries,
    'sizes' | 'minimumSample' | 'formatSize'
  >;
  isRate: boolean;
  formatValue: (value: number) => string;
};

const getSeriesLabel = (metric: AnalyticsTrendMetric) => {
  switch (metric) {
    case 'NEW_APPLICATIONS':
      return t`New applications`;
    case 'TOTAL_CONTACTS':
      return t`Total contacts`;
    case 'ACTIVE_PEOPLE':
      return t`Active people`;
    case 'STAGE_COUNT':
      return t`People in this stage`;
    case 'OVERALL_CONVERSION':
      return t`Overall conversion`;
    case 'DROP_OFF':
      return t`Drop-off rate`;
    case 'MEDIAN_DAYS':
      return t`Median days in a stage`;
  }
};

export const buildAnalyticsReportTrendCharts = (
  report: AnalyticsReport,
  formatNumber: (value: number, options?: { decimals?: number }) => string,
): AnalyticsReportTrendChart[] =>
  (report.trendSeries ?? [])
    .filter((series) => !isDefined(series.groupKey))
    .map(({ metric, stageKey, unavailableReason, points }) => {
      const seriesLabel = getSeriesLabel(metric);
      const previousValues = points.map(({ previousValue }) => previousValue);

      return {
        key: `${metric}:${stageKey ?? ''}`,
        title: t`${seriesLabel} over time`,
        seriesLabel,
        note: isAnalyticsRateMetric(metric)
          ? t`People, by when they applied. The line stops where people are still in progress.`
          : undefined,
        unavailableMessage: isDefined(unavailableReason)
          ? getAnalyticsSeriesUnavailableText(unavailableReason)
          : null,
        buckets: buildAnalyticsSeriesBuckets({
          points,
          period: report.periodType,
          metric,
          formatNumber,
        }),
        values: points.map(({ value }) => value),
        previousValues: previousValues.some(isDefined)
          ? previousValues
          : undefined,
        sample: buildAnalyticsSeriesSample({
          points,
          metric,
          minimumSample: report.minimumSample,
          formatNumber,
        }),
        isRate: isAnalyticsRateMetric(metric),
        formatValue: (value: number) =>
          formatAnalyticsTrendValue(value, metric, formatNumber),
      };
    });
