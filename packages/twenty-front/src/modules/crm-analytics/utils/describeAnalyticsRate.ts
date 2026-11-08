import { t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';

import { formatAnalyticsRate } from '@/crm-analytics/utils/formatAnalyticsRate';

export type AnalyticsRateDescription = {
  // Null is unknown: charts draw nothing and show a dash, never 0%.
  value: number | null;
  label: string | null;
  isInProgress: boolean;
  isSmallSample: boolean;
};

type DescribeAnalyticsRateArgs = {
  rate: number | null;
  soFarRate?: number | null;
  eligible?: number | null;
  isUnderMinimum?: boolean;
};

// The same rules as AnalyticsRateCell, for charts and answer cards.
export const describeAnalyticsRate = ({
  rate,
  soFarRate,
  eligible,
  isUnderMinimum = false,
}: DescribeAnalyticsRateArgs): AnalyticsRateDescription => {
  if (isDefined(rate) && eligible !== 0) {
    return {
      value: rate,
      label: formatAnalyticsRate(rate),
      isInProgress: false,
      isSmallSample: isUnderMinimum,
    };
  }

  if (isDefined(soFarRate) && soFarRate > 0) {
    const formattedSoFarRate = formatAnalyticsRate(soFarRate);

    return {
      value: soFarRate,
      label: t`${formattedSoFarRate} so far`,
      isInProgress: true,
      isSmallSample: false,
    };
  }

  return {
    value: null,
    label: null,
    isInProgress: false,
    isSmallSample: false,
  };
};
