import { t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';

import { describeAnalyticsPdfRate } from '@/crm-analytics/report-pdf/utils/describeAnalyticsPdfRate';
import {
  formatAnalyticsPdfDays,
  formatAnalyticsPdfNumber,
  formatAnalyticsPdfOfPeople,
  formatAnalyticsPdfPeople,
  formatAnalyticsPdfStays,
} from '@/crm-analytics/report-pdf/utils/formatAnalyticsPdfNumber';
import {
  type AnalyticsCategoryRow,
  type AnalyticsReport,
} from '@/crm-analytics/types/AnalyticsApi';
import { formatAnalyticsRate } from '@/crm-analytics/utils/formatAnalyticsRate';
import { isAnalyticsCatchAllRow } from '@/crm-analytics/utils/isAnalyticsCatchAllRow';

export type AnalyticsPdfAnswer = {
  key: string;
  question: string;
  answer: string;
};

const buildOverallAnswer = ({ funnel, minimumSample }: AnalyticsReport) => {
  const { overall, rows } = funnel;
  const windowDays = overall.windowDays;
  const finalLabel = rows.find(
    ({ stageKey }) => stageKey === overall.finalStageKey,
  )?.label;
  const rate = formatAnalyticsRate(overall.eligible > 0 ? overall.rate : null);

  if (isDefined(rate) && isDefined(finalLabel)) {
    const ofPeople = formatAnalyticsPdfOfPeople(overall.eligible);

    return overall.eligible < minimumSample
      ? t`${rate} ${ofPeople} reached ${finalLabel} within ${windowDays} days, still a small group. All applications since tracking start.`
      : t`${rate} ${ofPeople} reached ${finalLabel} within ${windowDays} days. All applications since tracking start.`;
  }

  if (
    funnel.cohortExcludedUnmapped > 0 &&
    rows.every(({ entered }) => entered === 0)
  ) {
    const excludedPeople = formatAnalyticsPdfPeople(
      funnel.cohortExcludedUnmapped,
    );

    return t`Cannot tell yet: ${excludedPeople} applied, but every stage they had is not mapped yet.`;
  }

  const soFarRate = formatAnalyticsRate(overall.soFarRate);

  if (
    isDefined(soFarRate) &&
    (overall.soFarRate ?? 0) > 0 &&
    isDefined(finalLabel)
  ) {
    return t`Too early to tell: people need ${windowDays} days to count. ${soFarRate} have reached ${finalLabel} so far.`;
  }

  return t`Too early to tell: people need ${windowDays} days to count.`;
};

const buildLowestStepAnswer = ({ funnel, minimumSample }: AnalyticsReport) => {
  const lowestIndex = funnel.rows.findIndex(
    ({ stageKey }) => stageKey === funnel.lowestStepStageKey,
  );
  const lowestRow = funnel.rows[lowestIndex];
  const nextRow = funnel.rows[lowestIndex + 1];

  if (!isDefined(lowestRow) || !isDefined(nextRow)) {
    return t`Not enough people have passed a step to compare them yet.`;
  }

  const fromLabel = lowestRow.label;
  const toLabel = nextRow.label;
  const rate = describeAnalyticsPdfRate({
    rate: lowestRow.stepRate,
    sampleSize: lowestRow.eligible,
    minimumSample,
  }).text;
  const ofPeople = formatAnalyticsPdfOfPeople(lowestRow.eligible);
  const answer = t`${fromLabel} to ${toLabel}: ${rate} moved on, ${ofPeople}.`;
  const firstRow = funnel.rows[0];
  const firstRate = firstRow.stepRate;
  const secondRow = funnel.rows[1];

  // The server leaves the first step out of the lowest step when a later one qualifies, so a lower first step needs saying.
  if (
    lowestIndex === 0 ||
    !isDefined(firstRate) ||
    !isDefined(lowestRow.stepRate) ||
    firstRow.eligible < minimumSample ||
    firstRate >= lowestRow.stepRate
  ) {
    return answer;
  }

  const firstFromLabel = firstRow.label;
  const firstToLabel = secondRow.label;
  const firstRateText = formatAnalyticsRate(firstRate);

  return t`${answer} The first step is left out: ${firstFromLabel} to ${firstToLabel}, ${firstRateText}.`;
};

const buildSlowestStageAnswer = ({
  funnel,
  minimumSample,
}: AnalyticsReport) => {
  // The last stage has no step to time, so it never shows in the duration chart either.
  const timedRows = funnel.rows
    .slice(0, -1)
    .filter(({ medianDays }) => isDefined(medianDays));
  const firmRows = timedRows.filter(
    ({ completedStays }) => completedStays >= minimumSample,
  );
  const slowestRow = firmRows.reduce<(typeof timedRows)[number] | undefined>(
    (slowest, row) =>
      !isDefined(slowest) || (row.medianDays ?? 0) > (slowest.medianDays ?? 0)
        ? row
        : slowest,
    undefined,
  );

  if (timedRows.length === 0) {
    return t`No one has completed a stage yet.`;
  }

  if (!isDefined(slowestRow) || !isDefined(slowestRow.medianDays)) {
    return t`Not enough completed stays to say yet.`;
  }

  const label = slowestRow.label;
  const days = formatAnalyticsPdfDays(slowestRow.medianDays);
  const stays = formatAnalyticsPdfStays(slowestRow.completedStays);

  return t`${label}: a median of ${days}, from ${stays}.`;
};

const pickHighestRow = (
  rows: AnalyticsCategoryRow[],
  getValue: (row: AnalyticsCategoryRow) => number,
) =>
  rows.reduce<AnalyticsCategoryRow | undefined>(
    (highest, row) =>
      !isDefined(highest) || getValue(row) > getValue(highest) ? row : highest,
    undefined,
  );

const buildTrackAnswer = ({ categories, minimumSample }: AnalyticsReport) => {
  const trackRows = categories.rows.filter(
    (row) =>
      !isDefined(row.parentKey) &&
      !isAnalyticsCatchAllRow(row) &&
      row.people > 0,
  );
  const largestRow = pickHighestRow(trackRows, ({ people }) => people);

  if (!isDefined(largestRow)) {
    return t`No people in any track yet.`;
  }

  const largestLabel = largestRow.label;
  const largestPeople = formatAnalyticsPdfPeople(largestRow.people);
  const comparableRows = trackRows.filter(
    ({ overallRate, overallEligible }) =>
      isDefined(overallRate) && overallEligible >= minimumSample,
  );

  if (comparableRows.length === 0) {
    return t`${largestLabel} is largest, with ${largestPeople}. No track has enough people to compare conversion yet.`;
  }

  const bestRow = pickHighestRow(
    comparableRows.filter(({ overallRate }) => (overallRate ?? 0) > 0),
    ({ overallRate }) => overallRate ?? 0,
  );

  if (!isDefined(bestRow)) {
    return t`${largestLabel} is largest, with ${largestPeople}. No track has converted anyone yet.`;
  }

  const bestLabel = bestRow.label;
  const bestRate = formatAnalyticsRate(bestRow.overallRate);
  const bestOfPeople = formatAnalyticsPdfOfPeople(bestRow.overallEligible);

  if (bestRow.key === largestRow.key) {
    return t`${largestLabel} is largest, with ${largestPeople}, and converts best: ${bestRate} ${bestOfPeople}.`;
  }

  return t`${largestLabel} is largest, with ${largestPeople}. ${bestLabel} converts best: ${bestRate} ${bestOfPeople}.`;
};

const buildStuckAnswer = ({ stuckByStage }: AnalyticsReport) => {
  const total = stuckByStage.reduce((sum, { count }) => sum + count, 0);

  if (total === 0) {
    return t`No one is past their stage limit.`;
  }

  const largestRow = stuckByStage.reduce((largest, row) =>
    row.count > largest.count ? row : largest,
  );
  const people = formatAnalyticsPdfPeople(total);
  const largestLabel = largestRow.label;
  const largestCount = formatAnalyticsPdfNumber(largestRow.count);

  return t`${people} past their stage limit, most in ${largestLabel}: ${largestCount}.`;
};

export const buildAnalyticsPdfAnswers = (
  report: AnalyticsReport,
): AnalyticsPdfAnswer[] => [
  {
    key: 'OVERALL',
    question: t`How many people reach the end?`,
    answer: buildOverallAnswer(report),
  },
  {
    key: 'LOWEST_STEP',
    question: t`Which step has the lowest conversion?`,
    answer: buildLowestStepAnswer(report),
  },
  {
    key: 'SLOWEST_STAGE',
    question: t`Which stage is slowest?`,
    answer: buildSlowestStageAnswer(report),
  },
  {
    key: 'TRACKS',
    question: t`Which track stands out?`,
    answer: buildTrackAnswer(report),
  },
  {
    key: 'STUCK',
    question: t`Where are people stuck?`,
    answer: buildStuckAnswer(report),
  },
];
