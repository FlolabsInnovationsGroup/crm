import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { Temporal } from 'temporal-polyfill';
import { isDefined } from 'twenty-shared/utils';
import { themeCssVariables } from 'twenty-ui/theme';

import { AnalyticsRateCell } from '@/crm-analytics/components/AnalyticsRateCell';
import { AnalyticsTable } from '@/crm-analytics/components/AnalyticsTable';
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
import { getAnalyticsWindowLength } from '@/crm-analytics/utils/getAnalyticsWindowLength';
import { isAnalyticsPeriodFullyTracked } from '@/crm-analytics/utils/isAnalyticsPeriodFullyTracked';
import { useNumberFormat } from '@/localization/hooks/useNumberFormat';

const TREND_TABLE_MAX_HEIGHT = 448;

const StyledInProgress = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
  margin-inline-start: ${themeCssVariables.spacing[2]};
`;

const StyledMutedValue = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
`;

const getPeriodHeader = (period: AnalyticsPeriod) => {
  switch (period) {
    case 'DAY':
      return t`Day`;
    case 'WEEK':
      return t`Week of`;
    case 'MONTH':
      return t`Month`;
  }
};

const getValueHeader = (metric: AnalyticsTrendMetric) => {
  switch (metric) {
    case 'NEW_APPLICATIONS':
      return t`Applications`;
    case 'TOTAL_CONTACTS':
      return t`Contacts`;
    case 'ACTIVE_PEOPLE':
      return t`Active people`;
    case 'STAGE_COUNT':
      return t`People`;
    case 'OVERALL_CONVERSION':
      return t`Conversion`;
    case 'DROP_OFF':
      return t`Drop-off`;
    case 'MEDIAN_DAYS':
      return t`Median days`;
  }
};

const isSmallSample = (size: number | null, minimumSample: number) =>
  isDefined(size) && size < minimumSample;

type AnalyticsTrendTableBase = Pick<
  AnalyticsBase,
  'minimumSample' | 'trackingStartedAt' | 'reportingTimeZone'
>;

// The comparison reaches back by the whole window, as the column header says.
const getPreviousBucketStart = (
  bucketStart: string,
  period: AnalyticsPeriod,
  bucketCount: number,
) => {
  const start = Temporal.PlainDate.from(bucketStart.slice(0, 10));

  switch (period) {
    case 'DAY':
      return start.subtract({ days: bucketCount }).toString();
    case 'WEEK':
      return start.subtract({ weeks: bucketCount }).toString();
    case 'MONTH':
      return start.subtract({ months: bucketCount }).toString();
  }
};

const getChange = ({
  point,
  metric,
  period,
  bucketCount,
  base,
  formatNumber,
}: {
  point: AnalyticsTrendPoint;
  metric: AnalyticsTrendMetric;
  period: AnalyticsPeriod;
  bucketCount: number;
  base: AnalyticsTrendTableBase;
  formatNumber: (value: number, options?: { decimals?: number }) => string;
}) => {
  if (!isDefined(point.value) || !isDefined(point.previousValue)) {
    return null;
  }

  if (
    isAnalyticsRunningCountMetric(metric) &&
    (point.isPartial ||
      !isAnalyticsPeriodFullyTracked(
        getPreviousBucketStart(point.bucketStart, period, bucketCount),
        base,
      ))
  ) {
    return null;
  }

  if (
    isSmallSample(point.size, base.minimumSample) ||
    isSmallSample(point.previousSize, base.minimumSample)
  ) {
    return null;
  }

  const change = point.value - point.previousValue;

  if (isAnalyticsRateMetric(metric)) {
    const points = formatAnalyticsSignedNumber(
      Math.round(change * 100),
      formatNumber,
    );

    return t`${points} points`;
  }

  if (metric === 'MEDIAN_DAYS') {
    return formatAnalyticsSignedNumber(Math.round(change * 10) / 10, (value) =>
      formatNumber(value, { decimals: 1 }),
    );
  }

  return formatAnalyticsSignedNumber(change, formatNumber);
};

type AnalyticsTrendValueProps = {
  value: number | null;
  metric: AnalyticsTrendMetric;
  size: number | null;
  minimumSample: number;
};

const AnalyticsTrendValue = ({
  value,
  metric,
  size,
  minimumSample,
}: AnalyticsTrendValueProps) => {
  const { formatNumber } = useNumberFormat();

  const isUnderMinimum = isSmallSample(size, minimumSample);

  if (!isDefined(value) || isAnalyticsRateMetric(metric)) {
    return (
      <AnalyticsRateCell
        rate={value}
        eligible={size}
        isUnderMinimum={isUnderMinimum}
      />
    );
  }

  const formattedValue = formatNumber(value, {
    decimals: metric === 'MEDIAN_DAYS' ? 1 : 0,
  });

  return isUnderMinimum ? (
    <StyledMutedValue>{formattedValue}</StyledMutedValue>
  ) : (
    <span>{formattedValue}</span>
  );
};

type AnalyticsTrendTableProps = {
  points: AnalyticsTrendPoint[];
  metric: AnalyticsTrendMetric;
  period: AnalyticsPeriod;
  base: AnalyticsTrendTableBase;
};

export const AnalyticsTrendTable = ({
  points,
  metric,
  period,
  base,
}: AnalyticsTrendTableProps) => {
  const { formatNumber } = useNumberFormat();

  const hasPrevious = points.some((point) => isDefined(point.previousValue));
  const hasSample = points.some((point) => isDefined(point.size));
  const windowLength = getAnalyticsWindowLength(points.length, period);

  // The chart reads oldest to newest; this box scrolls, so the latest period has to be on top.
  const newestFirstPoints = points.toSorted((pointA, pointB) =>
    pointB.bucketStart.localeCompare(pointA.bucketStart),
  );

  return (
    <AnalyticsTable.Root
      aria-label={t`Values for each period`}
      maxHeight={TREND_TABLE_MAX_HEIGHT}
    >
      <thead>
        <tr>
          <AnalyticsTable.HeaderCell>
            {getPeriodHeader(period)}
          </AnalyticsTable.HeaderCell>
          <AnalyticsTable.HeaderCell isNumeric>
            {getValueHeader(metric)}
          </AnalyticsTable.HeaderCell>
          {hasPrevious && (
            <>
              <AnalyticsTable.HeaderCell isNumeric>
                {t`${windowLength} earlier`}
              </AnalyticsTable.HeaderCell>
              <AnalyticsTable.HeaderCell isNumeric>
                {t`Change`}
              </AnalyticsTable.HeaderCell>
            </>
          )}
          {hasSample && (
            <AnalyticsTable.HeaderCell isNumeric>
              {metric === 'MEDIAN_DAYS' ? t`Completed stays` : t`People`}
            </AnalyticsTable.HeaderCell>
          )}
        </tr>
      </thead>
      <tbody>
        {newestFirstPoints.map((point) => (
          <AnalyticsTable.Row key={point.bucketStart}>
            <AnalyticsTable.Cell>
              {formatAnalyticsBucketLabel({
                bucketStart: point.bucketStart,
                period,
              })}
              {point.isPartial && (
                <StyledInProgress>{t`in progress`}</StyledInProgress>
              )}
            </AnalyticsTable.Cell>
            <AnalyticsTable.Cell isNumeric>
              <AnalyticsTrendValue
                value={point.value}
                metric={metric}
                size={point.size}
                minimumSample={base.minimumSample}
              />
            </AnalyticsTable.Cell>
            {hasPrevious && (
              <>
                <AnalyticsTable.Cell isNumeric>
                  <AnalyticsTrendValue
                    value={point.previousValue}
                    metric={metric}
                    size={point.previousSize}
                    minimumSample={base.minimumSample}
                  />
                </AnalyticsTable.Cell>
                <AnalyticsTable.Cell isNumeric>
                  {getChange({
                    point,
                    metric,
                    period,
                    bucketCount: points.length,
                    base,
                    formatNumber,
                  })}
                </AnalyticsTable.Cell>
              </>
            )}
            {hasSample && (
              <AnalyticsTable.Cell isNumeric>
                {isDefined(point.size) ? formatNumber(point.size) : null}
              </AnalyticsTable.Cell>
            )}
          </AnalyticsTable.Row>
        ))}
      </tbody>
    </AnalyticsTable.Root>
  );
};
