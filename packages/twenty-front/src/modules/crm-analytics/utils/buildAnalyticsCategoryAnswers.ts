import { plural, t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';

import { type AnalyticsAnswerCard } from '@/crm-analytics/charts/AnalyticsAnswerCards';
import {
  type AnalyticsCategoryGroupBy,
  type AnalyticsCategoryRow,
  type AnalyticsStageDefinition,
} from '@/crm-analytics/types/AnalyticsApi';
import { formatAnalyticsRate } from '@/crm-analytics/utils/formatAnalyticsRate';
import { getAnalyticsCategoryLabel } from '@/crm-analytics/utils/getAnalyticsCategoryLabel';
import { isAnalyticsCatchAllRow } from '@/crm-analytics/utils/isAnalyticsCatchAllRow';

type BuildAnalyticsCategoryAnswersArgs = {
  rows: AnalyticsCategoryRow[];
  groupBy: AnalyticsCategoryGroupBy;
  minimumSample: number;
  stages: Pick<AnalyticsStageDefinition, 'stageKey' | 'label'>[];
  formatNumber: (value: number) => string;
};

const formatPeople = (
  count: number,
  formatNumber: (value: number) => string,
) => {
  const formattedCount = formatNumber(count);

  return plural(count, {
    one: `${formattedCount} person`,
    other: `${formattedCount} people`,
  });
};

export const buildAnalyticsCategoryAnswers = ({
  rows,
  groupBy,
  minimumSample,
  stages,
  formatNumber,
}: BuildAnalyticsCategoryAnswersArgs): AnalyticsAnswerCard[] => {
  const groupRows = rows.filter((row) => !isAnalyticsCatchAllRow(row));

  const largestRow = groupRows
    .filter((row) => row.people >= minimumSample)
    .reduce<AnalyticsCategoryRow | null>(
      (largest, row) =>
        !isDefined(largest) || row.people > largest.people ? row : largest,
      null,
    );

  const bestRow = groupRows
    .filter(
      (row) =>
        isDefined(row.overallRate) && row.overallEligible >= minimumSample,
    )
    .reduce<AnalyticsCategoryRow | null>(
      (best, row) =>
        !isDefined(best) || (row.overallRate ?? 0) > (best.overallRate ?? 0)
          ? row
          : best,
      null,
    );

  const lowestStep = groupRows
    .flatMap((row) =>
      row.stepRates.flatMap((step) =>
        isDefined(step.rate) && step.eligible >= minimumSample
          ? [{ row, step, rate: step.rate }]
          : [],
      ),
    )
    .reduce<{
      row: AnalyticsCategoryRow;
      step: AnalyticsCategoryRow['stepRates'][number];
      rate: number;
    } | null>(
      (lowest, candidate) =>
        !isDefined(lowest) || candidate.rate < lowest.rate ? candidate : lowest,
      null,
    );

  const noGroupReason =
    groupRows.length === 0 && rows.some((row) => row.people > 0)
      ? t`Only people with no value or an unmapped value are in view`
      : t`Not enough people in any group to compare yet`;

  // A highest rate of 0 or a lowest of 1 means no group stands out from the others.
  const convertingRow = (bestRow?.overallRate ?? 0) > 0 ? bestRow : null;
  const droppingStep =
    isDefined(lowestStep) && lowestStep.rate < 1 ? lowestStep : null;

  const getBestFallback = () =>
    isDefined(bestRow) ? t`No group has converted yet` : noGroupReason;

  const getDropFallback = () =>
    isDefined(lowestStep) ? t`Everyone moved on at every step` : noGroupReason;

  const getBestDetail = (row: AnalyticsCategoryRow) => {
    const label = getAnalyticsCategoryLabel(row, groupBy);
    const people = formatPeople(row.overallEligible, formatNumber);

    return t`${label}, of ${people}`;
  };

  const getDropDetail = ({ row, step }: NonNullable<typeof lowestStep>) => {
    const label = getAnalyticsCategoryLabel(row, groupBy);
    const stageLabel =
      stages.find((stage) => stage.stageKey === step.stageKey)?.label ??
      step.stageKey;
    const people = formatPeople(step.eligible, formatNumber);

    return t`${label}: did not move on from ${stageLabel}, of ${people}`;
  };

  return [
    {
      key: 'largest',
      label: t`Largest`,
      value: isDefined(largestRow)
        ? formatPeople(largestRow.people, formatNumber)
        : null,
      detail: isDefined(largestRow)
        ? getAnalyticsCategoryLabel(largestRow, groupBy)
        : noGroupReason,
    },
    {
      key: 'best',
      label: t`Best converting`,
      value: isDefined(convertingRow)
        ? formatAnalyticsRate(convertingRow.overallRate)
        : null,
      detail: isDefined(convertingRow)
        ? getBestDetail(convertingRow)
        : getBestFallback(),
    },
    {
      key: 'drop',
      label: t`Biggest drop`,
      value: isDefined(droppingStep)
        ? formatAnalyticsRate(1 - droppingStep.rate)
        : null,
      detail: isDefined(droppingStep)
        ? getDropDetail(droppingStep)
        : getDropFallback(),
    },
  ];
};
