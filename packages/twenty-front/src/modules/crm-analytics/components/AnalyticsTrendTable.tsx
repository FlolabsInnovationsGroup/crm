import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';
import { themeCssVariables } from 'twenty-ui/theme';

import { AnalyticsRateCell } from '@/crm-analytics/components/AnalyticsRateCell';
import { AnalyticsTable } from '@/crm-analytics/components/AnalyticsTable';
import {
  type AnalyticsPeriod,
  type AnalyticsTrendMetric,
  type AnalyticsTrendPoint,
} from '@/crm-analytics/types/AnalyticsApi';
import { isAnalyticsRateMetric } from '@/crm-analytics/utils/isAnalyticsRateMetric';
import { isAnalyticsRunningCountMetric } from '@/crm-analytics/utils/isAnalyticsRunningCountMetric';
import { formatAnalyticsBucketLabel } from '@/crm-analytics/utils/formatAnalyticsBucketLabel';
import { formatAnalyticsSignedNumber } from '@/crm-analytics/utils/formatAnalyticsSignedNumber';
import { getAnalyticsWindowLength } from '@/crm-analytics/utils/getAnalyticsWindowLength';
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

const getChange = ({
  point,
  metric,
  minimumSample,
  formatNumber,
}: {
  point: AnalyticsTrendPoint;
  metric: AnalyticsTrendMetric;
  minimumSample: number;
  formatNumber: (value: number, options?: { decimals?: number }) => string;
}) => {
  if (!isDefined(point.value) || !isDefined(point.previousValue)) {
    return null;
  }

  if (point.isPartial && isAnalyticsRunningCountMetric(metric)) {
    return null;
  }

  if (
    isSmallSample(point.size, minimumSample) ||
    isSmallSample(point.previousSize, minimumSample)
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
  minimumSample: number;
};

export const AnalyticsTrendTable = ({
  points,
  metric,
  period,
  minimumSample,
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
                minimumSample={minimumSample}
              />
            </AnalyticsTable.Cell>
            {hasPrevious && (
              <>
                <AnalyticsTable.Cell isNumeric>
                  <AnalyticsTrendValue
                    value={point.previousValue}
                    metric={metric}
                    size={point.previousSize}
                    minimumSample={minimumSample}
                  />
                </AnalyticsTable.Cell>
                <AnalyticsTable.Cell isNumeric>
                  {getChange({ point, metric, minimumSample, formatNumber })}
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
