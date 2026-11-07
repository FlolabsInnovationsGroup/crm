import { type ErrorLike } from '@apollo/client';
import { MockedProvider } from '@apollo/client/testing/react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createStore, Provider as JotaiProvider } from 'jotai';
import { type ComponentProps } from 'react';

import { AnalyticsCategoriesTab } from '@/crm-analytics/components/AnalyticsCategoriesTab';
import { CRM_ANALYTICS_DEFAULT_FILTER } from '@/crm-analytics/constants/CrmAnalyticsDefaultFilter';
import { GET_CRM_ANALYTICS_CATEGORIES } from '@/crm-analytics/graphql/getCrmAnalyticsCategories';
import {
  type AnalyticsCategories,
  type AnalyticsCategoryGroupBy,
  type AnalyticsCategoryRow,
  type AnalyticsFilter,
  type AnalyticsMeta,
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

// jsdom has no PointerEvent, which the segmented control's radios dispatch on a click.
window.PointerEvent = window.MouseEvent as typeof PointerEvent;

const META = {
  fields: { positionsAppliedFor: 'OK', applicantSource: 'OK' },
  stages: [
    {
      stageKey: 'NEW',
      label: 'New',
      kind: 'MAIN',
      rank: 0,
      limitDays: 14,
      windowDays: 14,
      isSuccess: false,
    },
    {
      stageKey: 'CONTACTED',
      label: 'Contacted',
      kind: 'MAIN',
      rank: 1,
      limitDays: 14,
      windowDays: 14,
      isSuccess: false,
    },
  ],
} as AnalyticsMeta;

const buildRow = (
  row: Partial<AnalyticsCategoryRow> & { key: string; label: string },
): AnalyticsCategoryRow => ({
  parentKey: null,
  isUnmapped: false,
  people: 100,
  activePeople: 80,
  newApplications: 12,
  cohortSize: 60,
  overallEligible: 50,
  overallRate: 0.1,
  overallSoFarRate: null,
  stepRates: [
    { stageKey: 'NEW', eligible: 50, rate: 0.5, soFarRate: 0.5 },
    { stageKey: 'CONTACTED', eligible: 40, rate: 0.25, soFarRate: 0.25 },
  ],
  ...row,
});

const ROBOTICS_ROW = buildRow({
  key: 'ROBOTICS',
  label: 'Robotics',
  people: 400,
  activePeople: 300,
  overallRate: 0.2,
});
const SENSOR_ROW = buildRow({
  key: 'SENSOR_INTERN',
  label: 'Sensor integration',
  parentKey: 'ROBOTICS',
  people: 150,
});
const DESIGN_ROW = buildRow({
  key: 'DESIGN',
  label: 'Design',
  people: 90,
  overallEligible: 12,
  overallRate: 0.5,
});
const NEW_TRACK_ROW = buildRow({
  key: 'EMERGING',
  label: 'Emerging sciences',
  people: 40,
  overallEligible: 0,
  overallRate: null,
  overallSoFarRate: 0.03,
  stepRates: [{ stageKey: 'NEW', eligible: 0, rate: null, soFarRate: 0.2 }],
});
const NO_POSITION_ROW = buildRow({
  key: 'NONE',
  label: 'No position',
  people: 30,
  overallEligible: 0,
  overallRate: null,
  overallSoFarRate: null,
  stepRates: [],
});

const buildCategories = (
  overrides: Partial<AnalyticsCategories> = {},
): AnalyticsCategories => ({
  asOf: '2026-11-07T10:00:00.000Z',
  trackingStartedAt: '2026-10-27T00:00:00.000Z',
  reportingTimeZone: 'UTC',
  minimumSample: 30,
  groupBy: 'TRACK_PROGRAM',
  distinctPeople: 600,
  peopleInSeveral: 5,
  peopleInSeveralTracks: 5,
  stepStageKeys: ['NEW', 'CONTACTED'],
  rows: [ROBOTICS_ROW, SENSOR_ROW, DESIGN_ROW, NEW_TRACK_ROW, NO_POSITION_ROW],
  ...overrides,
});

const categoriesMock = (
  categories: AnalyticsCategories | null,
  groupBy: AnalyticsCategoryGroupBy = 'TRACK_PROGRAM',
  filter: AnalyticsFilter = CRM_ANALYTICS_DEFAULT_FILTER,
) => ({
  request: {
    query: GET_CRM_ANALYTICS_CATEGORIES,
    variables: { filter, groupBy },
  },
  result: {
    data: {
      getCrmAnalyticsCategories: {
        __typename: 'CrmAnalyticsPayload',
        payload: categories,
      },
    },
  },
  maxUsageCount: Number.POSITIVE_INFINITY,
});

const renderTab = ({
  mocks,
  meta = META,
  filter = CRM_ANALYTICS_DEFAULT_FILTER,
  onFilterChange = jest.fn(),
  onResetFilter = jest.fn(),
}: {
  mocks: ComponentProps<typeof MockedProvider>['mocks'];
  meta?: AnalyticsMeta;
  filter?: AnalyticsFilter;
  onFilterChange?: (nextFilter: AnalyticsFilter) => void;
  onResetFilter?: () => void;
}) =>
  render(
    <JotaiProvider store={createStore()}>
      <MockedProvider mocks={mocks}>
        <AnalyticsCategoriesTab
          filter={filter}
          meta={meta}
          onFilterChange={onFilterChange}
          onResetFilter={onResetFilter}
        />
      </MockedProvider>
    </JotaiProvider>,
  );

// The loading view already has cards with these titles, so wait for the answers first.
const findCard = async (name: string) => {
  await screen.findByText('Largest');

  return screen.getByRole('region', { name });
};

describe('AnalyticsCategoriesTab', () => {
  it('opens with plain answers', async () => {
    renderTab({ mocks: [categoriesMock(buildCategories())] });

    expect(await screen.findByText('Largest')).toBeInTheDocument();
    expect(screen.getByText('400 people')).toBeInTheDocument();
    expect(screen.getByText('Best converting')).toBeInTheDocument();
    expect(screen.getByText('Robotics, of 50 people')).toBeInTheDocument();
    expect(screen.getByText('Biggest drop')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Robotics: did not move on from Contacted, of 40 people',
      ),
    ).toBeInTheDocument();
  });

  it('clicking a track filters the page, and a track shows no program yet', async () => {
    const user = userEvent.setup();
    const onFilterChange = jest.fn();

    renderTab({
      mocks: [categoriesMock(buildCategories())],
      onFilterChange,
    });

    const card = await findCard('How many people in each?');

    expect(
      within(card).queryByText('Sensor integration'),
    ).not.toBeInTheDocument();

    await user.click(within(card).getByRole('button', { name: /^Robotics/ }));

    expect(onFilterChange).toHaveBeenCalledWith({
      ...CRM_ANALYTICS_DEFAULT_FILTER,
      trackKey: 'ROBOTICS',
      programKey: null,
    });
  });

  it('expands a chosen track to its programs, and clicking one filters by it', async () => {
    const user = userEvent.setup();
    const onFilterChange = jest.fn();
    const filter: AnalyticsFilter = {
      ...CRM_ANALYTICS_DEFAULT_FILTER,
      trackKey: 'ROBOTICS',
    };

    renderTab({
      filter,
      onFilterChange,
      mocks: [
        categoriesMock(
          buildCategories({ rows: [ROBOTICS_ROW, SENSOR_ROW] }),
          'TRACK_PROGRAM',
          filter,
        ),
      ],
    });

    const card = await findCard('How many people in each?');

    await user.click(
      within(card).getByRole('button', { name: /^Sensor integration/ }),
    );

    expect(onFilterChange).toHaveBeenCalledWith({
      ...filter,
      programKey: 'SENSOR_INTERN',
    });
  });

  it('warns that program bars can overlap under a track filter', async () => {
    const filter: AnalyticsFilter = {
      ...CRM_ANALYTICS_DEFAULT_FILTER,
      trackKey: 'ROBOTICS',
    };

    renderTab({
      filter,
      mocks: [
        categoriesMock(
          buildCategories({
            peopleInSeveral: 5,
            peopleInSeveralTracks: 0,
            rows: [ROBOTICS_ROW, SENSOR_ROW],
          }),
          'TRACK_PROGRAM',
          filter,
        ),
      ],
    });

    const card = await findCard('How many people in each?');

    expect(
      within(card).getByRole('button', {
        name: /the bars can add up to more than the total/,
      }),
    ).toBeInTheDocument();
  });

  it('offers to clear a filter only on the view that filter belongs to', async () => {
    const filter: AnalyticsFilter = {
      ...CRM_ANALYTICS_DEFAULT_FILTER,
      sourceKey: 'NONE',
    };

    renderTab({
      filter,
      mocks: [
        categoriesMock(buildCategories(), 'TRACK_PROGRAM', filter),
      ],
    });

    const card = await findCard('How many people in each?');

    within(card).getByRole('button', { name: /^No position/ }).focus();

    expect(await screen.findByText('Click to filter the page.')).toBeInTheDocument();
    expect(
      screen.queryByText('Click to clear this filter.'),
    ).not.toBeInTheDocument();
  });

  it('switches to sources and clicking one filters by it', async () => {
    const user = userEvent.setup();
    const onFilterChange = jest.fn();

    renderTab({
      onFilterChange,
      mocks: [
        categoriesMock(buildCategories()),
        categoriesMock(
          buildCategories({
            groupBy: 'SOURCE',
            rows: [buildRow({ key: 'LINKEDIN', label: 'LinkedIn' })],
          }),
          'SOURCE',
        ),
      ],
    });

    await findCard('How many people in each?');
    await user.click(screen.getByRole('radio', { name: 'Sources' }));

    const linkedIn = (
      await screen.findAllByRole('button', { name: /^LinkedIn/ })
    )[0];

    await user.click(linkedIn);

    expect(onFilterChange).toHaveBeenCalledWith({
      ...CRM_ANALYTICS_DEFAULT_FILTER,
      sourceKey: 'LINKEDIN',
    });
  });

  it('never shows a measured 0% for a group with no known rate', async () => {
    renderTab({ mocks: [categoriesMock(buildCategories())] });

    const card = await findCard('Which converts best?');

    expect(within(card).getByText('3% so far')).toBeInTheDocument();
    expect(within(card).queryByText('0%')).not.toBeInTheDocument();
    expect(within(card).getByText('-')).toBeInTheDocument();
  });

  it('ranks measured rates first, then so far, then unknown', async () => {
    renderTab({ mocks: [categoriesMock(buildCategories())] });

    await findCard('Which converts best?');

    const rowNames = within(
      screen.getByRole('group', {
        name: 'Overall conversion of each group, highest first',
      }),
    )
      .getAllByRole('button')
      .map((row) => row.getAttribute('aria-label'));

    expect(rowNames).toEqual([
      'Design: 50%',
      'Robotics: 20%',
      'Emerging sciences: 3% so far',
      'No position: ',
    ]);
  });

  it('shows a rate for every step in one hue, and so far on one in progress', async () => {
    renderTab({ mocks: [categoriesMock(buildCategories())] });

    const card = await findCard('Conversion at every step');
    const table = within(card).getByRole('table', {
      name: 'Conversion at every step for each group',
    });

    expect(within(table).getByText('New to next')).toBeInTheDocument();
    expect(
      within(
        within(table).getByRole('row', { name: /Emerging sciences/ }),
      ).getByText('so far'),
    ).toBeInTheDocument();
  });

  it('leaves unknown points out of the scatter and says how many', async () => {
    renderTab({ mocks: [categoriesMock(buildCategories())] });

    const card = await findCard('Big but weak, or small but strong?');

    expect(
      within(card).getByText(
        '2 not shown because there is not enough data yet.',
      ),
    ).toBeInTheDocument();
  });

  it('keeps the category table behind Show numbers', async () => {
    const user = userEvent.setup();

    renderTab({ mocks: [categoriesMock(buildCategories())] });

    const card = await findCard('All the numbers');

    expect(
      within(card).queryByRole('table', {
        name: 'People and conversion by track and program',
      }),
    ).not.toBeInTheDocument();

    await user.click(
      within(card).getByRole('button', { name: 'Show numbers' }),
    );

    expect(
      within(card).getByRole('table', {
        name: 'People and conversion by track and program',
      }),
    ).toBeInTheDocument();
  });

  it('says why when no group has been tracked long enough', async () => {
    renderTab({
      mocks: [
        categoriesMock(
          buildCategories({
            rows: [
              buildRow({
                key: 'ROBOTICS',
                label: 'Robotics',
                overallEligible: 0,
                overallRate: null,
              }),
            ],
          }),
        ),
      ],
    });

    const card = await findCard('Which converts best?');

    expect(
      within(card).getByText(/No group has been tracked long enough yet/),
    ).toBeInTheDocument();
  });

  it('offers a reset when nothing matches the filters', async () => {
    const user = userEvent.setup();
    const onResetFilter = jest.fn();

    renderTab({
      onResetFilter,
      mocks: [categoriesMock(buildCategories({ rows: [] }))],
    });

    expect(
      await screen.findByText('No people match these filters'),
    ).toBeInTheDocument();

    await user.click(screen.getByText('Reset filters'));

    expect(onResetFilter).toHaveBeenCalledTimes(1);
  });

  it('says why when the field is missing, and sends no query', async () => {
    renderTab({
      meta: {
        ...META,
        fields: { ...META.fields, positionsAppliedFor: 'MISSING' },
      },
      mocks: [],
    });

    expect(
      await screen.findByText(
        'The positions field on People is missing or has the wrong type, so tracks and programs cannot be shown.',
      ),
    ).toBeInTheDocument();
  });

  it('treats a null payload as switched off', async () => {
    renderTab({ mocks: [categoriesMock(null)] });

    expect(
      await screen.findByText('Analytics is switched off.'),
    ).toBeInTheDocument();
  });
});
