import { plural, t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';

import { AnalyticsAnswerCards } from '@/crm-analytics/charts/AnalyticsAnswerCards';
import { AnalyticsChartCard } from '@/crm-analytics/charts/AnalyticsChartCard';
import { ANALYTICS_CHART_COLOR } from '@/crm-analytics/charts/AnalyticsChartColor';
import { AnalyticsChartGrid } from '@/crm-analytics/charts/AnalyticsChartGrid';
import { AnalyticsHeatmap } from '@/crm-analytics/charts/AnalyticsHeatmap';
import {
  AnalyticsHorizontalBarChart,
  type AnalyticsHorizontalBarRow,
} from '@/crm-analytics/charts/AnalyticsHorizontalBarChart';
import { AnalyticsScatterChart } from '@/crm-analytics/charts/AnalyticsScatterChart';
import { AnalyticsCategoryTable } from '@/crm-analytics/components/AnalyticsCategoryTable';
import {
  type AnalyticsCategories,
  type AnalyticsCategoryRow,
  type AnalyticsFilter,
  type AnalyticsStageDefinition,
} from '@/crm-analytics/types/AnalyticsApi';
import { buildAnalyticsCategoryAnswers } from '@/crm-analytics/utils/buildAnalyticsCategoryAnswers';
import { buildAnalyticsRateHeatmapCell } from '@/crm-analytics/utils/buildAnalyticsRateHeatmapCell';
import { formatAnalyticsRate } from '@/crm-analytics/utils/formatAnalyticsRate';
import { getAnalyticsCategoryChartRows } from '@/crm-analytics/utils/getAnalyticsCategoryChartRows';
import { getAnalyticsCategoryClickFilter } from '@/crm-analytics/utils/getAnalyticsCategoryClickFilter';
import { getAnalyticsCategoryLabel } from '@/crm-analytics/utils/getAnalyticsCategoryLabel';
import { isAnalyticsCatchAllRow } from '@/crm-analytics/utils/isAnalyticsCatchAllRow';
import { useNumberFormat } from '@/localization/hooks/useNumberFormat';

const hasMeasuredRate = (row: AnalyticsCategoryRow) =>
  isDefined(row.overallRate) && row.overallEligible > 0;

const hasSoFarRate = (row: AnalyticsCategoryRow) =>
  !hasMeasuredRate(row) &&
  isDefined(row.overallSoFarRate) &&
  row.overallSoFarRate > 0;

const getRateRank = (row: AnalyticsCategoryRow) => {
  if (hasMeasuredRate(row)) {
    return 0;
  }

  return hasSoFarRate(row) ? 1 : 2;
};

const compareByRate = (
  firstRow: AnalyticsCategoryRow,
  secondRow: AnalyticsCategoryRow,
) =>
  getRateRank(firstRow) - getRateRank(secondRow) ||
  (secondRow.overallRate ?? secondRow.overallSoFarRate ?? 0) -
    (firstRow.overallRate ?? firstRow.overallSoFarRate ?? 0);

type AnalyticsCategoryChartsProps = {
  categories: AnalyticsCategories;
  filter: AnalyticsFilter;
  stages: AnalyticsStageDefinition[];
  onFilterChange?: (nextFilter: AnalyticsFilter) => void;
};

export const AnalyticsCategoryCharts = ({
  categories,
  filter,
  stages,
  onFilterChange,
}: AnalyticsCategoryChartsProps) => {
  const { formatNumber } = useNumberFormat();

  const { groupBy, minimumSample, peopleInSeveralTracks, stepStageKeys } =
    categories;
  const isSourceView = groupBy === 'SOURCE';

  const chartRows = getAnalyticsCategoryChartRows(categories, filter);
  const byPeople = (
    firstRow: AnalyticsCategoryRow,
    secondRow: AnalyticsCategoryRow,
  ) => secondRow.people - firstRow.people;
  const groupRows = chartRows
    .filter((row) => !isAnalyticsCatchAllRow(row))
    .sort(byPeople);
  const catchAllRows = chartRows
    .filter((row) => isAnalyticsCatchAllRow(row))
    .sort(byPeople);

  const hasAnyRate = chartRows.some(
    (row) => hasMeasuredRate(row) || hasSoFarRate(row),
  );

  const getLabel = (row: AnalyticsCategoryRow) =>
    getAnalyticsCategoryLabel(row, groupBy);

  const formatPeople = (count: number) => {
    const formattedCount = formatNumber(count);

    return plural(count, {
      one: `${formattedCount} person`,
      other: `${formattedCount} people`,
    });
  };

  const handleRowClick = isDefined(onFilterChange)
    ? (rowKey: string) => {
        const row = chartRows.find((candidate) => candidate.key === rowKey);

        if (isDefined(row)) {
          onFilterChange(getAnalyticsCategoryClickFilter(row, groupBy, filter));
        }
      }
    : undefined;

  const getClickHint = (row: AnalyticsCategoryRow) => {
    if (!isDefined(onFilterChange)) {
      return null;
    }

    if (
      row.key === filter.sourceKey ||
      row.key === filter.trackKey ||
      row.key === filter.programKey
    ) {
      return t`Click to clear this filter.`;
    }

    return categories.rows.some((candidate) => candidate.parentKey === row.key)
      ? t`Click to see its programs.`
      : t`Click to filter the page.`;
  };

  const buildPeopleBar = (
    row: AnalyticsCategoryRow,
  ): AnalyticsHorizontalBarRow => {
    const notActivePeople = Math.max(row.people - row.activePeople, 0);

    return {
      key: row.key,
      label: getLabel(row),
      segments: [
        {
          key: 'active',
          label: t`Active`,
          value: row.activePeople,
          color: ANALYTICS_CHART_COLOR.accent,
        },
        {
          key: 'notActive',
          label: t`Not active`,
          value: notActivePeople,
          color: ANALYTICS_CHART_COLOR.neutral,
        },
      ],
      tooltip: {
        title: getLabel(row),
        rows: [
          { label: t`People`, value: formatNumber(row.people) },
          {
            label: t`Active`,
            value: formatNumber(row.activePeople),
            color: ANALYTICS_CHART_COLOR.accent,
          },
          {
            label: t`Not active`,
            value: formatNumber(notActivePeople),
            color: ANALYTICS_CHART_COLOR.neutral,
          },
        ],
        note: getClickHint(row),
      },
    };
  };

  const buildRateBar = (
    row: AnalyticsCategoryRow,
  ): AnalyticsHorizontalBarRow => {
    const label = getLabel(row);
    const clickHint = getClickHint(row);

    if (hasMeasuredRate(row) && isDefined(row.overallRate)) {
      const rate = formatAnalyticsRate(row.overallRate) ?? '';
      const isSmallSample = row.overallEligible < minimumSample;

      return {
        key: row.key,
        label,
        segments: [
          {
            key: 'rate',
            label: t`Overall conversion`,
            value: row.overallRate,
          },
        ],
        valueLabel: rate,
        isSmallSample,
        tooltip: {
          title: label,
          rows: [
            { label: t`Overall conversion`, value: rate },
            { label: t`Out of`, value: formatPeople(row.overallEligible) },
          ],
          note: isSmallSample
            ? [t`A small group, so this can move a lot.`, clickHint]
                .filter(isDefined)
                .join(' ')
            : clickHint,
        },
      };
    }

    if (hasSoFarRate(row) && isDefined(row.overallSoFarRate)) {
      const rate = formatAnalyticsRate(row.overallSoFarRate) ?? '';

      return {
        key: row.key,
        label,
        segments: [
          {
            key: 'rate',
            label: t`Overall conversion`,
            value: row.overallSoFarRate,
          },
        ],
        valueLabel: t`${rate} so far`,
        isSmallSample: true,
        tooltip: {
          title: label,
          rows: [
            { label: t`So far`, value: rate },
            { label: t`Out of`, value: formatPeople(row.cohortSize) },
          ],
          note: [
            t`Still in progress: no one here has had enough time yet.`,
            clickHint,
          ]
            .filter(isDefined)
            .join(' '),
        },
      };
    }

    return {
      key: row.key,
      label,
      segments: [],
      tooltip: { title: label, rows: [], note: t`Not enough data` },
    };
  };

  const rateNote = [
    isSourceView
      ? t`People, by application date and current source. A person counts once they have had enough time to reach the end.`
      : t`People, by application date and current positions. A person counts once they have had enough time to reach the end.`,
    filter.status === 'ALL' ? null : t`Rates ignore the status filter.`,
  ]
    .filter(isDefined)
    .join(' ');

  const peopleNote = [
    isSourceView
      ? t`People by their current source. A date filter leaves out imported people.`
      : t`People by their current positions, counted once in each. A date filter leaves out imported people.`,
    !isSourceView && peopleInSeveralTracks > 0
      ? t`Some people are in several, so the bars can add up to more than the total.`
      : null,
  ]
    .filter(isDefined)
    .join(' ');

  const dividerLabel = isSourceView
    ? t`No source or not mapped`
    : t`No position or not mapped`;

  const heatmapColumns = stepStageKeys.map((stageKey) => {
    const stageLabel =
      stages.find((stage) => stage.stageKey === stageKey)?.label ?? stageKey;

    return { key: stageKey, label: t`${stageLabel} to next` };
  });

  const heatmapRows = [...groupRows, ...catchAllRows].map((row) => {
    const label = getLabel(row);

    return {
      key: row.key,
      label,
      cells: heatmapColumns.map(({ key, label: columnLabel }) => {
        const step = row.stepRates.find(
          (candidate) => candidate.stageKey === key,
        );

        return buildAnalyticsRateHeatmapCell({
          columnKey: key,
          title: t`${label}, ${columnLabel}`,
          rateLabel: t`Moved on`,
          rate: step?.rate ?? null,
          soFarRate: step?.soFarRate,
          count: step?.eligible ?? 0,
          minimumSample,
          formatNumber,
        });
      }),
    };
  });

  const scatterPoints = [...groupRows, ...catchAllRows].map((row) => ({
    key: row.key,
    label: getLabel(row),
    x: row.people,
    y: hasMeasuredRate(row) ? row.overallRate : null,
    isSmallSample: row.overallEligible < minimumSample,
    tooltip: {
      title: getLabel(row),
      rows: [
        { label: t`People`, value: formatNumber(row.people) },
        {
          label: t`Overall conversion`,
          value: formatAnalyticsRate(row.overallRate) ?? '',
        },
        { label: t`Out of`, value: formatPeople(row.overallEligible) },
      ],
      note: getClickHint(row),
    },
  }));

  const notTrackedLongEnough = t`No group has been tracked long enough yet. Overall conversion counts people once they have had enough time to reach the end.`;

  return (
    <>
      <AnalyticsAnswerCards
        cards={buildAnalyticsCategoryAnswers({
          rows: chartRows,
          groupBy,
          minimumSample,
          stages,
          formatNumber,
        })}
      />
      <AnalyticsChartGrid>
        <AnalyticsChartCard
          title={t`How many people in each?`}
          note={peopleNote}
        >
          <AnalyticsHorizontalBarChart
            ariaLabel={t`People in each group, active darker than the rest`}
            rows={groupRows.map(buildPeopleBar)}
            dividedRows={catchAllRows.map(buildPeopleBar)}
            dividerLabel={dividerLabel}
            onRowClick={handleRowClick}
          />
        </AnalyticsChartCard>
        <AnalyticsChartCard
          title={t`Which converts best?`}
          note={rateNote}
          isEmpty={!hasAnyRate}
          emptyMessage={notTrackedLongEnough}
        >
          <AnalyticsHorizontalBarChart
            ariaLabel={t`Overall conversion of each group, highest first`}
            rows={[...groupRows].sort(compareByRate).map(buildRateBar)}
            dividedRows={[...catchAllRows]
              .sort(compareByRate)
              .map(buildRateBar)}
            dividerLabel={dividerLabel}
            onRowClick={handleRowClick}
          />
        </AnalyticsChartCard>
        <AnalyticsChartCard
          title={t`Conversion at every step`}
          note={t`The share of people in each group who moved to the next stage in time. Lighter means a small group or still in progress. A dash means not enough data.`}
          isFullWidth
        >
          <AnalyticsHeatmap
            ariaLabel={t`Conversion at every step for each group`}
            columns={heatmapColumns}
            rows={heatmapRows}
            rowHeaderLabel={isSourceView ? t`Source` : t`Group`}
            onRowClick={handleRowClick}
          />
        </AnalyticsChartCard>
        <AnalyticsChartCard
          title={t`Big but weak, or small but strong?`}
          note={t`Each point is one group: more people to the right, better conversion higher up. The lines mark the median of the groups shown.`}
          isFullWidth
          isEmpty={!chartRows.some(hasMeasuredRate)}
          emptyMessage={notTrackedLongEnough}
        >
          <AnalyticsScatterChart
            ariaLabel={t`People against overall conversion for each group`}
            points={scatterPoints}
            xLabel={t`People`}
            yLabel={t`Overall conversion`}
            formatY={(value) => formatAnalyticsRate(value) ?? ''}
            isYRate
            onPointClick={handleRowClick}
          />
        </AnalyticsChartCard>
        <AnalyticsChartCard
          title={t`All the numbers`}
          isFullWidth
          numbers={
            <AnalyticsCategoryTable categories={categories} stages={stages} />
          }
        />
      </AnalyticsChartGrid>
    </>
  );
};
