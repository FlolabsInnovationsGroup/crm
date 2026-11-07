import { fireEvent, render, screen } from '@testing-library/react';

import { AnalyticsLineChart } from '@/crm-analytics/charts/AnalyticsLineChart';
import { AnalyticsSparkline } from '@/crm-analytics/charts/AnalyticsSparkline';
import {
  buildAnalyticsAreaPath,
  buildAnalyticsLinePath,
  getAnalyticsIsolatedPoints,
} from '@/crm-analytics/charts/buildAnalyticsLinePath';

// jsdom has no PointerEvent, so a pointer move would lose its position.
window.PointerEvent = window.MouseEvent as typeof PointerEvent;

const hoverAt = (target: Element, clientX: number) => {
  jest.spyOn(target, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 100,
    height: 100,
  } as DOMRect);

  fireEvent.pointerMove(target, { clientX });
};

const BUCKETS = ['Jan', 'Feb', 'Mar', 'Apr', 'May'].map((label) => ({
  key: label,
  label,
}));

const countLineStarts = (path: string | null | undefined) =>
  (path ?? '').split('M').length - 1;

describe('buildAnalyticsLinePath', () => {
  it('starts a new line after an unknown value', () => {
    expect(
      buildAnalyticsLinePath([
        { x: 0, y: 10 },
        { x: 1, y: 20 },
        null,
        { x: 3, y: 30 },
        { x: 4, y: 40 },
      ]),
    ).toBe('M0,10L1,20M3,30L4,40');
  });

  it('closes the area of each known run on the baseline and spans no gap', () => {
    expect(
      buildAnalyticsAreaPath(
        [{ x: 0, y: 10 }, { x: 1, y: 20 }, null, { x: 3, y: 30 }],
        100,
      ),
    ).toBe('M0,100L0,10L1,20L1,100Z');
  });

  it('finds a known value with no neighbour, which draws no line', () => {
    expect(
      getAnalyticsIsolatedPoints([
        { x: 0, y: 10 },
        null,
        { x: 2, y: 30 },
        { x: 3, y: 40 },
      ]),
    ).toEqual([{ x: 0, y: 10 }]);
  });
});

describe('AnalyticsLineChart', () => {
  it('leaves a gap for null, so the line never falls to the baseline', () => {
    const { container } = render(
      <AnalyticsLineChart
        ariaLabel="Conversion by month"
        buckets={BUCKETS}
        series={[{ key: 'all', label: 'All', values: [40, 50, null, 60, 70] }]}
      />,
    );

    expect(
      screen.getByRole('img', { name: 'Conversion by month' }),
    ).toBeInTheDocument();

    const linePath = container
      .querySelector('path[fill="none"]')
      ?.getAttribute('d');

    expect(countLineStarts(linePath)).toBe(2);
  });

  it('draws the gray previous series with its own gaps', () => {
    const { container } = render(
      <AnalyticsLineChart
        ariaLabel="New applications"
        buckets={BUCKETS}
        series={[{ key: 'all', label: 'All', values: [1, 2, 3, 4, 5] }]}
        previousValues={[1, 2, null, 3, 4]}
        previousLabel="Previous period"
      />,
    );

    const [previousPath, currentPath] = Array.from(
      container.querySelectorAll('path[fill="none"]'),
    ).map((path) => path.getAttribute('d'));

    expect(countLineStarts(previousPath)).toBe(2);
    expect(countLineStarts(currentPath)).toBe(1);
    expect(screen.getByText('Previous period')).toBeInTheDocument();
  });

  it('draws a value under the minimum lighter and gives its count in the tooltip', () => {
    const { container } = render(
      <AnalyticsLineChart
        ariaLabel="Conversion by month"
        buckets={BUCKETS}
        series={[
          {
            key: 'all',
            label: 'All',
            values: [0.5, 0.5, 0.25, 0.5, 0.5],
            sizes: [40, 40, 4, 40, 40],
            minimumSample: 30,
            formatSize: (size) => `of ${size} people`,
          },
        ]}
        formatValue={(value) => `${value * 100}%`}
      />,
    );

    const [solidPath, lighterPath] = Array.from(
      container.querySelectorAll('path[fill="none"]'),
    );

    expect(countLineStarts(solidPath.getAttribute('d'))).toBe(2);
    expect(countLineStarts(lighterPath.getAttribute('d'))).toBe(1);
    expect(lighterPath).toHaveAttribute('stroke-opacity');
    expect(solidPath).not.toHaveAttribute('stroke-opacity');

    hoverAt(container.querySelector('rect[fill="transparent"]') as Element, 50);

    expect(screen.getByText('25% of 4 people')).toBeInTheDocument();
    expect(
      screen.getByText('A small group, so read this with care.'),
    ).toBeInTheDocument();
  });

  it('labels five lines directly', () => {
    render(
      <AnalyticsLineChart
        ariaLabel="Five tracks"
        buckets={BUCKETS}
        series={[10, 30, 50, 70, 90].map((value) => ({
          key: `track${value}`,
          label: `Track ${value}`,
          values: [value, value, value, value, value],
        }))}
      />,
    );

    expect(screen.getByText('Track 90 90')).toBeInTheDocument();
    expect(screen.getByText('Track 10 10')).toBeInTheDocument();
  });

  it('makes a legend entry a button only when a click does something', () => {
    const onSeriesClick = jest.fn();

    const { rerender } = render(
      <AnalyticsLineChart
        ariaLabel="Two tracks"
        buckets={BUCKETS}
        series={[
          { key: 'first', label: 'First', values: [1, 2, 3, 4, 5] },
          { key: 'second', label: 'Second', values: [5, 4, 3, 2, 1] },
        ]}
        onSeriesClick={onSeriesClick}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Second' }));

    expect(onSeriesClick).toHaveBeenCalledWith('second');

    rerender(
      <AnalyticsLineChart
        ariaLabel="Two tracks"
        buckets={BUCKETS}
        series={[
          { key: 'first', label: 'First', values: [1, 2, 3, 4, 5] },
          { key: 'second', label: 'Second', values: [5, 4, 3, 2, 1] },
        ]}
      />,
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('drops the tooltip when new data lands under a still pointer', () => {
    const { container, rerender } = render(
      <AnalyticsLineChart
        ariaLabel="Trend"
        buckets={BUCKETS}
        series={[{ key: 'all', label: 'All', values: [1, 2, 3, 4, 5] }]}
      />,
    );

    hoverAt(container.querySelector('rect[fill="transparent"]') as Element, 100);

    expect(screen.getByText('All')).toBeInTheDocument();

    rerender(
      <AnalyticsLineChart
        ariaLabel="Trend"
        buckets={BUCKETS.slice(0, 2)}
        series={[{ key: 'all', label: 'All', values: [7, 8] }]}
      />,
    );

    expect(screen.queryByText('All')).not.toBeInTheDocument();
  });
});

describe('AnalyticsSparkline', () => {
  it('leaves a gap for null', () => {
    const { container } = render(
      <AnalyticsSparkline ariaLabel="Trend" values={[1, 2, null, 3, 4]} />,
    );

    expect(
      countLineStarts(container.querySelector('path')?.getAttribute('d')),
    ).toBe(2);
  });

  it('shows the exact value of the period under the pointer', () => {
    const { container } = render(
      <AnalyticsSparkline
        ariaLabel="Trend"
        values={[1, 2, 3]}
        marks={[1, 2, 3].map((value) => ({
          isLighter: false,
          tooltip: {
            title: `Week ${value}`,
            rows: [{ label: 'People', value: `${value}` }],
          },
        }))}
      />,
    );

    hoverAt(container.querySelector('rect') as Element, 100);

    expect(screen.getByText('Week 3')).toBeInTheDocument();
  });

  it('shows the first period when the pointer is on the first point', () => {
    const { container } = render(
      <AnalyticsSparkline
        ariaLabel="Trend"
        values={[1, 2, 3, 4, 5]}
        marks={[1, 2, 3, 4, 5].map((value) => ({
          isLighter: false,
          tooltip: { title: `Week ${value}`, rows: [] },
        }))}
      />,
    );

    hoverAt(container.querySelector('rect') as Element, 14);

    expect(screen.getByText('Week 1')).toBeInTheDocument();
  });
});
