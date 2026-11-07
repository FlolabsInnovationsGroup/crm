import { type ErrorLike } from '@apollo/client';
import { MockedProvider } from '@apollo/client/testing/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createStore, Provider as JotaiProvider } from 'jotai';
import { type ComponentProps } from 'react';
import { MemoryRouter } from 'react-router-dom';

import { AnalyticsContent } from '@/crm-analytics/components/AnalyticsContent';
import { CRM_ANALYTICS_DEFAULT_FILTER } from '@/crm-analytics/constants/CrmAnalyticsDefaultFilter';
import { GET_CRM_ANALYTICS_FUNNEL } from '@/crm-analytics/graphql/getCrmAnalyticsFunnel';
import { GET_CRM_ANALYTICS_META } from '@/crm-analytics/graphql/getCrmAnalyticsMeta';
import { GET_CRM_ANALYTICS_OVERVIEW } from '@/crm-analytics/graphql/getCrmAnalyticsOverview';
import {
  type AnalyticsMeta,
  type AnalyticsOverview,
} from '@/crm-analytics/types/AnalyticsApi';

// d3-shape ships as ES modules only, which this jest setup does not transform.
jest.mock('d3-shape', () => ({
  arc: () => {
    const generator = () => 'M0,0';

    generator.innerRadius = () => generator;
    generator.outerRadius = () => generator;

    return generator;
  },
  pie: () => {
    const generator = (slices: unknown[]) => slices.map((data) => ({ data }));

    generator.value = () => generator;
    generator.sort = () => generator;
    generator.padAngle = () => generator;

    return generator;
  },
}));

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

const ACTIVE_PEOPLE_FIGURE = '1,284';

const buildMeta = (overrides: Partial<AnalyticsMeta>): AnalyticsMeta => ({
  asOf: '2026-11-07T10:00:00.000Z',
  trackingStartedAt: '2026-10-27T00:00:00.000Z',
  reportingTimeZone: 'UTC',
  minimumSample: 30,
  state: 'READY',
  isProvisional: false,
  showSignedFigure: false,
  sync: {
    lastSuccessfulSyncAt: '2026-11-07T09:50:00.000Z',
    lastReconciliationAt: null,
    lastAttemptAt: '2026-11-07T09:50:00.000Z',
    lastAttemptStatus: 'OK',
    isStale: false,
    restoredInLastReconciliation: null,
  },
  fields: {
    stage: 'OK',
    isStageAuditLogged: true,
    positionsAppliedFor: 'OK',
    applicantSource: 'OK',
    hasFormSubmissionObject: true,
    hasApplicationObject: true,
  },
  stages: [],
  tracks: [],
  programs: [],
  sources: [],
  ...overrides,
});

const OVERVIEW: AnalyticsOverview = {
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
    signedPeople: null,
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
  ],
  stuck: { rows: [], total: 0, hasLimits: true },
};

const buildPayload = (payload: unknown) => ({
  __typename: 'CrmAnalyticsPayload',
  payload,
});

const metaMock = (meta: AnalyticsMeta | null) => ({
  request: { query: GET_CRM_ANALYTICS_META },
  result: { data: { getCrmAnalyticsMeta: buildPayload(meta) } },
  maxUsageCount: Number.POSITIVE_INFINITY,
});

const metaErrorMock = (code: string) => ({
  request: { query: GET_CRM_ANALYTICS_META },
  result: {
    errors: [{ message: 'Query failed', extensions: { code } }],
  },
  maxUsageCount: Number.POSITIVE_INFINITY,
});

const OVERVIEW_MOCK = {
  request: {
    query: GET_CRM_ANALYTICS_OVERVIEW,
    variables: { filter: CRM_ANALYTICS_DEFAULT_FILTER },
  },
  result: { data: { getCrmAnalyticsOverview: buildPayload(OVERVIEW) } },
  maxUsageCount: Number.POSITIVE_INFINITY,
};

const renderContent = (mocks: ComponentProps<typeof MockedProvider>['mocks']) =>
  render(
    <JotaiProvider store={createStore()}>
      <MockedProvider mocks={mocks}>
        <MemoryRouter>
          <AnalyticsContent />
        </MemoryRouter>
      </MockedProvider>
    </JotaiProvider>,
  );

describe('AnalyticsContent', () => {
  beforeEach(() => {
    mockToast.mockClear();
  });

  it('shows skeletons on first load', () => {
    renderContent([metaMock(buildMeta({}))]);

    expect(screen.getAllByRole('status', { name: 'Loading' })).not.toHaveLength(
      0,
    );
    expect(screen.queryByText(ACTIVE_PEOPLE_FIGURE)).not.toBeInTheDocument();
  });

  it('shows the numbers when ready', async () => {
    renderContent([metaMock(buildMeta({})), OVERVIEW_MOCK]);

    expect(await screen.findByText(ACTIVE_PEOPLE_FIGURE)).toBeInTheDocument();
    expect(
      screen.getByText('1,284 active people, 214 past their stage limit.'),
    ).toBeInTheDocument();
  });

  it('shows the access message and no numbers or toast when forbidden', async () => {
    renderContent([metaErrorMock('FORBIDDEN'), OVERVIEW_MOCK]);

    expect(
      await screen.findByText(
        'You do not have access to analytics. Ask an admin.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(ACTIVE_PEOPLE_FIGURE)).not.toBeInTheDocument();
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('shows retry and a toast on another error, without talking about tabs', async () => {
    renderContent([metaErrorMock('INTERNAL_SERVER_ERROR')]);

    expect(
      await screen.findByText('Analytics could not load'),
    ).toBeInTheDocument();
    expect(screen.getByText('Retry')).toBeInTheDocument();
    expect(screen.queryByText(/other tabs/)).not.toBeInTheDocument();
    expect(mockToast).toHaveBeenCalled();
  });

  it.each([
    ['DISABLED', 'Analytics is switched off.'],
    [
      'NO_STAGE_FIELD',
      'This workspace has no Stage field on People, so there is nothing to measure yet.',
    ],
    ['NEVER_SYNCED', 'The first sync has not finished.'],
  ] as const)('hides the numbers for state %s', async (state, message) => {
    renderContent([metaMock(buildMeta({ state })), OVERVIEW_MOCK]);

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByText(ACTIVE_PEOPLE_FIGURE)).not.toBeInTheDocument();
    expect(screen.queryByText('Overview')).not.toBeInTheDocument();
  });

  it('treats a null payload as switched off', async () => {
    renderContent([metaMock(null)]);

    expect(
      await screen.findByText('Analytics is switched off.'),
    ).toBeInTheDocument();
  });

  it('keeps the numbers and warns when stale', async () => {
    renderContent([
      metaMock(
        buildMeta({
          sync: {
            lastSuccessfulSyncAt: '2026-11-07T07:00:00.000Z',
            lastReconciliationAt: null,
            lastAttemptAt: '2026-11-07T09:50:00.000Z',
            lastAttemptStatus: 'FAILED',
            isStale: true,
            restoredInLastReconciliation: null,
          },
        }),
      ),
      OVERVIEW_MOCK,
    ]);

    expect(await screen.findByText(ACTIVE_PEOPLE_FIGURE)).toBeInTheDocument();
    expect(
      screen.getByText(
        'No successful sync in the last hour. Numbers may be out of date.',
      ),
    ).toBeInTheDocument();
  });

  it('warns when stage changes are not recorded', async () => {
    renderContent([
      metaMock(
        buildMeta({
          fields: {
            stage: 'OK',
            isStageAuditLogged: false,
            positionsAppliedFor: 'OK',
            applicantSource: 'OK',
            hasFormSubmissionObject: true,
            hasApplicationObject: true,
          },
        }),
      ),
      OVERVIEW_MOCK,
    ]);

    expect(
      await screen.findByText(
        'Stage changes are not being recorded on the timeline.',
      ),
    ).toBeInTheDocument();
  });

  describe('the daily count', () => {
    const buildMetaWithLastDailyRun = (lastReconciliationAt: string | null) =>
      buildMeta({
        sync: {
          lastSuccessfulSyncAt: '2026-11-07T09:50:00.000Z',
          lastReconciliationAt,
          lastAttemptAt: '2026-11-07T09:50:00.000Z',
          lastAttemptStatus: 'OK',
          isStale: false,
          restoredInLastReconciliation: null,
        },
      });

    it('warns when it has not run for over a day', async () => {
      renderContent([
        metaMock(buildMetaWithLastDailyRun('2026-11-06T02:30:00.000Z')),
        OVERVIEW_MOCK,
      ]);

      expect(
        await screen.findByText(
          'The daily count has not run since Nov 6, 2026. Trends and reports may be missing.',
        ),
      ).toBeInTheDocument();
    });

    it('warns when it has never run', async () => {
      renderContent([metaMock(buildMetaWithLastDailyRun(null)), OVERVIEW_MOCK]);

      expect(
        await screen.findByText(
          'The daily count has not run yet. Trends and reports may be missing.',
        ),
      ).toBeInTheDocument();
    });

    it('says nothing while it runs on time', async () => {
      renderContent([
        metaMock(buildMetaWithLastDailyRun('2026-11-07T02:30:00.000Z')),
        OVERVIEW_MOCK,
      ]);

      await screen.findByText(ACTIVE_PEOPLE_FIGURE);

      expect(screen.queryByText(/daily count/)).not.toBeInTheDocument();
    });
  });

  describe('reading the sync state again on a tab change', () => {
    const STALE_BANNER =
      'No successful sync in the last hour. Numbers may be out of date.';

    const META_READ_AT = '2026-11-07T10:00:00.000Z';

    const META_MOCKS = [
      {
        request: { query: GET_CRM_ANALYTICS_META },
        result: { data: { getCrmAnalyticsMeta: buildPayload(buildMeta({})) } },
      },
      {
        request: { query: GET_CRM_ANALYTICS_META },
        result: {
          data: {
            getCrmAnalyticsMeta: buildPayload(
              buildMeta({
                sync: {
                  lastSuccessfulSyncAt: '2026-11-07T07:00:00.000Z',
                  lastReconciliationAt: null,
                  lastAttemptAt: '2026-11-07T09:50:00.000Z',
                  lastAttemptStatus: 'FAILED',
                  isStale: true,
                  restoredInLastReconciliation: null,
                },
              }),
            ),
          },
        },
      },
    ];

    const FUNNEL_MOCK = {
      request: {
        query: GET_CRM_ANALYTICS_FUNNEL,
        variables: { filter: CRM_ANALYTICS_DEFAULT_FILTER },
      },
      result: { data: { getCrmAnalyticsFunnel: buildPayload(null) } },
      maxUsageCount: Number.POSITIVE_INFINITY,
    };

    const clickFunnelTabAfter = async (minutes: number) => {
      const user = userEvent.setup();
      const dateNow = jest
        .spyOn(Date, 'now')
        .mockReturnValue(new Date(META_READ_AT).getTime());

      renderContent([...META_MOCKS, OVERVIEW_MOCK, FUNNEL_MOCK]);

      await screen.findByText(ACTIVE_PEOPLE_FIGURE);

      expect(screen.queryByText(STALE_BANNER)).not.toBeInTheDocument();

      dateNow.mockReturnValue(
        new Date(META_READ_AT).getTime() + minutes * 60 * 1000,
      );

      // The tab list also renders a hidden copy of each tab to measure it.
      await user.click(screen.getAllByText('Funnel').at(-1) as HTMLElement);

      return dateNow;
    };

    it('asks the server once what it has is old', async () => {
      const dateNow = await clickFunnelTabAfter(6);

      expect(await screen.findByText(STALE_BANNER)).toBeInTheDocument();

      dateNow.mockRestore();
    });

    it('leaves the server alone while what it has is recent', async () => {
      const dateNow = await clickFunnelTabAfter(4);

      await screen.findByText('Analytics is switched off.');

      expect(screen.queryByText(STALE_BANNER)).not.toBeInTheDocument();

      dateNow.mockRestore();
    });
  });

  it('shows the provisional notice', async () => {
    renderContent([metaMock(buildMeta({ isProvisional: true })), OVERVIEW_MOCK]);

    expect(
      await screen.findByText(
        'Definitions are provisional until recruiting confirms them.',
      ),
    ).toBeInTheDocument();
  });
});
