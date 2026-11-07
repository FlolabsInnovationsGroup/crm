import { type ErrorLike } from '@apollo/client';
import { MockedProvider } from '@apollo/client/testing/react';
import { render, screen } from '@testing-library/react';
import { createStore, Provider as JotaiProvider } from 'jotai';
import { type ComponentProps } from 'react';
import { MemoryRouter } from 'react-router-dom';

import { AnalyticsContent } from '@/crm-analytics/components/AnalyticsContent';
import { CRM_ANALYTICS_DEFAULT_FILTER } from '@/crm-analytics/constants/CrmAnalyticsDefaultFilter';
import { GET_CRM_ANALYTICS_META } from '@/crm-analytics/graphql/getCrmAnalyticsMeta';
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

  it('shows retry and a toast on another error', async () => {
    renderContent([metaErrorMock('INTERNAL_SERVER_ERROR')]);

    expect(await screen.findByText('Retry')).toBeInTheDocument();
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

  it('shows the provisional notice', async () => {
    renderContent([metaMock(buildMeta({ isProvisional: true })), OVERVIEW_MOCK]);

    expect(
      await screen.findByText(
        'Definitions are provisional until recruiting confirms them.',
      ),
    ).toBeInTheDocument();
  });
});
