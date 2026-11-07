import { t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';

import { AnalyticsChartUnknownValue } from '@/crm-analytics/charts/AnalyticsChartUnknownValue';
import { AnalyticsRateCell } from '@/crm-analytics/components/AnalyticsRateCell';
import { AnalyticsTable } from '@/crm-analytics/components/AnalyticsTable';
import {
  type AnalyticsPeriod,
  type AnalyticsTrendMetric,
  type AnalyticsTrendPoint,
} from '@/crm-analytics/types/AnalyticsApi';
import { isAnalyticsRateMetric } from '@/crm-analytics/utils/isAnalyticsRateMetric';
import { formatAnalyticsTrendValue } from '@/crm-analytics/utils/formatAnalyticsTrendValue';
import { getAnalyticsBucketDescription } from '@/crm-analytics/utils/getAnalyticsBucketDescription';
import { useNumberFormat } from '@/localization/hooks/useNumberFormat';

const SERIES_TABLE_MAX_HEIGHT = 448;

type AnalyticsSeriesTableColumn = {
  key: string;
  label: string;
  points: AnalyticsTrendPoint[];
};

type AnalyticsSeriesTableProps = {
  'aria-label': string;
  columns: AnalyticsSeriesTableColumn[];
  metric: AnalyticsTrendMetric;
  period: AnalyticsPeriod;
  minimumSample: number;
};

// One row per period and one column per line, so several lines read the way one line's table does.
export const AnalyticsSeriesTable = ({
  'aria-label': ariaLabel,
  columns,
  metric,
  period,
  minimumSample,
}: AnalyticsSeriesTableProps) => {
  const { formatNumber } = useNumberFormat();

  const newestFirstBuckets = (columns[0]?.points ?? [])
    .map(({ bucketStart }) => bucketStart)
    .toSorted((firstBucket, secondBucket) =>
      secondBucket.localeCompare(firstBucket),
    );

  const renderValue = (point: AnalyticsTrendPoint | undefined) => {
    if (isAnalyticsRateMetric(metric)) {
      return (
        <AnalyticsRateCell
          rate={point?.value ?? null}
          eligible={point?.size}
          isUnderMinimum={isDefined(point?.size) && point.size < minimumSample}
          isCompact
        />
      );
    }

    return isDefined(point?.value) ? (
      formatAnalyticsTrendValue(point.value, metric, formatNumber)
    ) : (
      <AnalyticsChartUnknownValue />
    );
  };

  return (
    <AnalyticsTable.Root
      aria-label={ariaLabel}
      hasStickyFirstColumn
      maxHeight={SERIES_TABLE_MAX_HEIGHT}
    >
      <thead>
        <tr>
          <AnalyticsTable.HeaderCell>{t`Period`}</AnalyticsTable.HeaderCell>
          {columns.map(({ key, label }) => (
            <AnalyticsTable.HeaderCell key={key} isNumeric>
              {label}
            </AnalyticsTable.HeaderCell>
          ))}
        </tr>
      </thead>
      <tbody>
        {newestFirstBuckets.map((bucketStart) => (
          <AnalyticsTable.Row key={bucketStart}>
            <AnalyticsTable.Cell>
              {getAnalyticsBucketDescription(bucketStart, period)}
            </AnalyticsTable.Cell>
            {columns.map(({ key, points }) => (
              <AnalyticsTable.Cell key={key} isNumeric>
                {renderValue(
                  points.find((point) => point.bucketStart === bucketStart),
                )}
              </AnalyticsTable.Cell>
            ))}
          </AnalyticsTable.Row>
        ))}
      </tbody>
    </AnalyticsTable.Root>
  );
};
