import { i18n } from '@lingui/core';
import { styled } from '@linaria/react';
import { plural, t } from '@lingui/core/macro';
import { Temporal } from 'temporal-polyfill';
import { isDefined } from 'twenty-shared/utils';
import { InlineBanner } from 'twenty-ui/components/feedback';
import { OverflowingTextWithTooltip } from 'twenty-ui/primitives/typography';
import { themeCssVariables } from 'twenty-ui/theme';

import { AnalyticsCategoryTable } from '@/crm-analytics/components/AnalyticsCategoryTable';
import { AnalyticsCohortTable } from '@/crm-analytics/components/AnalyticsCohortTable';
import { AnalyticsMovementTable } from '@/crm-analytics/components/AnalyticsMovementTable';
import { AnalyticsRateCell } from '@/crm-analytics/components/AnalyticsRateCell';
import {
  AnalyticsNotice,
  AnalyticsSection,
  AnalyticsTabLayout,
} from '@/crm-analytics/components/AnalyticsSection';
import { AnalyticsSkeleton } from '@/crm-analytics/components/AnalyticsSkeleton';
import { AnalyticsStageLedger } from '@/crm-analytics/components/AnalyticsStageLedger';
import { AnalyticsStatePanel } from '@/crm-analytics/components/AnalyticsStatePanel';
import { AnalyticsTable } from '@/crm-analytics/components/AnalyticsTable';
import { GET_CRM_ANALYTICS_REPORT } from '@/crm-analytics/graphql/getCrmAnalyticsReport';
import { useCrmAnalyticsQuery } from '@/crm-analytics/hooks/useCrmAnalyticsQuery';
import {
  type AnalyticsReport,
  type AnalyticsReportComparison,
  type AnalyticsReportPeriodType,
} from '@/crm-analytics/types/AnalyticsApi';
import { buildCategoriesTakeaway } from '@/crm-analytics/utils/buildCategoriesTakeaway';
import { buildFunnelTakeaway } from '@/crm-analytics/utils/buildFunnelTakeaway';
import { formatAnalyticsReportPeriod } from '@/crm-analytics/utils/formatAnalyticsReportPeriod';
import { formatAnalyticsSignedNumber } from '@/crm-analytics/utils/formatAnalyticsSignedNumber';
import { isAnalyticsPeriodFullyTracked } from '@/crm-analytics/utils/isAnalyticsPeriodFullyTracked';
import { useNumberFormat } from '@/localization/hooks/useNumberFormat';

const NEW_APPLICATIONS_METRIC_KEY = 'NEW_APPLICATIONS';
const ENTERED_METRIC_KEY_PREFIX = 'ENTERED_';

const StyledReport = styled.article`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  min-width: 0;
`;

const StyledReportTitle = styled.h2`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.lg};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  margin: 0;
`;

const StyledPair = styled.div`
  align-items: start;
  display: grid;
  gap: ${themeCssVariables.spacing[5]};
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));
`;

const StyledSentence = styled.p`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.sm};
  margin: 0;
`;

const StyledSignificantMark = styled.span`
  align-items: center;
  color: ${themeCssVariables.font.color.secondary};
  display: inline-flex;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing[1]};
  margin-inline-start: ${themeCssVariables.spacing[2]};
`;

const StyledSignificantDot = styled.span`
  background: ${themeCssVariables.color.blue};
  border-radius: 50%;
  height: 6px;
  width: 6px;
`;

// Stored reports stay as generated, and the first of each type compared itself with untracked days.
const isPreviousReportPeriodTracked = (report: AnalyticsReport) => {
  const previousStart = Temporal.PlainDate.from(
    report.periodStart.slice(0, 10),
  ).subtract(report.periodType === 'MONTH' ? { months: 1 } : { weeks: 1 });

  return isAnalyticsPeriodFullyTracked(previousStart.toString(), report);
};

const getNoEarlierPeriodText = () =>
  t`There is no earlier period to compare with yet.`;

// The stored label is frozen English, so known measures translate by key and fall back to it.
const getComparisonLabel = (
  { metricKey, label }: AnalyticsReportComparison,
  movement: AnalyticsReport['movement'],
) => {
  if (metricKey === NEW_APPLICATIONS_METRIC_KEY) {
    return t`New applications`;
  }

  const stageLabel = movement.find(
    ({ stageKey }) => `${ENTERED_METRIC_KEY_PREFIX}${stageKey}` === metricKey,
  )?.label;

  return isDefined(stageLabel) ? t`Entered ${stageLabel}` : label;
};

const buildReportTakeaway = (
  report: AnalyticsReport,
  isPreviousPeriodTracked: boolean,
  formatNumber: (value: number) => string,
) => {
  const significantCount = report.comparisons.filter(
    (comparison) => comparison.isSignificant,
  ).length;
  const formattedSignificantCount = formatNumber(significantCount);

  const significantSentence =
    significantCount === 0
      ? t`No significant changes.`
      : plural(significantCount, {
          one: `${formattedSignificantCount} significant change.`,
          other: `${formattedSignificantCount} significant changes.`,
        });

  if (!isDefined(report.newApplications)) {
    return isPreviousPeriodTracked
      ? significantSentence
      : getNoEarlierPeriodText();
  }

  const newApplicationsCount = formatNumber(report.newApplications);
  const applicationsPhrase = plural(report.newApplications, {
    one: `${newApplicationsCount} new application`,
    other: `${newApplicationsCount} new applications`,
  });

  if (!isPreviousPeriodTracked) {
    return t`${applicationsPhrase}.`;
  }

  if (!isDefined(report.newApplicationsPrevious)) {
    return t`${applicationsPhrase}. ${significantSentence}`;
  }

  const change = formatAnalyticsSignedNumber(
    report.newApplications - report.newApplicationsPrevious,
    formatNumber,
  );

  return t`${applicationsPhrase}, ${change} against the previous period. ${significantSentence}`;
};

type AnalyticsReportCountProps = {
  value: number | null;
};

const AnalyticsReportCount = ({ value }: AnalyticsReportCountProps) => {
  const { formatNumber } = useNumberFormat();

  return isDefined(value) ? (
    <span>{formatNumber(value)}</span>
  ) : (
    <AnalyticsRateCell rate={null} />
  );
};

type AnalyticsReportComparisonsTableProps = {
  comparisons: AnalyticsReportComparison[];
  movement: AnalyticsReport['movement'];
};

const AnalyticsReportComparisonsTable = ({
  comparisons,
  movement,
}: AnalyticsReportComparisonsTableProps) => {
  const { formatNumber } = useNumberFormat();

  return (
    <AnalyticsTable.Root aria-label={t`Compared with the previous period`}>
      <thead>
        <tr>
          <AnalyticsTable.HeaderCell>{t`Measure`}</AnalyticsTable.HeaderCell>
          <AnalyticsTable.HeaderCell isNumeric>
            {t`This period`}
          </AnalyticsTable.HeaderCell>
          <AnalyticsTable.HeaderCell isNumeric>
            {t`Previous period`}
          </AnalyticsTable.HeaderCell>
          <AnalyticsTable.HeaderCell isNumeric>
            {t`Change`}
          </AnalyticsTable.HeaderCell>
        </tr>
      </thead>
      <tbody>
        {comparisons.map((comparison) => (
          <AnalyticsTable.Row key={comparison.metricKey}>
            <AnalyticsTable.Cell dir="auto">
              {getComparisonLabel(comparison, movement)}
              {comparison.isSignificant && (
                <StyledSignificantMark>
                  <StyledSignificantDot aria-hidden="true" />
                  {t`Significant change`}
                </StyledSignificantMark>
              )}
            </AnalyticsTable.Cell>
            <AnalyticsTable.Cell isNumeric>
              <AnalyticsReportCount value={comparison.current} />
            </AnalyticsTable.Cell>
            <AnalyticsTable.Cell isNumeric>
              <AnalyticsReportCount value={comparison.previous} />
            </AnalyticsTable.Cell>
            <AnalyticsTable.Cell isNumeric>
              {isDefined(comparison.current) && isDefined(comparison.previous)
                ? formatAnalyticsSignedNumber(
                    comparison.current - comparison.previous,
                    formatNumber,
                  )
                : null}
            </AnalyticsTable.Cell>
          </AnalyticsTable.Row>
        ))}
      </tbody>
    </AnalyticsTable.Root>
  );
};

type AnalyticsReportPastLimitTableProps = {
  rows: AnalyticsReport['stuckByStage'];
};

const AnalyticsReportPastLimitTable = ({
  rows,
}: AnalyticsReportPastLimitTableProps) => {
  const { formatNumber } = useNumberFormat();

  return (
    <AnalyticsTable.Root aria-label={t`People past their stage limit`}>
      <thead>
        <tr>
          <AnalyticsTable.HeaderCell>{t`Stage`}</AnalyticsTable.HeaderCell>
          <AnalyticsTable.HeaderCell isNumeric>
            {t`People`}
          </AnalyticsTable.HeaderCell>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <AnalyticsTable.Row key={row.stageKey}>
            <AnalyticsTable.Cell isTruncated dir="auto">
              <OverflowingTextWithTooltip text={row.label} />
            </AnalyticsTable.Cell>
            <AnalyticsTable.Cell isNumeric>
              {formatNumber(row.count)}
            </AnalyticsTable.Cell>
          </AnalyticsTable.Row>
        ))}
      </tbody>
    </AnalyticsTable.Root>
  );
};

type AnalyticsReportViewProps = {
  periodType: AnalyticsReportPeriodType;
  periodStart: string;
};

export const AnalyticsReportView = ({
  periodType,
  periodStart,
}: AnalyticsReportViewProps) => {
  const { formatNumber } = useNumberFormat();

  const {
    payload: report,
    isFirstLoad,
    isRefetching,
    isForbidden,
    error,
    retry,
  } = useCrmAnalyticsQuery<AnalyticsReport>({
    query: GET_CRM_ANALYTICS_REPORT,
    rootField: 'getCrmAnalyticsReport',
    variables: { periodType, periodStart },
  });

  if (isForbidden) {
    return <AnalyticsStatePanel kind="FORBIDDEN" />;
  }

  if (isDefined(error)) {
    return <AnalyticsStatePanel kind="ERROR" error={error} onRetry={retry} />;
  }

  if (isFirstLoad) {
    return <AnalyticsSkeleton shape="table" rowCount={6} columnCount={4} />;
  }

  if (!isDefined(report)) {
    return (
      <AnalyticsNotice>{t`This report could not be found.`}</AnalyticsNotice>
    );
  }

  const reportPeriod = formatAnalyticsReportPeriod(report);

  const generatedAt = i18n.date(new Date(report.generatedAt), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: report.reportingTimeZone,
    timeZoneName: 'short',
  });
  const trackingStartedOn = i18n.date(new Date(report.trackingStartedAt), {
    dateStyle: 'medium',
    timeZone: report.reportingTimeZone,
  });
  const minimumSample = formatNumber(report.minimumSample);
  const isPreviousPeriodTracked = isPreviousReportPeriodTracked(report);
  const isProvisional = report.isProvisional === true;

  return (
    <StyledReport>
      <StyledReportTitle>
        {report.periodType === 'MONTH'
          ? t`Monthly report, ${reportPeriod}`
          : t`Weekly report, ${reportPeriod}`}
      </StyledReportTitle>
      {isProvisional && (
        <InlineBanner status="neutral" variant="soft" embedded>
          {t`Built on provisional definitions. It will be rebuilt once they are confirmed.`}
        </InlineBanner>
      )}
      <AnalyticsTabLayout
        takeaway={buildReportTakeaway(
          report,
          isPreviousPeriodTracked,
          formatNumber,
        )}
        notices={[
          isProvisional
            ? t`Generated ${generatedAt}.`
            : t`Generated ${generatedAt}. It stays as generated; corrections appear in the next report.`,
          t`Tracking started ${trackingStartedOn}. Imported people count in current totals only, never in rates.`,
        ]}
        isRefetching={isRefetching}
      >
        <AnalyticsSection
          title={t`Compared with the previous period`}
          note={
            isPreviousPeriodTracked
              ? t`Counts inside each period, by event date. A row is marked when the change is significant and both counts are at least ${minimumSample}.`
              : undefined
          }
        >
          {isPreviousPeriodTracked && report.comparisons.length > 0 ? (
            <AnalyticsReportComparisonsTable
              comparisons={report.comparisons}
              movement={report.movement}
            />
          ) : (
            <AnalyticsNotice>{getNoEarlierPeriodText()}</AnalyticsNotice>
          )}
        </AnalyticsSection>
        <AnalyticsSection
          title={t`Stage by stage`}
          note={t`People, all applications since tracking start. The applications of this period are too recent to rate.`}
        >
          <StyledSentence>
            {buildFunnelTakeaway({ funnel: report.funnel, formatNumber })}
          </StyledSentence>
          <AnalyticsStageLedger funnel={report.funnel} />
        </AnalyticsSection>
        <AnalyticsSection
          title={
            report.categories.groupBy === 'SOURCE'
              ? t`Sources`
              : t`Tracks and programs`
          }
          note={t`New applications from this period, people as of generation, rates from all applications since tracking start. n/a means not enough data.`}
        >
          <StyledSentence>
            {buildCategoriesTakeaway(report.categories)}
          </StyledSentence>
          <AnalyticsCategoryTable
            categories={report.categories}
            stages={report.funnel.rows}
          />
        </AnalyticsSection>
        <StyledPair>
          <AnalyticsSection
            title={t`Stage movement`}
            note={t`Moves into and out of each stage in this period, by event date. Now is as of generation.`}
          >
            <AnalyticsMovementTable rows={report.movement} />
          </AnalyticsSection>
          <AnalyticsSection
            title={t`People past their stage limit`}
            note={t`Active people, as of generation.`}
          >
            {report.stuckByStage.some((row) => row.count > 0) ? (
              <AnalyticsReportPastLimitTable rows={report.stuckByStage} />
            ) : (
              <AnalyticsNotice>
                {t`No one is past their stage limit.`}
              </AnalyticsNotice>
            )}
          </AnalyticsSection>
        </StyledPair>
        {report.cohorts.length > 0 && (
          <AnalyticsSection
            title={t`Conversion by application month`}
            note={t`People, by application month up to the end of this period. Muted means still inside the window or a small sample. n/a means not enough data.`}
          >
            <AnalyticsCohortTable
              rows={report.cohorts}
              stages={report.funnel.rows}
              period="MONTH"
              minimumSample={report.minimumSample}
            />
          </AnalyticsSection>
        )}
      </AnalyticsTabLayout>
    </StyledReport>
  );
};
