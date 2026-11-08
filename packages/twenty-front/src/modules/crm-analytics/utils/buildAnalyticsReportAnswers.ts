import { t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';

import { type AnalyticsAnswerCard } from '@/crm-analytics/charts/AnalyticsAnswerCards';
import { type AnalyticsReport } from '@/crm-analytics/types/AnalyticsApi';
import { describeAnalyticsRate } from '@/crm-analytics/utils/describeAnalyticsRate';
import { formatAnalyticsOfPeople } from '@/crm-analytics/utils/formatAnalyticsOfPeople';
import { formatAnalyticsSignedNumber } from '@/crm-analytics/utils/formatAnalyticsSignedNumber';

type BuildAnalyticsReportAnswersArgs = {
  report: AnalyticsReport;
  isPreviousPeriodTracked: boolean;
  formatNumber: (value: number) => string;
};

const getOverallDetail = (
  { funnel }: AnalyticsReport,
  formatNumber: (value: number) => string,
) => {
  const { overall } = funnel;
  const rate = describeAnalyticsRate({
    rate: overall.rate,
    soFarRate: overall.soFarRate,
    eligible: overall.eligible,
    isUnderMinimum: overall.isUnderMinimum,
  });

  if (rate.isInProgress) {
    return t`Still in progress`;
  }

  if (!isDefined(rate.value)) {
    const windowDays = overall.windowDays;

    return t`Appears once people have had ${windowDays} days to reach the end`;
  }

  const ofPeople = formatAnalyticsOfPeople(overall.eligible, formatNumber);

  return rate.isSmallSample ? t`Small sample, ${ofPeople}` : ofPeople;
};

export const buildAnalyticsReportAnswers = ({
  report,
  isPreviousPeriodTracked,
  formatNumber,
}: BuildAnalyticsReportAnswersArgs): AnalyticsAnswerCard[] => {
  const significantCount = report.comparisons.filter(
    ({ isSignificant }) => isSignificant,
  ).length;

  const applicationChange =
    isPreviousPeriodTracked &&
    isDefined(report.newApplications) &&
    isDefined(report.newApplicationsPrevious)
      ? formatAnalyticsSignedNumber(
          report.newApplications - report.newApplicationsPrevious,
          formatNumber,
        )
      : null;

  const overallRate = describeAnalyticsRate({
    rate: report.funnel.overall.rate,
    soFarRate: report.funnel.overall.soFarRate,
    eligible: report.funnel.overall.eligible,
    isUnderMinimum: report.funnel.overall.isUnderMinimum,
  });

  return [
    {
      key: 'new-applications',
      label: t`New applications`,
      value: isDefined(report.newApplications)
        ? formatNumber(report.newApplications)
        : null,
      detail: isDefined(applicationChange)
        ? t`${applicationChange} against the previous period`
        : null,
    },
    {
      key: 'overall-conversion',
      label: t`Overall conversion`,
      value: overallRate.label,
      detail: getOverallDetail(report, formatNumber),
      isLighter: overallRate.isSmallSample || overallRate.isInProgress,
    },
    {
      key: 'significant-changes',
      label: t`Significant changes`,
      value: isPreviousPeriodTracked ? formatNumber(significantCount) : null,
      detail: isPreviousPeriodTracked
        ? t`Against the previous period`
        : t`No earlier period yet`,
    },
  ];
};
