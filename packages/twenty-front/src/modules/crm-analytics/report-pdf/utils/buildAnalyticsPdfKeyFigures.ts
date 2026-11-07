import { t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';

import { ANALYTICS_PDF_UNKNOWN_VALUE } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfUnknownValue';
import { describeAnalyticsPdfRate } from '@/crm-analytics/report-pdf/utils/describeAnalyticsPdfRate';
import {
  formatAnalyticsPdfNumber,
  formatAnalyticsPdfOfPeople,
} from '@/crm-analytics/report-pdf/utils/formatAnalyticsPdfNumber';
import { isAnalyticsPdfPreviousPeriodTracked } from '@/crm-analytics/report-pdf/utils/isAnalyticsPdfPreviousPeriodTracked';
import { type AnalyticsReport } from '@/crm-analytics/types/AnalyticsApi';
import { formatAnalyticsSignedNumber } from '@/crm-analytics/utils/formatAnalyticsSignedNumber';

export type AnalyticsPdfKeyFigure = {
  key: string;
  label: string;
  value: string;
  detail: string;
  isLighter: boolean;
};

const buildNewApplicationsFigure = (
  report: AnalyticsReport,
): AnalyticsPdfKeyFigure => {
  const { newApplications, newApplicationsPrevious } = report;
  const label = t`New applications`;

  if (!isDefined(newApplications)) {
    return {
      key: 'NEW_APPLICATIONS',
      label,
      value: ANALYTICS_PDF_UNKNOWN_VALUE,
      detail: t`Form submissions are not available.`,
      isLighter: true,
    };
  }

  const value = formatAnalyticsPdfNumber(newApplications);

  if (
    !isDefined(newApplicationsPrevious) ||
    !isAnalyticsPdfPreviousPeriodTracked(report)
  ) {
    return {
      key: 'NEW_APPLICATIONS',
      label,
      value,
      detail: t`No earlier period to compare with yet.`,
      isLighter: false,
    };
  }

  const change = formatAnalyticsSignedNumber(
    newApplications - newApplicationsPrevious,
    formatAnalyticsPdfNumber,
  );
  const previous = formatAnalyticsPdfNumber(newApplicationsPrevious);

  return {
    key: 'NEW_APPLICATIONS',
    label,
    value,
    detail: t`${change} against the previous period, ${previous}.`,
    isLighter: false,
  };
};

const buildOverallConversionFigure = (
  report: AnalyticsReport,
): AnalyticsPdfKeyFigure => {
  const { overall, rows } = report.funnel;
  const rate = describeAnalyticsPdfRate({
    rate: overall.rate,
    soFarRate: overall.soFarRate,
    sampleSize: overall.eligible,
    minimumSample: report.minimumSample,
  });
  const windowDays = overall.windowDays;
  const finalLabel = rows.find(
    ({ stageKey }) => stageKey === overall.finalStageKey,
  )?.label;

  if (overall.eligible === 0 || !isDefined(overall.rate)) {
    return {
      key: 'OVERALL_CONVERSION',
      label: t`Overall conversion`,
      value: rate.text,
      detail: isDefined(rate.ratio)
        ? t`So far. People need ${windowDays} days to count.`
        : t`People need ${windowDays} days to count.`,
      isLighter: true,
    };
  }

  const ofPeople = formatAnalyticsPdfOfPeople(overall.eligible);

  return {
    key: 'OVERALL_CONVERSION',
    label: t`Overall conversion`,
    value: rate.text,
    detail: isDefined(finalLabel)
      ? t`${ofPeople} reached ${finalLabel} within ${windowDays} days. All applications since tracking start.`
      : t`${ofPeople}, within ${windowDays} days. All applications since tracking start.`,
    isLighter: rate.isLighter,
  };
};

const buildTotalContactsFigure = (
  report: AnalyticsReport,
): AnalyticsPdfKeyFigure => ({
  key: 'TOTAL_CONTACTS',
  label: t`Total contacts`,
  value: formatAnalyticsPdfNumber(report.categories.distinctPeople),
  detail: t`Everyone in the CRM when this report was generated.`,
  isLighter: false,
});

const buildPastStageLimitFigure = (
  report: AnalyticsReport,
): AnalyticsPdfKeyFigure => {
  const total = report.stuckByStage.reduce((sum, { count }) => sum + count, 0);
  const largestRow = report.stuckByStage.reduce<
    AnalyticsReport['stuckByStage'][number] | undefined
  >(
    (largest, row) =>
      row.count > 0 && (!isDefined(largest) || row.count > largest.count)
        ? row
        : largest,
    undefined,
  );

  if (!isDefined(largestRow)) {
    return {
      key: 'PAST_STAGE_LIMIT',
      label: t`Past stage limit`,
      value: formatAnalyticsPdfNumber(total),
      detail: t`No one was past their stage limit when this report was generated.`,
      isLighter: false,
    };
  }

  const largestLabel = largestRow.label;
  const largestCount = formatAnalyticsPdfNumber(largestRow.count);

  return {
    key: 'PAST_STAGE_LIMIT',
    label: t`Past stage limit`,
    value: formatAnalyticsPdfNumber(total),
    detail: t`Most in ${largestLabel}, ${largestCount}. When this report was generated.`,
    isLighter: false,
  };
};

export const buildAnalyticsPdfKeyFigures = (report: AnalyticsReport) => [
  buildNewApplicationsFigure(report),
  buildOverallConversionFigure(report),
  buildTotalContactsFigure(report),
  buildPastStageLimitFigure(report),
];
