import { render, screen } from '@testing-library/react';

import { AnalyticsChartCard } from '@/crm-analytics/charts/AnalyticsChartCard';

describe('AnalyticsChartCard', () => {
  it('keeps old numbers on screen and marks the card busy while newer ones load', () => {
    render(
      <AnalyticsChartCard title="People by track" isRefetching>
        Old numbers
      </AnalyticsChartCard>,
    );

    expect(screen.getByRole('region', { name: 'People by track' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(screen.getByText('Old numbers')).toBeInTheDocument();
  });

  it('is not busy by default', () => {
    render(
      <AnalyticsChartCard title="People by track">Numbers</AnalyticsChartCard>,
    );

    expect(screen.getByRole('region', { name: 'People by track' })).toHaveAttribute(
      'aria-busy',
      'false',
    );
  });
});
