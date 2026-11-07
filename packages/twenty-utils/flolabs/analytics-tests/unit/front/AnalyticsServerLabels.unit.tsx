// The server builds stage, track and "Entered X" labels in English, and RESUME.md section 4
// has them mapped to Lingui on the front. Every string that goes through Lingui shows here
// in [[ ]], so a label that skips it stays bare, whatever its message id turns out to be.
import { MockedProvider } from '@apollo/client/testing/react';
import { i18n } from '@lingui/core';
import { render, screen, within } from '@testing-library/react';
import { createStore, Provider as JotaiProvider } from 'jotai';

import { AnalyticsCategoryTable } from '@/crm-analytics/components/AnalyticsCategoryTable';
import { AnalyticsMovementTable } from '@/crm-analytics/components/AnalyticsMovementTable';
import { AnalyticsReportView } from '@/crm-analytics/components/AnalyticsReportView';
import { AnalyticsStageLedger } from '@/crm-analytics/components/AnalyticsStageLedger';
import { AnalyticsStageTotalsTable } from '@/crm-analytics/components/AnalyticsStageTotalsTable';
import { GET_CRM_ANALYTICS_REPORT } from '@/crm-analytics/graphql/getCrmAnalyticsReport';
import {
  type AnalyticsCategories,
  type AnalyticsFunnel,
  type AnalyticsReport,
  type AnalyticsStageTotalRow,
} from '@/crm-analytics/types/AnalyticsApi';

const BASE = {
  asOf: '2026-11-02T02:30:00.000Z',
  trackingStartedAt: '2026-08-01T00:00:00.000Z',
  reportingTimeZone: 'UTC',
  minimumSample: 30,
};

const FUNNEL_ROW = {
  windowDays: 14,
  entered: 400,
  eligible: 300,
  reachedNext: 120,
  timedOut: 130,
  exited: 50,
  inWindow: 100,
  stepRate: 0.4,
  soFarRate: 0.5,
  dropOffRate: 0.6,
  isUnderMinimum: false,
  medianDays: 6,
  completedStays: 120,
};

const FUNNEL = {
  ...BASE,
  cohortSize: 400,
  importedExcludedByDate: 0,
  lowestStepStageKey: null,
  rows: [
    { ...FUNNEL_ROW, stageKey: 'CONTACTED', label: 'Contacted' },
    {
      ...FUNNEL_ROW,
      stageKey: 'SIGNED',
      label: 'Signed',
      windowDays: null,
      eligible: 0,
      reachedNext: 0,
      timedOut: 0,
      exited: 0,
      stepRate: null,
      soFarRate: null,
      dropOffRate: null,
    },
  ],
  overall: {
    finalStageKey: 'SIGNED',
    windowDays: 90,
    eligible: 100,
    reached: 10,
    rate: 0.1,
    soFarRate: 0.1,
    isUnderMinimum: false,
  },
} as unknown as AnalyticsFunnel;

const CATEGORIES = {
  ...BASE,
  groupBy: 'TRACK_PROGRAM',
  distinctPeople: 100,
  peopleInSeveral: 0,
  peopleInSeveralTracks: 0,
  stepStageKeys: [],
  rows: [
    {
      key: 'ROBOTICS',
      label: 'Robotics & Intelligent Systems',
      parentKey: null,
      isUnmapped: false,
      people: 100,
      activePeople: 80,
      newApplications: 12,
      cohortSize: 60,
      overallEligible: 50,
      overallReached: 5,
      overallRate: 0.1,
      overallSoFarRate: 0.1,
      isUnderMinimum: false,
      stepRates: [],
    },
  ],
} as unknown as AnalyticsCategories;

const COMPARISONS = [
  {
    metricKey: 'NEW_APPLICATIONS',
    label: 'New applications',
    current: 86,
    previous: 40,
    isSignificant: true,
  },
  {
    metricKey: 'ENTERED_CONTACTED',
    label: 'Entered Contacted',
    current: 31,
    previous: 30,
    isSignificant: false,
  },
];

const REPORT = {
  ...BASE,
  periodType: 'WEEK',
  periodStart: '2026-10-26',
  periodEnd: '2026-11-02',
  generatedAt: '2026-11-02T02:30:00.000Z',
  newApplications: 86,
  newApplicationsPrevious: 40,
  categories: { ...CATEGORIES, rows: [] },
  funnel: { ...FUNNEL, rows: [] },
  movement: [
    {
      stageKey: 'CONTACTED',
      label: 'Contacted',
      enteredInPeriod: 31,
      leftInPeriod: 4,
      countNow: 900,
    },
  ],
  stuckByStage: [{ stageKey: 'CONTACTED', label: 'Contacted', count: 214 }],
  comparisons: COMPARISONS,
  cohorts: [],
} as unknown as AnalyticsReport;

const STAGE_TOTAL_ROWS = [
  {
    rowKey: 'CONTACTED',
    rowKind: 'MAIN',
    label: 'Contacted',
    parentStageKey: null,
    count: 900,
    pastLimitCount: 12,
  },
] as unknown as AnalyticsStageTotalRow[];

const LINGUI_WRAPPED = /^\[\[.*\]\]$/;

describe('labels the server builds in English', () => {
  beforeEach(() => {
    const translate = i18n._.bind(i18n) as (...args: unknown[]) => string;

    jest
      .spyOn(i18n, '_')
      .mockImplementation((...args: unknown[]) => `[[${translate(...args)}]]`);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('stage names in the funnel ledger go through Lingui', () => {
    render(<AnalyticsStageLedger funnel={FUNNEL} />);

    expect(screen.getByText(/Contacted/).textContent).toMatch(LINGUI_WRAPPED);
  });

  it('stage names in the stage totals go through Lingui', () => {
    render(<AnalyticsStageTotalsTable rows={STAGE_TOTAL_ROWS} />);

    expect(screen.getByText(/Contacted/).textContent).toMatch(LINGUI_WRAPPED);
  });

  it('stage names in the movement table go through Lingui', () => {
    render(<AnalyticsMovementTable rows={REPORT.movement} />);

    expect(screen.getByText(/Contacted/).textContent).toMatch(LINGUI_WRAPPED);
  });

  it('track names in the category table go through Lingui', () => {
    render(<AnalyticsCategoryTable categories={CATEGORIES} stages={[]} />);

    expect(screen.getByText(/Robotics/).textContent).toMatch(LINGUI_WRAPPED);
  });

  it('"New applications" and "Entered X" in report comparisons go through Lingui', async () => {
    render(
      <JotaiProvider store={createStore()}>
        <MockedProvider
          mocks={[
            {
              request: {
                query: GET_CRM_ANALYTICS_REPORT,
                variables: {
                  periodType: REPORT.periodType,
                  periodStart: REPORT.periodStart,
                },
              },
              result: {
                data: {
                  getCrmAnalyticsReport: {
                    __typename: 'CrmAnalyticsPayload',
                    payload: REPORT,
                  },
                },
              },
            },
          ]}
        >
          <AnalyticsReportView
            periodType={REPORT.periodType}
            periodStart={REPORT.periodStart}
          />
        </MockedProvider>
      </JotaiProvider>,
    );

    const comparisons = await screen.findByRole('table', {
      name: /Compared with the previous period/,
    });

    for (const label of [/New applications/, /Entered.*Contacted/]) {
      const cell = within(comparisons).getByText(label);

      expect(cell.textContent).toMatch(LINGUI_WRAPPED);
    }

    // A translated sentence around an English stage name is still half English.
    const valuesSentToLingui = jest
      .mocked(i18n._)
      .mock.calls.flatMap(([descriptor, values]) =>
        Object.values(
          (values ?? (descriptor as { values?: object })?.values ?? {}) as object,
        ),
      );

    expect(valuesSentToLingui).not.toContain('Contacted');
  });

  it('the check itself sees what does go through Lingui', () => {
    render(<AnalyticsMovementTable rows={REPORT.movement} />);

    expect(screen.getByText('[[Entered]]')).toBeInTheDocument();
  });
});
