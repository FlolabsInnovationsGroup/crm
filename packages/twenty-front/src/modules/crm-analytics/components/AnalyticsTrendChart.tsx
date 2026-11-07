import { i18n } from '@lingui/core';
import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { lazy, Suspense } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { themeCssVariables } from 'twenty-ui/theme';

import { AnalyticsSkeleton } from '@/crm-analytics/components/AnalyticsSkeleton';
import { formatAnalyticsBucketLabel } from '@/crm-analytics/components/AnalyticsTrendTable';
import { CRM_ANALYTICS_CHART_INSTANCE_ID } from '@/crm-analytics/constants/CrmAnalyticsChartInstanceId';
import { type AnalyticsTrends } from '@/crm-analytics/types/AnalyticsApi';
import {
  buildTrendChartSeries,
  isAnalyticsRateMetric,
} from '@/crm-analytics/utils/buildTrendChartSeries';
import { PageLayoutEditModeProviderContext } from '@/page-layout/contexts/PageLayoutEditModeContext';
import { PageLayoutComponentInstanceContext } from '@/page-layout/states/contexts/PageLayoutComponentInstanceContext';
import { WidgetComponentInstanceContext } from '@/page-layout/widgets/states/contexts/WidgetComponentInstanceContext';

const GraphWidgetLineChart = lazy(() =>
  import('@/page-layout/widgets/graph/graph-widget-line-chart/components/GraphWidgetLineChart').then(
    (module) => ({
      default: module.GraphWidgetLineChart,
    }),
  ),
);

const RATE_AXIS_FULL_SCALE_ABOVE_PERCENT = 50;

const StyledChartBox = styled.div`
  height: 280px;
  min-width: 0;
  width: 100%;
`;

const StyledMessage = styled.p`
  align-items: center;
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.md};
  box-sizing: border-box;
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  font-size: ${themeCssVariables.font.size.sm};
  justify-content: center;
  margin: 0;
  min-height: 120px;
  padding: ${themeCssVariables.spacing[4]};
  text-align: center;
`;

const getUnavailableReasonText = (
  unavailableReason: NonNullable<AnalyticsTrends['unavailableReason']>,
) => {
  switch (unavailableReason) {
    case 'DAILY_RATE':
      return t`Daily rates are not offered. Choose weeks or months in the Period filter.`;
    case 'SNAPSHOT_FILTER_COMBINATION':
      return t`Stored daily counts use one category at a time. Keep only one of Track, Program or Source.`;
    case 'NO_SUBMISSION_OBJECT':
      return t`This workspace has no application forms, so new applications cannot be counted.`;
  }
};

const getNoLineText = (trends: AnalyticsTrends) => {
  if (!isAnalyticsRateMetric(trends.metric)) {
    return t`Not enough points to draw a line yet.`;
  }

  const trackingStartedOn = i18n.date(new Date(trends.trackingStartedAt), {
    dateStyle: 'medium',
    timeZone: trends.reportingTimeZone,
  });

  return t`Tracking started ${trackingStartedOn}. The line needs two periods in a row whose people have passed the window.`;
};

type AnalyticsTrendChartProps = {
  title: string;
  trends: AnalyticsTrends;
};

export const AnalyticsTrendChart = ({
  title,
  trends,
}: AnalyticsTrendChartProps) => {
  const { metric, period, series: points, unavailableReason } = trends;

  if (isDefined(unavailableReason)) {
    return (
      <StyledMessage>
        {getUnavailableReasonText(unavailableReason)}
      </StyledMessage>
    );
  }

  const series = buildTrendChartSeries({
    points,
    metric,
    period,
    formatBucketLabel: (bucketStart) =>
      formatAnalyticsBucketLabel({ bucketStart, period, isCompact: true }),
  });

  // The chart draws no point marks, so a value with no neighbour would leave an empty plot.
  const hasLineToDraw = series.some(({ data }) =>
    data.some(({ y }, index) => isDefined(y) && isDefined(data[index - 1]?.y)),
  );

  if (!hasLineToDraw) {
    return <StyledMessage>{getNoLineText(trends)}</StyledMessage>;
  }

  // CustomLinesLayer paints the array backwards, so gray goes last to be drawn first, behind blue.
  const paintOrderSeries = [...series].reverse();

  const isRateMetric = isAnalyticsRateMetric(metric);
  const hasFractionalValues = isRateMetric || metric === 'MEDIAN_DAYS';

  // The automatic axis rounds a high rate up to 150%, but a fixed 0 to 100 would flatten a 5% line.
  const isFullScaleRate =
    isRateMetric &&
    series.some(({ data }) =>
      data.some(
        ({ y }) => isDefined(y) && y > RATE_AXIS_FULL_SCALE_ABOVE_PERCENT,
      ),
    );

  return (
    <StyledChartBox
      role="img"
      aria-label={t`${title}. The values are in the table below.`}
    >
      <PageLayoutEditModeProviderContext value={{ isInEditMode: false }}>
        <PageLayoutComponentInstanceContext.Provider
          value={{ instanceId: CRM_ANALYTICS_CHART_INSTANCE_ID }}
        >
          <WidgetComponentInstanceContext.Provider
            value={{ instanceId: CRM_ANALYTICS_CHART_INSTANCE_ID }}
          >
            <Suspense fallback={<AnalyticsSkeleton shape="chart" />}>
              <GraphWidgetLineChart
                id={CRM_ANALYTICS_CHART_INSTANCE_ID}
                colorMode="automaticPalette"
                data={paintOrderSeries}
                showLegend
                showGrid
                enableArea={false}
                suffix={isRateMetric ? '%' : undefined}
                decimals={hasFractionalValues ? 1 : undefined}
                rangeMin={isRateMetric ? 0 : undefined}
                rangeMax={isFullScaleRate ? 100 : undefined}
              />
            </Suspense>
          </WidgetComponentInstanceContext.Provider>
        </PageLayoutComponentInstanceContext.Provider>
      </PageLayoutEditModeProviderContext>
    </StyledChartBox>
  );
};
