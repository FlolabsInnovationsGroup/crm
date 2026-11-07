import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AnalyticsHeatmap } from '@/crm-analytics/charts/AnalyticsHeatmap';

const COLUMNS = [
  { key: 'NEW', label: 'New' },
  { key: 'CONTACTED', label: 'Contacted' },
  { key: 'SIGNED', label: 'Signed' },
];

describe('AnalyticsHeatmap', () => {
  it('shows a dash for unknown and a known zero as 0%', () => {
    render(
      <AnalyticsHeatmap
        ariaLabel="Conversion at every step"
        columns={COLUMNS}
        rows={[
          {
            key: 'ai',
            label: 'Artificial Intelligence',
            cells: [
              { columnKey: 'NEW', value: 0.5 },
              { columnKey: 'CONTACTED', value: null },
              { columnKey: 'SIGNED', value: 0 },
            ],
          },
        ]}
      />,
    );

    const table = screen.getByRole('table', {
      name: 'Conversion at every step',
    });
    const cells = within(table).getAllByRole('cell');

    expect(cells[0]).toHaveTextContent('50%');
    expect(within(cells[1]).getByText('-')).toBeInTheDocument();
    expect(cells[1]).not.toHaveTextContent('0%');
    expect(cells[2]).toHaveTextContent('0%');
  });

  it('treats a column with no cell as unknown', () => {
    render(
      <AnalyticsHeatmap
        ariaLabel="Conversion at every step"
        columns={COLUMNS}
        rows={[
          {
            key: 'ai',
            label: 'Artificial Intelligence',
            cells: [{ columnKey: 'NEW', value: 0.5 }],
          },
        ]}
      />,
    );

    const cells = screen.getAllByRole('cell');

    expect(within(cells[1]).getByText('-')).toBeInTheDocument();
    expect(within(cells[2]).getByText('-')).toBeInTheDocument();
  });

  it('says so far on a cell still in progress', () => {
    render(
      <AnalyticsHeatmap
        ariaLabel="Newer groups"
        columns={COLUMNS.slice(0, 1)}
        rows={[
          {
            key: 'june',
            label: 'People who applied in June',
            cells: [{ columnKey: 'NEW', value: 0.12, isInProgress: true }],
          },
        ]}
      />,
    );

    expect(screen.getByRole('cell')).toHaveTextContent('12%so far');
  });

  it('gives the row key on a row click', async () => {
    const handleRowClick = jest.fn();

    render(
      <AnalyticsHeatmap
        ariaLabel="Conversion at every step"
        columns={COLUMNS.slice(0, 1)}
        rows={[
          {
            key: 'ai',
            label: 'Artificial Intelligence',
            cells: [{ columnKey: 'NEW', value: 0.5 }],
          },
        ]}
        onRowClick={handleRowClick}
      />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Artificial Intelligence' }),
    );

    expect(handleRowClick).toHaveBeenCalledWith('ai');
  });
});
