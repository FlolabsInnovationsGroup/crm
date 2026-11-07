import { i18n } from '@lingui/core';
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
import { AnalyticsNotice } from '@/crm-analytics/components/AnalyticsSection';
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

// A small group's high rate must not outrank a firm one.
const getRateRank = (row: AnalyticsCategoryRow, minimumSample: number) => {
  if (hasMeasuredRate(row)) {
    return row.overallEligible >= minimumSample ? 0 : 1;
  }

  return hasSoFarRate(row) ? 2 : 3;
};

const compareByRate =
  (minimumSample: number) =>
  (firstRow: AnalyticsCategoryRow, secondRow: AnalyticsCategoryRow) =>
    getRateRank(firstRow, minimumSample) -
      getRateRank(secondRow, minimumSample) ||
    (secondRow.overallRate ?? secondRow.overallSoFarRate ?? 0) -
      (firstRow.overallRate ?? firstRow.overallSoFarRate ?? 0);

const formatRangeDate = (date: string) =>
  i18n.date(new Date(`${date.slice(0, 10)}T00:00:00.000Z`), {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });

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

  const {
    groupBy,
    minimumSample,
    peopleInSeveral,
    peopleInSeveralTracks,
    stepStageKeys,
  } = categories;
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

    const getSelectedKey = () => {
      if (isSourceView) {
        return filter.sourceKey;
      }

      return isDefined(row.parentKey) ? filter.programKey : filter.trackKey;
    };

    if (row.key === getSelectedKey()) {
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
          label: t`Signed, left or not mapped`,
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
            label: t`Signed, left or not mapped`,
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

  const rateNote = isSourceView
    ? t`People, by application date and current source. A person counts once they have had enough time to reach the end. Small groups draw lighter and sort below the rest.`
    : t`People, by application date and current positions. A person counts once they have had enough time to reach the end. Small groups draw lighter and sort below the rest.`;

  const isStatusFiltered = filter.status !== 'ALL';

  // The rate ignores status, so a group with no one in this status has nothing to answer for.
  const rowsInStatus = chartRows.filter(
    (row) => !isStatusFiltered || row.people > 0,
  );

  // Under a track filter the bars are programs, and the server counts only that track's positions.
  const isShowingPrograms = chartRows.some((row) => isDefined(row.parentKey));
  const peopleInSeveralBars = isShowingPrograms
    ? peopleInSeveral
    : peopleInSeveralTracks;

  const peopleNote = [
    isSourceView
      ? t`People by their current source. A date filter leaves out imported people.`
      : t`People by their current positions, counted once in each. A date filter leaves out imported people.`,
    !isSourceView && peopleInSeveralBars > 0
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

  const scatterRows = rowsInStatus.filter(
    (row) => !isAnalyticsCatchAllRow(row),
  );

  const scatterNote = [
    t`Each point is one group: more people to the right, better conversion higher up. The lines mark the median of the groups shown.`,
    catchAllRows.length > 0
      ? isSourceView
        ? t`People with no source or not mapped are left out.`
        : t`People with no position or not mapped are left out.`
      : null,
  ]
    .filter(isDefined)
    .join(' ');

  const scatterPoints = scatterRows.map((row) => ({
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

  const { newApplicationsFrom, newApplicationsTo } = categories;
  const rangeFrom = isDefined(newApplicationsFrom)
    ? formatRangeDate(newApplicationsFrom)
    : null;
  const rangeTo = isDefined(newApplicationsTo)
    ? formatRangeDate(newApplicationsTo)
    : null;

  const notTrackedLongEnough = t`No group has been tracked long enough yet. Overall conversion counts people once they have had enough time to reach the end.`;

  return (
    <>
      {isStatusFiltered && (
        <AnalyticsNotice>
          {t`Rates and the people who applied ignore the status filter, so they cover everyone in the group, not only this status.`}
        </AnalyticsNotice>
      )}
      <AnalyticsAnswerCards
        cards={buildAnalyticsCategoryAnswers({
          rows: rowsInStatus,
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
            rows={[...groupRows]
              .sort(compareByRate(minimumSample))
              .map(buildRateBar)}
            dividedRows={[...catchAllRows]
              .sort(compareByRate(minimumSample))
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
          note={scatterNote}
          isFullWidth
          isEmpty={!scatterRows.some(hasMeasuredRate)}
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
          note={
            isDefined(rangeFrom) && isDefined(rangeTo)
              ? t`New applications counts submissions from ${rangeFrom} to ${rangeTo}.`
              : undefined
          }
          isFullWidth
          numbers={
            <AnalyticsCategoryTable categories={categories} stages={stages} />
          }
        />
      </AnalyticsChartGrid>
    </>
  );
};
