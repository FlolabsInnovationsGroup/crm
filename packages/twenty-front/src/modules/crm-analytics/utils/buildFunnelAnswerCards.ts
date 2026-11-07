import { t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';

import { type AnalyticsAnswerCard } from '@/crm-analytics/charts/AnalyticsAnswerCards';
import {
  type AnalyticsFunnel,
  type AnalyticsFunnelRow,
} from '@/crm-analytics/types/AnalyticsApi';
import { buildOverallConversionAnswer } from '@/crm-analytics/utils/buildOverallConversionAnswer';
import { formatAnalyticsPeopleCount } from '@/crm-analytics/utils/formatAnalyticsPeopleCount';
import { formatAnalyticsRate } from '@/crm-analytics/utils/formatAnalyticsRate';

type BuildFunnelAnswerCardsArgs = {
  funnel: AnalyticsFunnel;
  formatNumber: (value: number, options?: { decimals?: number }) => string;
};

const pickLargest = (
  rows: AnalyticsFunnelRow[],
  readValue: (row: AnalyticsFunnelRow) => number,
) =>
  rows.reduce<AnalyticsFunnelRow | undefined>(
    (largestRow, row) =>
      !isDefined(largestRow) || readValue(row) > readValue(largestRow)
        ? row
        : largestRow,
    undefined,
  );

// Not funnel.lowestStepStageKey: the server skips the first step there whenever a later step has enough people.
const buildBiggestDropCard = ({
  funnel: { rows },
  formatNumber,
}: BuildFunnelAnswerCardsArgs): AnalyticsAnswerCard => {
  const biggestDropRow = pickLargest(
    rows
      .slice(0, -1)
      .filter((row) => isDefined(row.dropOffRate) && !row.isUnderMinimum),
    (row) => row.dropOffRate ?? 0,
  );
  const nextRow = rows[rows.findIndex((row) => row === biggestDropRow) + 1];

  if (!isDefined(biggestDropRow) || !isDefined(nextRow)) {
    return {
      key: 'biggestDrop',
      label: t`Biggest drop`,
      value: null,
      detail: t`No step has enough people to say yet.`,
    };
  }

  const fromLabel = biggestDropRow.label;
  const toLabel = nextRow.label;
  const stayedBehind = formatNumber(
    biggestDropRow.eligible - biggestDropRow.reachedNext,
  );
  const people = formatAnalyticsPeopleCount(
    biggestDropRow.eligible,
    formatNumber,
  );

  return {
    key: 'biggestDrop',
    label: t`Biggest drop`,
    value: formatAnalyticsRate(biggestDropRow.dropOffRate),
    detail: t`From ${fromLabel} to ${toLabel}. ${stayedBehind} of ${people} did not move on.`,
  };
};

const buildSlowestStageCard = ({
  funnel: { rows, minimumSample },
  formatNumber,
}: BuildFunnelAnswerCardsArgs): AnalyticsAnswerCard => {
  const slowestRow = pickLargest(
    rows
      .slice(0, -1)
      .filter(
        (row) =>
          isDefined(row.medianDays) && row.completedStays >= minimumSample,
      ),
    (row) => row.medianDays ?? 0,
  );

  if (!isDefined(slowestRow) || !isDefined(slowestRow.medianDays)) {
    return {
      key: 'slowestStage',
      label: t`Slowest stage`,
      value: null,
      detail: t`Not enough finished stays yet.`,
    };
  }

  const days = formatNumber(slowestRow.medianDays, { decimals: 1 });
  const stageLabel = slowestRow.label;
  const stays = formatNumber(slowestRow.completedStays);

  return {
    key: 'slowestStage',
    label: t`Slowest stage`,
    value: t`${days} days`,
    detail: t`Typical stay in ${stageLabel}, from ${stays} finished stays.`,
  };
};

export const buildFunnelAnswerCards = (
  args: BuildFunnelAnswerCardsArgs,
): AnalyticsAnswerCard[] => {
  const { value, detail, isLighter } = buildOverallConversionAnswer(args);

  return [
    { key: 'overall', label: t`Overall conversion`, value, detail, isLighter },
    buildBiggestDropCard(args),
    buildSlowestStageCard(args),
  ];
};
