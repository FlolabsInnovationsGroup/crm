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
  'Tracking started Oct 27, 2026. Conversion appears once people pass the 90-day window.';

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
              variables: { filter: { ...filter, status: 'ALL' } },
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
        <AnalyticsFunnelTab filter={filter} onResetFilter={onResetFilter} />
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

  it('shows the ledger when filtered people are in the cohort', async () => {
    renderTab({
      filter: { ...CRM_ANALYTICS_DEFAULT_FILTER, sourceKey: 'LINKEDIN' },
      funnel: buildFunnel(120),
    });

    expect(
      await screen.findByRole('table', { name: 'Conversion by stage' }),
    ).toBeInTheDocument();
  });
});
