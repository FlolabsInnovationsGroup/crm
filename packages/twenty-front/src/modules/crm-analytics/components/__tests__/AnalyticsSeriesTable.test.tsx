import { render, screen } from '@testing-library/react';
import { createStore, Provider as JotaiProvider } from 'jotai';

import { AnalyticsSeriesTable } from '@/crm-analytics/components/AnalyticsSeriesTable';

const buildPoint = (bucketStart: string, value: number, isPartial: boolean) => ({
  bucketStart,
  value,
  previousValue: null,
  size: null,
  previousSize: null,
  isPartial,
});

describe('AnalyticsSeriesTable', () => {
  it('marks only the running period as in progress', () => {
    render(
      <JotaiProvider store={createStore()}>
        <AnalyticsSeriesTable
          aria-label="New applications by track"
          metric="NEW_APPLICATIONS"
          period="WEEK"
          minimumSample={30}
          columns={[
            {
              key: 'AI',
              label: 'AI',
              points: [
                buildPoint('2026-10-26', 40, false),
                buildPoint('2026-11-02', 3, true),
              ],
            },
          ]}
        />
      </JotaiProvider>,
    );

    const rows = screen.getAllByRole('row');

    expect(rows[1]).toHaveTextContent('in progress');
    expect(rows[2]).not.toHaveTextContent('in progress');
  });
});
