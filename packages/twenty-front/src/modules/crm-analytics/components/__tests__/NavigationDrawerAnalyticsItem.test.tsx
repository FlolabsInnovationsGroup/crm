import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import { createStore, Provider as JotaiProvider } from 'jotai';
import { MemoryRouter } from 'react-router-dom';

import { NavigationDrawerAnalyticsItem } from '@/crm-analytics/components/NavigationDrawerAnalyticsItem';
import { useHasPermissionFlag } from '@/settings/roles/hooks/useHasPermissionFlag';
import { PermissionFlagType } from '~/generated-metadata/graphql';

jest.mock('@/settings/roles/hooks/useHasPermissionFlag');

const renderItem = () =>
  render(
    <I18nProvider i18n={i18n}>
      <JotaiProvider store={createStore()}>
        <MemoryRouter initialEntries={['/analytics']}>
          <NavigationDrawerAnalyticsItem />
        </MemoryRouter>
      </JotaiProvider>
    </I18nProvider>,
  );

describe('NavigationDrawerAnalyticsItem', () => {
  it('is hidden without the flag', () => {
    jest.mocked(useHasPermissionFlag).mockReturnValue(false);

    renderItem();

    expect(useHasPermissionFlag).toHaveBeenCalledWith(
      PermissionFlagType.EXPORT_CSV,
    );
    expect(screen.queryByText('Analytics')).not.toBeInTheDocument();
  });

  it('shows with the flag', () => {
    jest.mocked(useHasPermissionFlag).mockReturnValue(true);

    renderItem();

    expect(screen.getByText('Analytics')).toBeInTheDocument();
  });
});
