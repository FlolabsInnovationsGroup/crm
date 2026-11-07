import { render, screen } from '@testing-library/react';

import { AnalyticsColumnChart } from '@/crm-analytics/charts/AnalyticsColumnChart';

const LABELS = [
  'New',
  'Contacted',
  'Before',
  'Saturday',
  'Attended',
  'Second',
  'Agreement',
  'Signed',
];

const COLUMNS = LABELS.map((label) => ({
  key: label,
  label,
  segments: [{ key: 'people', label: 'People', value: 10 }],
}));

describe('AnalyticsColumnChart', () => {
  it('names every column on an axis of stages, however narrow', () => {
    render(<AnalyticsColumnChart ariaLabel="Steps" columns={COLUMNS} />);

    LABELS.forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
  });

  it('skips labels on a date axis too narrow to hold them all', () => {
    render(
      <AnalyticsColumnChart ariaLabel="Weeks" columns={COLUMNS} isTimeAxis />,
    );

    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.queryByText('Contacted')).not.toBeInTheDocument();
  });
});
