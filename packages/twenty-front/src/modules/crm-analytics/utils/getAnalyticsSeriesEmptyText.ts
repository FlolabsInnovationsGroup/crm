import { i18n } from '@lingui/core';
import { t } from '@lingui/core/macro';

import {
  type AnalyticsBase,
  type AnalyticsPeriod,
  type AnalyticsTrendMetric,
  type AnalyticsTrends,
} from '@/crm-analytics/types/AnalyticsApi';

export const getAnalyticsSeriesUnavailableText = (
  unavailableReason: NonNullable<AnalyticsTrends['unavailableReason']>,
) => {
  switch (unavailableReason) {
    case 'DAILY_RATE':
      return t`A rate needs a whole group of people, so it has no daily line. Choose By week or By month.`;
    case 'SNAPSHOT_FILTER_COMBINATION':
      return t`Stored daily counts use one category at a time. Keep only one of Track, Program or Source.`;
    case 'NO_SUBMISSION_OBJECT':
      return t`This workspace has no application forms, so new applications cannot be counted.`;
  }
};

export const getAnalyticsSeriesNoValueText = (
  metric: AnalyticsTrendMetric,
  period: AnalyticsPeriod,
  {
    trackingStartedAt,
    reportingTimeZone,
  }: Pick<AnalyticsBase, 'trackingStartedAt' | 'reportingTimeZone'>,
) => {
  switch (metric) {
    case 'NEW_APPLICATIONS':
      return t`No applications in this range yet.`;
    case 'TOTAL_CONTACTS':
    case 'ACTIVE_PEOPLE':
    case 'STAGE_COUNT':
      return t`No daily counts are stored for this range yet.`;
    case 'MEDIAN_DAYS':
      return t`No completed stays in this range yet.`;
    case 'OVERALL_CONVERSION':
    case 'DROP_OFF': {
      const trackingStartedOn = i18n.date(new Date(trackingStartedAt), {
        dateStyle: 'medium',
        timeZone: reportingTimeZone,
      });

      return period === 'MONTH'
        ? t`Tracking started ${trackingStartedOn}. No period here has a rate to draw yet. Try a longer date range.`
        : t`Tracking started ${trackingStartedOn}. No period here has a rate to draw yet. Try By month or a longer date range.`;
    }
  }
};
