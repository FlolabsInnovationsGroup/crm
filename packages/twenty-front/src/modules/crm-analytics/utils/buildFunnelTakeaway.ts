import { i18n } from '@lingui/core';
import { t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';

import { type AnalyticsFunnel } from '@/crm-analytics/types/AnalyticsApi';
import { formatAnalyticsRate } from '@/crm-analytics/utils/formatAnalyticsRate';

type BuildFunnelTakeawayArgs = {
  funnel: AnalyticsFunnel;
  formatNumber: (value: number) => string;
};

const buildOverallSentence = ({
  funnel,
  formatNumber,
}: BuildFunnelTakeawayArgs): string | null => {
  const { overall } = funnel;
  const windowDays = overall.windowDays;

  if (!isDefined(overall.rate)) {
    const trackingStartedOn = i18n.date(new Date(funnel.trackingStartedAt), {
      dateStyle: 'medium',
      timeZone: funnel.reportingTimeZone,
    });

    return t`Tracking started ${trackingStartedOn}. Conversion appears once people pass the ${windowDays}-day window.`;
  }

  if (overall.isUnderMinimum) {
    const minimumSample = formatNumber(funnel.minimumSample);

    return t`Fewer than ${minimumSample} people have passed the ${windowDays}-day window so far.`;
  }

  const finalLabel = funnel.rows.find(
    (row) => row.stageKey === overall.finalStageKey,
  )?.label;

  if (!isDefined(finalLabel)) {
    return null;
  }

  const rate = formatAnalyticsRate(overall.rate);
  const eligible = formatNumber(overall.eligible);

  return t`${rate} of ${eligible} reached ${finalLabel}.`;
};

const buildLowestStepSentence = (funnel: AnalyticsFunnel): string | null => {
  const lowestRowIndex = funnel.rows.findIndex(
    (row) => row.stageKey === funnel.lowestStepStageKey,
  );
  const lowestRow = funnel.rows[lowestRowIndex];
  const nextRow = funnel.rows[lowestRowIndex + 1];

  if (
    !isDefined(lowestRow) ||
    !isDefined(nextRow) ||
    lowestRow.isUnderMinimum ||
    !isDefined(lowestRow.stepRate)
  ) {
    return null;
  }

  const fromLabel = lowestRow.label;
  const toLabel = nextRow.label;
  const rate = formatAnalyticsRate(lowestRow.stepRate);

  return t`Lowest step: ${fromLabel} to ${toLabel}, ${rate}.`;
};

export const buildFunnelTakeaway = (args: BuildFunnelTakeawayArgs): string =>
  [buildOverallSentence(args), buildLowestStepSentence(args.funnel)]
    .filter(isDefined)
    .join(' ');
