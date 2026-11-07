import { t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';

import { type AnalyticsFunnel } from '@/crm-analytics/types/AnalyticsApi';
import { describeAnalyticsRate } from '@/crm-analytics/utils/describeAnalyticsRate';
import { formatAnalyticsPeopleCount } from '@/crm-analytics/utils/formatAnalyticsPeopleCount';

export type AnalyticsOverallConversionAnswer = {
  value: string | null;
  detail: string;
  // A small group or still in progress, so the value draws lighter.
  isLighter: boolean;
};

type BuildOverallConversionAnswerArgs = {
  funnel: Pick<AnalyticsFunnel, 'overall' | 'rows'>;
  formatNumber: (value: number) => string;
};

export const buildOverallConversionAnswer = ({
  funnel: { overall, rows },
  formatNumber,
}: BuildOverallConversionAnswerArgs): AnalyticsOverallConversionAnswer => {
  const { isInProgress, isSmallSample, label, value } = describeAnalyticsRate({
    rate: overall.rate,
    soFarRate: overall.soFarRate,
    eligible: overall.eligible,
    isUnderMinimum: overall.isUnderMinimum,
  });

  const windowDays = overall.windowDays;
  const reached = formatNumber(overall.reached);
  const people = formatAnalyticsPeopleCount(overall.eligible, formatNumber);
  const finalLabel =
    rows.find((row) => row.stageKey === overall.finalStageKey)?.label ??
    t`the final stage`;

  if (!isDefined(value)) {
    return {
      value: null,
      detail: t`Shows once people have had ${windowDays} days to reach the end.`,
      isLighter: false,
    };
  }

  if (isInProgress) {
    return {
      value: label,
      detail: t`Still in progress: no one has had ${windowDays} days to reach the end yet.`,
      isLighter: true,
    };
  }

  return {
    value: label,
    detail: isSmallSample
      ? t`${reached} of ${people} reached ${finalLabel} within ${windowDays} days. A small group, so read this with care.`
      : t`${reached} of ${people} reached ${finalLabel} within ${windowDays} days.`,
    isLighter: isSmallSample,
  };
};
