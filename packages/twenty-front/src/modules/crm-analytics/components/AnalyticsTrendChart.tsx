import { i18n } from '@lingui/core';
import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { lazy, Suspense } from 'react';
import { isDefined } from 'twenty-shared/utils';

import { AnalyticsNotice } from '@/crm-analytics/components/AnalyticsSection';
import { AnalyticsSkeleton } from '@/crm-analytics/components/AnalyticsSkeleton';
import { CRM_ANALYTICS_CHART_INSTANCE_ID } from '@/crm-analytics/constants/CrmAnalyticsChartInstanceId';
import { type AnalyticsTrends } from '@/crm-analytics/types/AnalyticsApi';
import {
  buildTrendChartSeries,
  hasNoKnownAnalyticsRate,
  isAnalyticsRateMetric,
} from '@/crm-analytics/utils/buildTrendChartSeries';
import { formatAnalyticsBucketLabel } from '@/crm-analytics/utils/formatAnalyticsBucketLabel';
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

const StyledMessage = styled(AnalyticsNotice)`
  align-items: center;
  box-sizing: border-box;
  display: flex;
  justify-content: center;
  min-height: 120px;
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

  if (hasNoKnownAnalyticsRate(trends)) {
    return trends.period === 'MONTH'
      ? t`Tracking started ${trackingStartedOn}. No period here has a rate to draw. Try a longer date range.`
      : t`Tracking started ${trackingStartedOn}. No period here has a rate to draw. Try By month or a longer date range.`;
  }

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
  // Only the current values count: a gray line alone would sit under a legend entry for a missing blue one.
  const hasLineToDraw = points.some(
    ({ value }, index) =>
      isDefined(value) && isDefined(points[index - 1]?.value),
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
                showLegend={series.length > 1}
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
