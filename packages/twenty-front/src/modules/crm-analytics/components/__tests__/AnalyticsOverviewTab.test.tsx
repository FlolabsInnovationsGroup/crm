import { type ErrorLike } from '@apollo/client';
import { MockedProvider } from '@apollo/client/testing/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createStore, Provider as JotaiProvider } from 'jotai';
import { type ComponentProps } from 'react';

import { AnalyticsOverviewTab } from '@/crm-analytics/components/AnalyticsOverviewTab';
import { CRM_ANALYTICS_DEFAULT_FILTER } from '@/crm-analytics/constants/CrmAnalyticsDefaultFilter';
import { GET_CRM_ANALYTICS_OVERVIEW } from '@/crm-analytics/graphql/getCrmAnalyticsOverview';
import {
  type AnalyticsMeta,
  type AnalyticsOverview,
} from '@/crm-analytics/types/AnalyticsApi';

const mockToast = jest.fn();

jest.mock('@/apollo/components/ToastOnQueryErrorEffect', () => ({
  ToastOnQueryErrorEffect: ({ error }: { error?: ErrorLike }) => {
    if (error !== undefined) {
      mockToast(error);
    }

    return null;
  },
}));

jest.mock('@/side-panel/hooks/useOpenRecordInSidePanel', () => ({
  useOpenRecordInSidePanel: () => ({ openRecordInSidePanel: jest.fn() }),
}));

const META = { showSignedFigure: false } as AnalyticsMeta;

const buildOverview = (
  overrides: Partial<AnalyticsOverview>,
): AnalyticsOverview => ({
  asOf: '2026-11-07T10:00:00.000Z',
  trackingStartedAt: '2026-10-27T00:00:00.000Z',
  reportingTimeZone: 'UTC',
  minimumSample: 30,
  importedExcludedByDate: 0,
  figures: {
    totalContacts: 42975,
    activePeople: 1284,
    newApplications: 86,
    newApplicationsPrevious: 74,
    newApplicationsFrom: '2026-11-01',
    newApplicationsTo: '2026-11-07',
    importedApplications: 42371,
    stuckPeople: 214,
    inactivePeople: 3810,
    signedPeople: 12,
  },
  stageTotals: [
    {
      rowKey: 'NEW',
      label: 'New',
      rowKind: 'MAIN',
      parentStageKey: null,
      count: 900,
      pastLimitCount: 120,
    },
    {
      rowKey: 'NEW_REMINDER',
      label: 'New reminder',
      rowKind: 'NESTED',
      parentStageKey: 'NEW',
      count: 40,
      pastLimitCount: null,
    },
    {
      rowKey: 'LEGACY_TEST',
      label: 'LEGACY_TEST',
      rowKind: 'UNMAPPED',
      parentStageKey: null,
      count: 3,
      pastLimitCount: null,
    },
  ],
  stuck: { rows: [], total: 0, hasLimits: true },
  ...overrides,
});

const overviewMock = (overview: AnalyticsOverview | null) => ({
  request: {
    query: GET_CRM_ANALYTICS_OVERVIEW,
    variables: { filter: CRM_ANALYTICS_DEFAULT_FILTER },
  },
  result: {
    data: {
      getCrmAnalyticsOverview: {
        __typename: 'CrmAnalyticsPayload',
        payload: overview,
      },
    },
  },
  maxUsageCount: Number.POSITIVE_INFINITY,
});

const errorMock = (code: string) => ({
  request: {
    query: GET_CRM_ANALYTICS_OVERVIEW,
    variables: { filter: CRM_ANALYTICS_DEFAULT_FILTER },
  },
  result: { errors: [{ message: 'Query failed', extensions: { code } }] },
  maxUsageCount: Number.POSITIVE_INFINITY,
});

const renderTab = (
  mocks: ComponentProps<typeof MockedProvider>['mocks'],
  onResetFilter: () => void = jest.fn(),
) =>
  render(
    <JotaiProvider store={createStore()}>
      <MockedProvider mocks={mocks}>
        <AnalyticsOverviewTab
          filter={CRM_ANALYTICS_DEFAULT_FILTER}
          meta={META}
          onResetFilter={onResetFilter}
        />
      </MockedProvider>
    </JotaiProvider>,
  );

describe('AnalyticsOverviewTab', () => {
  beforeEach(() => {
    mockToast.mockClear();
  });

  it('shows skeletons on first load', () => {
    renderTab([overviewMock(buildOverview({}))]);

    expect(screen.getAllByRole('status', { name: 'Loading' })).not.toHaveLength(
      0,
    );
  });

  it('shows the takeaway, figures and stage totals', async () => {
    renderTab([overviewMock(buildOverview({}))]);

    expect(
      await screen.findByText(
        '1,284 active people, 214 past their stage limit.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('1,284')).toBeInTheDocument();
    expect(screen.getByText('86')).toBeInTheDocument();
    expect(
      screen.getByText('+12 against the previous period'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('42,371 imported, dates unknown'),
    ).toBeInTheDocument();
    expect(screen.getByText('3,810 inactive')).toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.getByText('New reminder')).toBeInTheDocument();
  });

  it('always shows an unmapped stage with its raw value', async () => {
    renderTab([overviewMock(buildOverview({}))]);

    expect(
      await screen.findByText('Unmapped: LEGACY_TEST'),
    ).toBeInTheDocument();
  });

  it('never shows a number for unknown new applications', async () => {
    const overview = buildOverview({});

    renderTab([
      overviewMock({
        ...overview,
        figures: {
          ...overview.figures,
          newApplications: null,
          newApplicationsPrevious: null,
          importedApplications: null,
        },
      }),
    ]);

    expect(await screen.findByText('Not available')).toBeInTheDocument();
    expect(screen.queryByText('86')).not.toBeInTheDocument();
  });

  it('shows the signed figure only when asked to', async () => {
    renderTab([overviewMock(buildOverview({}))]);

    await screen.findByText('1,284');

    expect(screen.queryByText('Signed')).not.toBeInTheDocument();
  });

  it('reports imported people left out by the date filter', async () => {
    renderTab([overviewMock(buildOverview({ importedExcludedByDate: 42000 }))]);

    expect(
      await screen.findByText(
        '42,000 imported people have no known application date and are not shown.',
      ),
    ).toBeInTheDocument();
  });

  it('offers a reset when no people match', async () => {
    const user = userEvent.setup();
    const onResetFilter = jest.fn();
    const overview = buildOverview({});

    renderTab(
      [
        overviewMock({
          ...overview,
          figures: { ...overview.figures, totalContacts: 0, activePeople: 0 },
        }),
      ],
      onResetFilter,
    );

    expect(
      await screen.findByText('No people match these filters'),
    ).toBeInTheDocument();

    await user.click(screen.getByText('Reset filters'));

    expect(onResetFilter).toHaveBeenCalledTimes(1);
  });

  it('shows the access message without a toast when forbidden', async () => {
    renderTab([errorMock('FORBIDDEN')]);

    expect(
      await screen.findByText(
        'You do not have access to analytics. Ask an admin.',
      ),
    ).toBeInTheDocument();
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('shows retry and a toast on another error', async () => {
    renderTab([errorMock('INTERNAL_SERVER_ERROR')]);

    expect(await screen.findByText('Retry')).toBeInTheDocument();
    expect(mockToast).toHaveBeenCalled();
  });

  it('treats a null payload as switched off', async () => {
    renderTab([overviewMock(null)]);

    expect(
      await screen.findByText('Analytics is switched off.'),
    ).toBeInTheDocument();
  });
});
