import { MockedProvider } from '@apollo/client/testing/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createStore, Provider as JotaiProvider } from 'jotai';

import { AnalyticsFunnelTab } from '@/crm-analytics/components/AnalyticsFunnelTab';
import { CRM_ANALYTICS_DEFAULT_FILTER } from '@/crm-analytics/constants/CrmAnalyticsDefaultFilter';
import { GET_CRM_ANALYTICS_FUNNEL } from '@/crm-analytics/graphql/getCrmAnalyticsFunnel';
import {
  type AnalyticsFilter,
  type AnalyticsFunnel,
} from '@/crm-analytics/types/AnalyticsApi';

const LAUNCH_TAKEAWAY =
  'Tracking started Oct 27, 2026. Conversion appears once people have had 90 days to reach the end.';

const buildFunnel = (cohortSize: number): AnalyticsFunnel => ({
  asOf: '2026-11-07T10:00:00.000Z',
  trackingStartedAt: '2026-10-27T00:00:00.000Z',
  reportingTimeZone: 'UTC',
  minimumSample: 30,
  cohortSize,
  cohortExcludedUnmapped: 0,
  overall: {
    finalStageKey: 'CONTACTED',
    windowDays: 90,
    eligible: 0,
    reached: 0,
    rate: null,
    soFarRate: null,
    isUnderMinimum: true,
  },
  rows: [
    {
      stageKey: 'NEW',
      label: 'New',
      windowDays: 14,
      entered: cohortSize,
      eligible: 0,
      reachedNext: 0,
      timedOut: 0,
      exited: 0,
      inWindow: cohortSize,
      stepRate: null,
      soFarRate: null,
      dropOffRate: null,
      isUnderMinimum: true,
      medianDays: null,
      completedStays: 0,
    },
  ],
  lowestStepStageKey: null,
});

const buildFullFunnel = (): AnalyticsFunnel => {
  const funnel = buildFunnel(200);

  return {
    ...funnel,
    overall: {
      ...funnel.overall,
      finalStageKey: 'SIGNED',
      eligible: 80,
      reached: 8,
      rate: 0.1,
      soFarRate: 0.12,
      isUnderMinimum: false,
    },
    rows: [
      {
        ...funnel.rows[0],
        entered: 200,
        eligible: 100,
        reachedNext: 30,
        timedOut: 50,
        exited: 20,
        inWindow: 100,
        stepRate: 0.3,
        soFarRate: 0.35,
        dropOffRate: 0.7,
        isUnderMinimum: false,
        medianDays: 6.5,
        completedStays: 40,
      },
      {
        ...funnel.rows[0],
        stageKey: 'CONTACTED',
        label: 'Contacted',
        entered: 60,
      },
      {
        ...funnel.rows[0],
        stageKey: 'SIGNED',
        label: 'Signed',
        entered: 8,
      },
    ],
    lowestStepStageKey: 'NEW',
  };
};

const renderTab = ({
  filter,
  funnel,
  onResetFilter = jest.fn(),
}: {
  filter: AnalyticsFilter;
  funnel: AnalyticsFunnel;
  onResetFilter?: () => void;
}) =>
  render(
    <JotaiProvider store={createStore()}>
      <MockedProvider
        mocks={[
          {
            request: {
              query: GET_CRM_ANALYTICS_FUNNEL,
              variables: {
                filter: { ...filter, status: 'ALL', period: 'WEEK' },
              },
            },
            result: {
              data: {
                getCrmAnalyticsFunnel: {
                  __typename: 'CrmAnalyticsPayload',
                  payload: funnel,
                },
              },
            },
            maxUsageCount: Number.POSITIVE_INFINITY,
          },
        ]}
      >
        <AnalyticsFunnelTab
          filter={filter}
          meta={{ stages: [] }}
          onResetFilter={onResetFilter}
        />
      </MockedProvider>
    </JotaiProvider>,
  );

describe('AnalyticsFunnelTab', () => {
  it('blames neither time nor the filters alone when a filtered cohort is empty', async () => {
    const user = userEvent.setup();
    const onResetFilter = jest.fn();

    renderTab({
      filter: { ...CRM_ANALYTICS_DEFAULT_FILTER, sourceKey: 'LINKEDIN' },
      funnel: buildFunnel(0),
      onResetFilter,
    });

    expect(
      await screen.findByText(
        'No one matching these filters has entered the funnel yet',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Imported people are not in the funnel/)).toBeVisible();
    expect(screen.queryByText(LAUNCH_TAKEAWAY)).not.toBeInTheDocument();

    await user.click(screen.getByText('Reset filters'));

    expect(onResetFilter).toHaveBeenCalledTimes(1);
  });

  it('keeps the launch state when no filter is on', async () => {
    renderTab({
      filter: CRM_ANALYTICS_DEFAULT_FILTER,
      funnel: buildFunnel(0),
    });

    expect(await screen.findByText(LAUNCH_TAKEAWAY)).toBeInTheDocument();
    expect(
      screen.queryByText(
        'No one matching these filters has entered the funnel yet',
      ),
    ).not.toBeInTheDocument();
  });

  it('never applies a status picked on another tab', async () => {
    renderTab({
      filter: { ...CRM_ANALYTICS_DEFAULT_FILTER, status: 'SUCCESS' },
      funnel: buildFunnel(0),
    });

    expect(await screen.findByText(LAUNCH_TAKEAWAY)).toBeInTheDocument();
  });

  it('does not count the period as a filter', async () => {
    renderTab({
      filter: { ...CRM_ANALYTICS_DEFAULT_FILTER, period: 'MONTH' },
      funnel: buildFunnel(0),
    });

    expect(await screen.findByText(LAUNCH_TAKEAWAY)).toBeInTheDocument();
  });

  it('keeps the ledger behind Show numbers when filtered people are in the cohort', async () => {
    const user = userEvent.setup();

    renderTab({
      filter: { ...CRM_ANALYTICS_DEFAULT_FILTER, sourceKey: 'LINKEDIN' },
      funnel: buildFunnel(120),
    });

    await user.click(await screen.findByText('Show numbers'));

    expect(
      screen.getByRole('table', { name: 'Conversion by stage' }),
    ).toBeInTheDocument();
  });

  it('opens with answers and a chart for each question', async () => {
    renderTab({
      filter: CRM_ANALYTICS_DEFAULT_FILTER,
      funnel: buildFullFunnel(),
    });

    expect(
      await screen.findByText(
        'Based on 200 people who applied since tracking started on Oct 27, 2026.',
      ),
    ).toBeInTheDocument();

    expect(screen.getByText('10%')).toBeInTheDocument();
    expect(
      screen.getByText(
        'From New to Contacted. 70 of 100 people did not move on within 14 days.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('6.5 days', { selector: 'dd' })).toBeInTheDocument();

    [
      'From new to signed',
      'Conversion at each step',
      'What happened to people at each stage?',
      'How long do people stay?',
    ].forEach((title) => {
      expect(screen.getByRole('region', { name: title })).toBeInTheDocument();
    });

    expect(
      screen.queryByRole('table', { name: 'Conversion by stage' }),
    ).not.toBeInTheDocument();
  });

  it('says plainly what is unknown instead of drawing 0%', async () => {
    const funnel = buildFullFunnel();

    renderTab({
      filter: CRM_ANALYTICS_DEFAULT_FILTER,
      funnel: {
        ...funnel,
        overall: {
          ...funnel.overall,
          eligible: 0,
          reached: 0,
          rate: null,
          soFarRate: 0,
          isUnderMinimum: true,
        },
        rows: funnel.rows.map((row) => ({
          ...row,
          eligible: 0,
          reachedNext: 0,
          timedOut: 0,
          exited: 0,
          inWindow: row.entered,
          stepRate: null,
          soFarRate: 0,
          dropOffRate: null,
          isUnderMinimum: true,
          medianDays: null,
          completedStays: 0,
        })),
      },
    });

    expect(
      await screen.findByText("No one has passed a stage's window yet."),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText('Not enough finished stays yet.'),
    ).not.toHaveLength(0);
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
  });
});
