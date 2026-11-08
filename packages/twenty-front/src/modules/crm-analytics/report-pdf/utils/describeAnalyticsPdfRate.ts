import { t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';

import { ANALYTICS_PDF_UNKNOWN_VALUE } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfUnknownValue';
import { type AnalyticsPdfRate } from '@/crm-analytics/report-pdf/types/AnalyticsPdfRate';
import {
  formatAnalyticsPdfNumber,
  formatAnalyticsPdfOfPeople,
} from '@/crm-analytics/report-pdf/utils/formatAnalyticsPdfNumber';
import { formatAnalyticsRate } from '@/crm-analytics/utils/formatAnalyticsRate';

type DescribeAnalyticsPdfRateArgs = {
  rate: number | null;
  soFarRate?: number | null;
  sampleSize: number | null;
  minimumSample: number;
};

// The one place a rate becomes print, so an unknown can never reach the page as 0%.
export const describeAnalyticsPdfRate = ({
  rate,
  soFarRate,
  sampleSize,
  minimumSample,
}: DescribeAnalyticsPdfRateArgs): AnalyticsPdfRate => {
  const formattedRate = sampleSize === 0 ? null : formatAnalyticsRate(rate);

  if (isDefined(formattedRate)) {
    const smallSampleSize =
      isDefined(sampleSize) && sampleSize < minimumSample ? sampleSize : null;
    const formattedSampleSize = isDefined(smallSampleSize)
      ? formatAnalyticsPdfNumber(smallSampleSize)
      : null;

    return {
      ratio: rate,
      text: formattedRate,
      detail: isDefined(smallSampleSize)
        ? formatAnalyticsPdfOfPeople(smallSampleSize)
        : null,
      shortDetail: isDefined(formattedSampleSize)
        ? t`of ${formattedSampleSize}`
        : null,
      isLighter: isDefined(smallSampleSize),
    };
  }

  // Nobody has moved yet inside the window, which is not the same as a measured 0%.
  if (isDefined(soFarRate) && soFarRate > 0) {
    return {
      ratio: soFarRate,
      text: formatAnalyticsRate(soFarRate) ?? ANALYTICS_PDF_UNKNOWN_VALUE,
      detail: t`so far`,
      shortDetail: t`so far`,
      isLighter: true,
    };
  }

  return {
    ratio: null,
    text: ANALYTICS_PDF_UNKNOWN_VALUE,
    detail: null,
    shortDetail: null,
    isLighter: true,
  };
};
