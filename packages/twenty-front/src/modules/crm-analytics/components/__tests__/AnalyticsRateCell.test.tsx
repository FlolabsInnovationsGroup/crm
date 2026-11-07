import { render, screen } from '@testing-library/react';

import { AnalyticsRateCell } from '@/crm-analytics/components/AnalyticsRateCell';

describe('AnalyticsRateCell', () => {
  it('shows a measured rate as plain text', () => {
    render(<AnalyticsRateCell rate={0.4} eligible={120} />);

    expect(screen.getByText('40%')).toBeInTheDocument();
  });

  it('shows a measured zero when people were eligible', () => {
    render(<AnalyticsRateCell rate={0} eligible={120} />);

    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('shows the sample size under the minimum', () => {
    render(<AnalyticsRateCell rate={0.4} eligible={12} isUnderMinimum />);

    expect(screen.getByText('40%')).toBeInTheDocument();
    expect(screen.getByText('n=12')).toBeInTheDocument();
  });

  it('shows the so far form when the rate is not known yet', () => {
    render(<AnalyticsRateCell rate={null} soFarRate={0.12} eligible={0} />);

    expect(screen.getByText('12% so far')).toBeInTheDocument();
  });

  it('can shorten the unknown form for a dense grid, with the full phrase kept', () => {
    render(<AnalyticsRateCell rate={null} isCompact />);

    expect(screen.getByText('n/a')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('Not enough data')).toBeInTheDocument();
    expect(screen.getByTitle('Not enough data')).toBeInTheDocument();
  });

  it('keeps the so far form in a dense grid', () => {
    render(<AnalyticsRateCell rate={null} soFarRate={0.12} isCompact />);

    expect(screen.getByText('12% so far')).toBeInTheDocument();
    expect(screen.queryByText('n/a')).not.toBeInTheDocument();
  });

  it('never shows 0% for something unknown', () => {
    const { rerender, container } = render(<AnalyticsRateCell rate={null} />);

    expect(screen.getByText('Not enough data')).toBeInTheDocument();
    expect(container).not.toHaveTextContent('0%');

    rerender(<AnalyticsRateCell rate={null} soFarRate={0} eligible={0} />);

    expect(screen.getByText('Not enough data')).toBeInTheDocument();
    expect(container).not.toHaveTextContent('0%');

    rerender(<AnalyticsRateCell rate={0} eligible={0} />);

    expect(screen.getByText('Not enough data')).toBeInTheDocument();
    expect(container).not.toHaveTextContent('0%');
  });
});
