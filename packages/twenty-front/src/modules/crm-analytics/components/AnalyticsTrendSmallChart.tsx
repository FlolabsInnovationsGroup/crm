import { type ErrorLike } from '@apollo/client';
import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';
import { themeCssVariables } from 'twenty-ui/theme';

import { AnalyticsChartCard } from '@/crm-analytics/charts/AnalyticsChartCard';
import { AnalyticsLineChart } from '@/crm-analytics/charts/AnalyticsLineChart';
import { AnalyticsTrendTable } from '@/crm-analytics/components/AnalyticsTrendTable';
import {
  type AnalyticsBase,
  type AnalyticsPeriod,
  type AnalyticsSeries,
  type AnalyticsTrendMetric,
} from '@/crm-analytics/types/AnalyticsApi';
import { buildAnalyticsSeriesBuckets } from '@/crm-analytics/utils/buildAnalyticsSeriesBuckets';
import { buildAnalyticsSeriesSample } from '@/crm-analytics/utils/buildAnalyticsSeriesSample';
import { isAnalyticsRateMetric } from '@/crm-analytics/utils/isAnalyticsRateMetric';
import { formatAnalyticsTrendValue } from '@/crm-analytics/utils/formatAnalyticsTrendValue';
import { getAnalyticsWindowLength } from '@/crm-analytics/utils/getAnalyticsWindowLength';
import {
  getAnalyticsSeriesNoValueText,
  getAnalyticsSeriesUnavailableText,
} from '@/crm-analytics/utils/getAnalyticsSeriesEmptyText';
import { summarizeAnalyticsTrendSeries } from '@/crm-analytics/utils/summarizeAnalyticsTrendSeries';
import { useNumberFormat } from '@/localization/hooks/useNumberFormat';

const StyledSummary = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
  margin-bottom: ${themeCssVariables.spacing[2]};
`;

const StyledValue = styled.span<{ isSmallSample: boolean }>`
  color: ${({ isSmallSample }) =>
    isSmallSample
      ? themeCssVariables.font.color.tertiary
      : themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.xl};
  font-variant-numeric: tabular-nums;
  font-weight: ${themeCssVariables.font.weight.semiBold};
  line-height: 1.2;
`;

const StyledDetail = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
  line-height: ${themeCssVariables.text.lineHeight.lg};
`;

const StyledStopNote = styled.p`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
  line-height: ${themeCssVariables.text.lineHeight.lg};
  margin: ${themeCssVariables.spacing[1]} 0 0;
`;

type AnalyticsTrendSmallChartProps = {
  title: string;
  note: string;
  metric: AnalyticsTrendMetric;
  period: AnalyticsPeriod;
  base?: AnalyticsBase;
  series?: AnalyticsSeries;
  isLoading: boolean;
  isRefetching: boolean;
  error?: ErrorLike;
  onRetry: () => void;
};

export const AnalyticsTrendSmallChart = ({
  title,
  note,
  metric,
  period,
  base,
  series,
  isLoading,
  isRefetching,
  error,
  onRetry,
}: AnalyticsTrendSmallChartProps) => {
  const { formatNumber } = useNumberFormat();

  const points = series?.points ?? [];

  const summary = isDefined(base)
    ? summarizeAnalyticsTrendSeries({
        points,
        metric,
        period,
        base,
        formatNumber,
      })
    : null;

  const getEmptyMessage = () => {
    if (isDefined(series?.unavailableReason)) {
      return getAnalyticsSeriesUnavailableText(series.unavailableReason);
    }

    return isDefined(base)
      ? getAnalyticsSeriesNoValueText(metric, period, base)
      : undefined;
  };

  const windowLength = getAnalyticsWindowLength(points.length, period);
  const hasPrevious = points.some((point) => isDefined(point.previousValue));
  // An old period with no applicants also has no value, but nobody is waiting on it.
  const lastPointWithPeople = points.findLast(
    ({ size }) => isDefined(size) && size > 0,
  );
  const isRateStoppedEarly =
    isAnalyticsRateMetric(metric) &&
    isDefined(summary) &&
    isDefined(lastPointWithPeople) &&
    !isDefined(lastPointWithPeople.value);

  return (
    <AnalyticsChartCard
      title={title}
      note={note}
      isLoading={isLoading || !isDefined(base)}
      isRefetching={isRefetching}
      error={error}
      onRetry={onRetry}
      isEmpty={!isDefined(summary)}
      emptyMessage={getEmptyMessage()}
      numbers={
        isDefined(base) ? (
          <AnalyticsTrendTable
            points={points}
            metric={metric}
            period={period}
            base={base}
          />
        ) : undefined
      }
    >
      {isDefined(summary) && (
        <>
          <StyledSummary>
            <StyledValue isSmallSample={summary.isSmallSample}>
              {summary.value}
            </StyledValue>
            <StyledDetail>{summary.detail}</StyledDetail>
          </StyledSummary>
          <AnalyticsLineChart
            ariaLabel={`${title}: ${summary.value}. ${summary.detail}`}
            size="compact"
            buckets={buildAnalyticsSeriesBuckets({
              points,
              period,
              metric,
              formatNumber,
            })}
            series={[
              {
                key: 'current',
                label: title,
                values: points.map(({ value }) => value),
                ...buildAnalyticsSeriesSample({
                  points,
                  metric,
                  minimumSample: base?.minimumSample ?? 0,
                  formatNumber,
                }),
              },
            ]}
            previousValues={
              hasPrevious
                ? points.map(({ previousValue }) => previousValue)
                : undefined
            }
            previousLabel={t`${windowLength} before`}
            isRate={isAnalyticsRateMetric(metric)}
            formatValue={(value) =>
              formatAnalyticsTrendValue(value, metric, formatNumber)
            }
          />
          {isRateStoppedEarly && (
            <StyledStopNote>
              {t`The line stops before recent periods, because newer applicants have not had enough time yet.`}
            </StyledStopNote>
          )}
        </>
      )}
    </AnalyticsChartCard>
  );
};
