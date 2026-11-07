import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AnalyticsAnswerCards } from '@/crm-analytics/charts/AnalyticsAnswerCards';
import { AnalyticsChartCard } from '@/crm-analytics/charts/AnalyticsChartCard';
import { AnalyticsColumnChart } from '@/crm-analytics/charts/AnalyticsColumnChart';
import { AnalyticsDivergingBarChart } from '@/crm-analytics/charts/AnalyticsDivergingBarChart';
import { AnalyticsDonutChart } from '@/crm-analytics/charts/AnalyticsDonutChart';
import { AnalyticsFunnelChart } from '@/crm-analytics/charts/AnalyticsFunnelChart';
import { AnalyticsHeatmap } from '@/crm-analytics/charts/AnalyticsHeatmap';
import { AnalyticsHorizontalBarChart } from '@/crm-analytics/charts/AnalyticsHorizontalBarChart';
import { AnalyticsLineChart } from '@/crm-analytics/charts/AnalyticsLineChart';
import { AnalyticsScatterChart } from '@/crm-analytics/charts/AnalyticsScatterChart';
import { AnalyticsSparkline } from '@/crm-analytics/charts/AnalyticsSparkline';

// d3-shape ships as ES modules only, which this jest setup does not transform.
// Any test that renders the donut needs this mock.
jest.mock('d3-shape', () => ({
  arc: () => {
    const generator = () => 'M0,0';

    generator.innerRadius = () => generator;
    generator.outerRadius = () => generator;
    generator.padAngle = () => generator;

    return generator;
  },
  pie: () => {
    const generator = (slices: unknown[]) =>
      slices.map((data) => ({ data }));

    generator.value = () => generator;
    generator.sort = () => generator;
    generator.padAngle = () => generator;

    return generator;
  },
}));

const NO_DATA = 'Not enough data yet';

describe('charts with no data', () => {
  it.each([
    [
      'horizontal bars',
      <AnalyticsHorizontalBarChart key="bars" ariaLabel="Chart" rows={[]} />,
    ],
    [
      'columns',
      <AnalyticsColumnChart key="columns" ariaLabel="Chart" columns={[]} />,
    ],
    ['funnel', <AnalyticsFunnelChart key="funnel" ariaLabel="Chart" steps={[]} />],
    [
      'diverging bars',
      <AnalyticsDivergingBarChart
        key="diverging"
        ariaLabel="Chart"
        rows={[]}
        rightLabel="Entered"
        leftLabel="Left"
      />,
    ],
    [
      'heatmap',
      <AnalyticsHeatmap
        key="heatmap"
        ariaLabel="Chart"
        columns={[]}
        rows={[]}
      />,
    ],
    [
      'scatter',
      <AnalyticsScatterChart
        key="scatter"
        ariaLabel="Chart"
        points={[]}
        xLabel="People"
        yLabel="Conversion"
      />,
    ],
    ['donut', <AnalyticsDonutChart key="donut" ariaLabel="Chart" slices={[]} />],
    [
      'line',
      <AnalyticsLineChart key="line" ariaLabel="Chart" buckets={[]} series={[]} />,
    ],
  ])('%s says there is not enough data', (_name, chart) => {
    render(chart);

    expect(screen.getByText(NO_DATA)).toBeInTheDocument();
  });

  it('a line whose values are all unknown says so instead of drawing zeros', () => {
    render(
      <AnalyticsLineChart
        ariaLabel="Chart"
        buckets={[{ key: 'jan', label: 'Jan' }]}
        series={[{ key: 'all', label: 'All', values: [null] }]}
      />,
    );

    expect(screen.getByText(NO_DATA)).toBeInTheDocument();
  });

  it('a scatter leaves out unknown points and counts them', () => {
    render(
      <AnalyticsScatterChart
        ariaLabel="Chart"
        points={[
          { key: 'a', label: 'Design', x: 10, y: 0.2 },
          { key: 'b', label: 'Robotics', x: 20, y: null },
        ]}
        xLabel="People"
        yLabel="Conversion"
      />,
    );

    expect(screen.getByText('Design')).toBeInTheDocument();
    expect(screen.queryByText('Robotics')).not.toBeInTheDocument();
    expect(
      screen.getByText('1 not shown because there is not enough data yet.'),
    ).toBeInTheDocument();
  });

  it('a donut of nothing but zeros does not crash', () => {
    render(
      <AnalyticsDonutChart
        ariaLabel="Chart"
        slices={[{ key: 'a', label: 'Active', value: 0 }]}
      />,
    );

    expect(screen.getByText(NO_DATA)).toBeInTheDocument();
  });

  it('a donut names each part and puts the total in the center', () => {
    render(
      <AnalyticsDonutChart
        ariaLabel="Pipeline status"
        totalLabel="people"
        slices={[
          { key: 'active', label: 'Active', value: 3 },
          { key: 'left', label: 'Left', value: 1 },
        ]}
      />,
    );

    expect(
      screen.getByRole('img', { name: 'Pipeline status' }),
    ).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('people')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText(/75%/)).toBeInTheDocument();
  });

  it('a sparkline with no known value draws nothing', () => {
    const { container } = render(
      <AnalyticsSparkline ariaLabel="Trend" values={[null, null]} />,
    );

    expect(container.querySelector('path')).not.toBeInTheDocument();
  });

  it('a bar with no segments shows a dash and no bar', () => {
    render(
      <AnalyticsHorizontalBarChart
        ariaLabel="Chart"
        rows={[{ key: 'a', label: 'Design', segments: [] }]}
      />,
    );

    expect(screen.getByText('-')).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('an answer with no value shows a dash', () => {
    render(
      <AnalyticsAnswerCards
        cards={[{ key: 'a', label: 'Overall conversion', value: null }]}
      />,
    );

    expect(screen.getByText('-')).toBeInTheDocument();
  });
});

describe('AnalyticsChartCard', () => {
  it('keeps the numbers closed until asked', async () => {
    render(
      <AnalyticsChartCard
        title="Where is everyone now?"
        numbers={<div>The table</div>}
      >
        <div>The chart</div>
      </AnalyticsChartCard>,
    );

    expect(screen.getByText('The chart')).toBeInTheDocument();
    expect(screen.queryByText('The table')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Show numbers' }));

    expect(screen.getByText('The table')).toBeInTheDocument();
  });

  it('shows retry on an error, in place of the chart', async () => {
    const handleRetry = jest.fn();

    render(
      <AnalyticsChartCard
        title="Where is everyone now?"
        error={new Error('Query failed')}
        onRetry={handleRetry}
        numbers={<div>The table</div>}
      >
        <div>The chart</div>
      </AnalyticsChartCard>,
    );

    expect(screen.queryByText('The chart')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Show numbers' }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(handleRetry).toHaveBeenCalled();
  });
});
