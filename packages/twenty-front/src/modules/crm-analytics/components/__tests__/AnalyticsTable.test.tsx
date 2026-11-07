import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AnalyticsTable } from '@/crm-analytics/components/AnalyticsTable';

const TABLE_BODY = (
  <tbody>
    <tr>
      <td>Value</td>
    </tr>
  </tbody>
);

describe('AnalyticsTable', () => {
  it('lets the keyboard reach a scrolling box with nothing focusable inside', async () => {
    const user = userEvent.setup();

    render(
      <AnalyticsTable.Root aria-label="Stage movement">
        {TABLE_BODY}
      </AnalyticsTable.Root>,
    );

    await user.tab();

    expect(screen.getByRole('region', { name: 'Stage movement' })).toHaveFocus();
    expect(
      screen.getByRole('table', { name: 'Stage movement' }),
    ).toBeInTheDocument();
  });

  it('adds no tab stop when the rows take focus themselves', () => {
    render(
      <AnalyticsTable.Root aria-label="People to follow up" hasFocusableRows>
        {TABLE_BODY}
      </AnalyticsTable.Root>,
    );

    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });
});
