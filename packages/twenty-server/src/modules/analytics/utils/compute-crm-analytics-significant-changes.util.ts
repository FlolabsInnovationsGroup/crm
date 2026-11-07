import { isDefined } from 'twenty-shared/utils';

import { type AnalyticsReportComparison } from 'src/modules/analytics/types/analytics-api.type';

export type CrmAnalyticsChange = Omit<
  AnalyticsReportComparison,
  'isSignificant'
>;

// Both values must meet the minimum, so a jump from 2 to 40 never reads as a trend.
const isChangeSignificant = ({
  current,
  previous,
  minimumSample,
  significantChangeRatio,
}: {
  current: number | null;
  previous: number | null;
  minimumSample: number;
  significantChangeRatio: number;
}): boolean => {
  if (!isDefined(current) || !isDefined(previous)) {
    return false;
  }

  if (current < minimumSample || previous < minimumSample) {
    return false;
  }

  return Math.abs(current - previous) / previous >= significantChangeRatio;
};

export const computeCrmAnalyticsSignificantChanges = ({
  changes,
  minimumSample,
  significantChangeRatio,
}: {
  changes: CrmAnalyticsChange[];
  minimumSample: number;
  significantChangeRatio: number;
}): AnalyticsReportComparison[] =>
  changes.map((change) => ({
    ...change,
    isSignificant: isChangeSignificant({
      current: change.current,
      previous: change.previous,
      minimumSample,
      significantChangeRatio,
    }),
  }));
