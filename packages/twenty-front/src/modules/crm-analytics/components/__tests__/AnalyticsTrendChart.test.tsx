import { render, screen } from '@testing-library/react';
import { createStore, Provider as JotaiProvider } from 'jotai';

import { AnalyticsTrendChart } from '@/crm-analytics/components/AnalyticsTrendChart';
import { CRM_ANALYTICS_CHART_INSTANCE_ID } from '@/crm-analytics/constants/CrmAnalyticsChartInstanceId';
import {
  type AnalyticsTrendPoint,
  type AnalyticsTrends,
} from '@/crm-analytics/types/AnalyticsApi';
import { usePageLayoutEditModeContext } from '@/page-layout/contexts/PageLayoutEditModeContext';
import { PageLayoutComponentInstanceContext } from '@/page-layout/states/contexts/PageLayoutComponentInstanceContext';
import { WidgetComponentInstanceContext } from '@/page-layout/widgets/states/contexts/WidgetComponentInstanceContext';
import { useAvailableComponentInstanceIdOrThrow } from '@/ui/utilities/state/component-state/hooks/useAvailableComponentInstanceIdOrThrow';

const mockLineChartRender = jest.fn();

// nivo's d3 dependencies are ESM, which this jest config does not transform, so the chart cannot load here.
// This stand-in reads the contexts the real chart reads, so a missing provider still fails.
const MockLineChart = (props: Record<string, unknown>) => {
  const { isInEditMode } = usePageLayoutEditModeContext();
  const widgetInstanceId = useAvailableComponentInstanceIdOrThrow(
    WidgetComponentInstanceContext,
  );
  const pageLayoutInstanceId = useAvailableComponentInstanceIdOrThrow(
    PageLayoutComponentInstanceContext,
  );

  mockLineChartRender({
    ...props,
    isInEditMode,
    widgetInstanceId,
    pageLayoutInstanceId,
  });

  return <div>Line chart</div>;
};

jest.mock(
  '@/page-layout/widgets/graph/graph-widget-line-chart/components/GraphWidgetLineChart',
  () => ({
    GraphWidgetLineChart: (props: Record<string, unknown>) => (
      <MockLineChart {...props} />
    ),
  }),
);

const buildPoint = (
  bucketStart: string,
  value: number | null,
  previousValue: number | null = null,
): AnalyticsTrendPoint => ({
  bucketStart,
  value,
  previousValue,
  size: null,
  previousSize: null,
  isPartial: false,
});

const buildTrends = (overrides: Partial<AnalyticsTrends>): AnalyticsTrends => ({
  asOf: '2026-11-07T10:00:00.000Z',
  trackingStartedAt: '2026-10-27T00:00:00.000Z',
  reportingTimeZone: 'UTC',
  minimumSample: 30,
  metric: 'NEW_APPLICATIONS',
  stageKey: null,
  period: 'WEEK',
  unavailableReason: null,
  series: [],
  cohorts: [],
  movement: { from: '2026-11-02', to: '2026-11-07', rows: [] },
  ...overrides,
});

const renderChart = (overrides: Partial<AnalyticsTrends>) =>
  render(
    <JotaiProvider store={createStore()}>
      <AnalyticsTrendChart
        title="New applications by week"
        trends={buildTrends(overrides)}
      />
    </JotaiProvider>,
  );

const renderChartAndGetProps = async (overrides: Partial<AnalyticsTrends>) => {
  renderChart(overrides);

  await screen.findByText('Line chart');

  return mockLineChartRender.mock.lastCall?.[0];
};

const TWO_BUCKETS = [
  buildPoint('2026-10-26', 74),
  buildPoint('2026-11-02', 86),
];

describe('AnalyticsTrendChart', () => {
  beforeEach(() => {
    mockLineChartRender.mockClear();
  });

  it('names the chart and points to the table', async () => {
    await renderChartAndGetProps({ series: TWO_BUCKETS });

    expect(
      screen.getByRole('img', {
        name: 'New applications by week. The values are in the table below.',
      }),
    ).toBeInTheDocument();
  });

  it('provides the contexts the chart reads', async () => {
    const props = await renderChartAndGetProps({ series: TWO_BUCKETS });

    expect(props.isInEditMode).toBe(false);
    expect(props.widgetInstanceId).toBe(CRM_ANALYTICS_CHART_INSTANCE_ID);
    expect(props.pageLayoutInstanceId).toBe(CRM_ANALYTICS_CHART_INSTANCE_ID);
  });

  it('keeps a null bucket as null, never 0', async () => {
    const props = await renderChartAndGetProps({
      series: [
        buildPoint('2026-10-05', 10),
        buildPoint('2026-10-12', 12),
        buildPoint('2026-10-19', null),
        buildPoint('2026-10-26', 14),
        buildPoint('2026-11-02', 16),
      ],
    });

    expect(props.data).toHaveLength(1);
    expect(
      props.data[0].data.map((point: { y: number | null }) => point.y),
    ).toEqual([10, 12, null, 14, 16]);
  });

  it('orders the series so gray is painted first, behind blue', async () => {
    const props = await renderChartAndGetProps({
      series: [
        buildPoint('2026-10-26', 74, 60),
        buildPoint('2026-11-02', 86, 52),
      ],
    });

    // CustomLinesLayer paints the array backwards.
    expect(props.data.map((series: { color: string }) => series.color)).toEqual(
      ['blue', 'gray'],
    );
  });

  it('draws lines only, with the named colors kept', async () => {
    const props = await renderChartAndGetProps({ series: TWO_BUCKETS });

    expect(props.id).toBe(CRM_ANALYTICS_CHART_INSTANCE_ID);
    expect(props.colorMode).toBe('automaticPalette');
    expect(props.enableArea).toBe(false);
    expect(props.showGrid).toBe(true);
  });

  it('has no legend for a single line', async () => {
    const props = await renderChartAndGetProps({ series: TWO_BUCKETS });

    expect(props.showLegend).toBe(false);
  });

  it('has a legend to tell two lines apart', async () => {
    const props = await renderChartAndGetProps({
      series: [
        buildPoint('2026-10-26', 74, 60),
        buildPoint('2026-11-02', 86, 52),
      ],
    });

    expect(props.showLegend).toBe(true);
  });

  it('passes rates as 0 to 100 with a percent suffix', async () => {
    const props = await renderChartAndGetProps({
      metric: 'OVERALL_CONVERSION',
      series: [buildPoint('2026-10-26', 0.123), buildPoint('2026-11-02', 0.2)],
    });

    expect(props.suffix).toBe('%');
    expect(props.decimals).toBe(1);
    expect(props.data[0].data[0].y).toBe(12.3);
  });

  it('keeps a high rate axis at 100%', async () => {
    const props = await renderChartAndGetProps({
      metric: 'DROP_OFF',
      series: [buildPoint('2026-10-26', 0.9), buildPoint('2026-11-02', 0.95)],
    });

    expect(props.rangeMin).toBe(0);
    expect(props.rangeMax).toBe(100);
  });

  it('counts the gray line when deciding on the full rate axis', async () => {
    const props = await renderChartAndGetProps({
      metric: 'DROP_OFF',
      series: [
        buildPoint('2026-10-26', 0.2, 0.95),
        buildPoint('2026-11-02', 0.3, 0.9),
      ],
    });

    expect(props.rangeMax).toBe(100);
  });

  it('lets a low rate keep its own scale so its movement stays visible', async () => {
    const props = await renderChartAndGetProps({
      metric: 'OVERALL_CONVERSION',
      series: [buildPoint('2026-10-26', 0.04), buildPoint('2026-11-02', 0.06)],
    });

    expect(props.rangeMin).toBe(0);
    expect(props.rangeMax).toBeUndefined();
  });

  it('keeps counts free of a suffix, a fixed decimal and a fixed range', async () => {
    const props = await renderChartAndGetProps({ series: TWO_BUCKETS });

    expect(props.suffix).toBeUndefined();
    expect(props.decimals).toBeUndefined();
    expect(props.rangeMin).toBeUndefined();
    expect(props.rangeMax).toBeUndefined();
  });

  it('labels weeks with short dates', async () => {
    const props = await renderChartAndGetProps({ series: TWO_BUCKETS });

    expect(props.data[0].data[1].x).toBe('Nov 2');
  });

  it('labels months with their year, so two Novembers stay apart', async () => {
    const props = await renderChartAndGetProps({
      period: 'MONTH',
      series: [buildPoint('2026-10-01', 74), buildPoint('2026-11-01', 86)],
    });

    expect(props.data[0].data[1].x).toBe('Nov 2026');
  });

  it('shows the plain reason in place of the chart', () => {
    renderChart({ unavailableReason: 'DAILY_RATE' });

    expect(
      screen.getByText(
        'Daily rates are not offered. Choose weeks or months in the Period filter.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(mockLineChartRender).not.toHaveBeenCalled();
  });

  it('says so when no two neighbouring buckets have a value', () => {
    renderChart({
      series: [
        buildPoint('2026-10-19', 12),
        buildPoint('2026-10-26', null),
        buildPoint('2026-11-02', null),
      ],
    });

    expect(
      screen.getByText('Not enough points to draw a line yet.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('explains a rate line with no two neighbouring periods', () => {
    renderChart({
      metric: 'OVERALL_CONVERSION',
      series: [
        buildPoint('2026-10-19', 0.3),
        buildPoint('2026-10-26', null),
        buildPoint('2026-11-02', 0.4),
      ],
    });

    expect(
      screen.getByText(
        'Tracking started Oct 27, 2026. The line needs two periods in a row whose people have passed the window.',
      ),
    ).toBeInTheDocument();
  });

  describe('a rate with no known period', () => {
    const TWELVE_WEEKS_OF_PREVIOUS_VALUES_ONLY = Array.from(
      { length: 12 },
      (_, index) =>
        buildPoint(
          `2026-08-${String(10 + index).padStart(2, '0')}`,
          null,
          0.3,
        ),
    );

    it('offers another view and never draws the gray line alone', () => {
      renderChart({
        metric: 'OVERALL_CONVERSION',
        series: TWELVE_WEEKS_OF_PREVIOUS_VALUES_ONLY,
      });

      expect(
        screen.getByText(
          'Tracking started Oct 27, 2026. No period here has a rate to draw. Try By month or a longer date range.',
        ),
      ).toBeInTheDocument();
      expect(screen.queryByRole('img')).not.toBeInTheDocument();
      expect(mockLineChartRender).not.toHaveBeenCalled();
    });

    it('does not offer By month when already by month', () => {
      renderChart({
        metric: 'OVERALL_CONVERSION',
        period: 'MONTH',
        series: TWELVE_WEEKS_OF_PREVIOUS_VALUES_ONLY,
      });

      expect(
        screen.getByText(
          'Tracking started Oct 27, 2026. No period here has a rate to draw. Try a longer date range.',
        ),
      ).toBeInTheDocument();
    });
  });

  it('does not draw a count whose only line is the gray one', () => {
    renderChart({
      series: [
        buildPoint('2026-10-26', null, 60),
        buildPoint('2026-11-02', 86, 52),
      ],
    });

    expect(
      screen.getByText('Not enough points to draw a line yet.'),
    ).toBeInTheDocument();
    expect(mockLineChartRender).not.toHaveBeenCalled();
  });
});
