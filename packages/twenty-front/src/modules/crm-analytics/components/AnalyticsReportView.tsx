import { i18n } from '@lingui/core';
import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { useState } from 'react';
import { Temporal } from 'temporal-polyfill';
import { isDefined } from 'twenty-shared/utils';
import { InlineBanner } from 'twenty-ui/components/feedback';
import { IconDownload } from 'twenty-ui/icon';
import { Button } from 'twenty-ui/primitives/input';
import { OverflowingTextWithTooltip } from 'twenty-ui/primitives/typography';
import { themeCssVariables } from 'twenty-ui/theme';

import { AnalyticsAnswerCards } from '@/crm-analytics/charts/AnalyticsAnswerCards';
import { AnalyticsChartCard } from '@/crm-analytics/charts/AnalyticsChartCard';
import { ANALYTICS_CHART_COLOR } from '@/crm-analytics/charts/AnalyticsChartColor';
import { AnalyticsChartGrid } from '@/crm-analytics/charts/AnalyticsChartGrid';
import { AnalyticsColumnChart } from '@/crm-analytics/charts/AnalyticsColumnChart';
import { AnalyticsDivergingBarChart } from '@/crm-analytics/charts/AnalyticsDivergingBarChart';
import { AnalyticsFunnelChart } from '@/crm-analytics/charts/AnalyticsFunnelChart';
import { AnalyticsHeatmap } from '@/crm-analytics/charts/AnalyticsHeatmap';
import { AnalyticsHorizontalBarChart } from '@/crm-analytics/charts/AnalyticsHorizontalBarChart';
import { AnalyticsLineChart } from '@/crm-analytics/charts/AnalyticsLineChart';
import { AnalyticsCategoryTable } from '@/crm-analytics/components/AnalyticsCategoryTable';
import { AnalyticsCohortTable } from '@/crm-analytics/components/AnalyticsCohortTable';
import { AnalyticsMovementTable } from '@/crm-analytics/components/AnalyticsMovementTable';
import { AnalyticsRateCell } from '@/crm-analytics/components/AnalyticsRateCell';
import { AnalyticsNotice } from '@/crm-analytics/components/AnalyticsSection';
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
import {
  buildAnalyticsCategoryPeopleRows,
  buildAnalyticsCategoryRateRows,
} from '@/crm-analytics/utils/buildAnalyticsCategoryBarRows';
import { buildAnalyticsCohortHeatmap } from '@/crm-analytics/utils/buildAnalyticsCohortHeatmap';
import { buildAnalyticsReportAnswers } from '@/crm-analytics/utils/buildAnalyticsReportAnswers';
import { buildAnalyticsReportTrendCharts } from '@/crm-analytics/utils/buildAnalyticsReportTrendCharts';
import {
  buildFunnelChartSteps,
  buildStepConversionColumns,
} from '@/crm-analytics/utils/buildFunnelCharts';
import { formatAnalyticsRate } from '@/crm-analytics/utils/formatAnalyticsRate';
import { formatAnalyticsReportPeriod } from '@/crm-analytics/utils/formatAnalyticsReportPeriod';
import { formatAnalyticsSignedNumber } from '@/crm-analytics/utils/formatAnalyticsSignedNumber';
import { isAnalyticsPeriodFullyTracked } from '@/crm-analytics/utils/isAnalyticsPeriodFullyTracked';
import { useNumberFormat } from '@/localization/hooks/useNumberFormat';

const NEW_APPLICATIONS_METRIC_KEY = 'NEW_APPLICATIONS';
const ENTERED_METRIC_KEY_PREFIX = 'ENTERED_';

const StyledReport = styled.article<{ isRefetching: boolean }>`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[4]};
  min-width: 0;
  opacity: ${({ isRefetching }) => (isRefetching ? 0.6 : 1)};
`;

const StyledReportHeader = styled.header`
  align-items: flex-start;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: space-between;
`;

const StyledReportHeading = styled.div`
  display: flex;
  flex: 1 1 320px;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
  min-width: 0;
`;

const StyledReportTitle = styled.h2`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.lg};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  margin: 0;
`;

const StyledReportNotice = styled.p`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  margin: 0;
`;

const StyledDownload = styled.div`
  align-items: flex-end;
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
  max-width: 100%;
`;

const StyledDownloadError = styled.p`
  color: ${themeCssVariables.font.color.danger};
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

type AnalyticsReportDownloadProps = {
  report: AnalyticsReport;
};

const AnalyticsReportDownload = ({ report }: AnalyticsReportDownloadProps) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const [hasDownloadFailed, setHasDownloadFailed] = useState(false);

  const handleDownload = async () => {
    setIsDownloading(true);
    setHasDownloadFailed(false);

    try {
      const { downloadAnalyticsReportPdf } = await import(
        '@/crm-analytics/report-pdf/downloadAnalyticsReportPdf'
      );

      await downloadAnalyticsReportPdf(report);
    } catch {
      setHasDownloadFailed(true);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <StyledDownload>
      <Button
        variant="outline"
        size="sm"
        loading={isDownloading}
        startIcon={<IconDownload size={14} />}
        onClick={handleDownload}
      >
        {t`Download PDF`}
      </Button>
      {hasDownloadFailed && (
        <StyledDownloadError role="alert">
          {t`The PDF could not be made. Please try again.`}
        </StyledDownloadError>
      )}
    </StyledDownload>
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
    return <AnalyticsSkeleton shape="chart" />;
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
  const isBySource = report.categories.groupBy === 'SOURCE';
  const formatRate = (value: number) => formatAnalyticsRate(value) ?? '';

  const answers = buildAnalyticsReportAnswers({
    report,
    isPreviousPeriodTracked,
    formatNumber,
  });
  const peopleRows = buildAnalyticsCategoryPeopleRows(
    report.categories,
    formatNumber,
  );
  const rateRows = buildAnalyticsCategoryRateRows(
    report.categories,
    formatNumber,
  );
  const cohortHeatmap = buildAnalyticsCohortHeatmap({
    cohorts: report.cohorts,
    stages: report.funnel.rows,
    period: 'MONTH',
    minimumSample: report.minimumSample,
    formatNumber,
  });
  const canCompare =
    isPreviousPeriodTracked && report.comparisons.length > 0;

  return (
    <StyledReport aria-busy={isRefetching} isRefetching={isRefetching}>
      <StyledReportHeader>
        <StyledReportHeading>
          <StyledReportTitle>
            {report.periodType === 'MONTH'
              ? t`Monthly report, ${reportPeriod}`
              : t`Weekly report, ${reportPeriod}`}
          </StyledReportTitle>
          <StyledReportNotice>
            {isProvisional
              ? t`Generated ${generatedAt}.`
              : t`Generated ${generatedAt}. It stays as generated; corrections appear in the next report.`}
          </StyledReportNotice>
          <StyledReportNotice>
            {t`Tracking started ${trackingStartedOn}. Imported people count in current totals only, never in rates.`}
          </StyledReportNotice>
        </StyledReportHeading>
        <AnalyticsReportDownload report={report} />
      </StyledReportHeader>
      {isProvisional && (
        <InlineBanner status="neutral" variant="soft" embedded>
          {t`Built on provisional definitions. It will be rebuilt once they are confirmed.`}
        </InlineBanner>
      )}
      <AnalyticsAnswerCards cards={answers} />
      <AnalyticsChartGrid>
        <AnalyticsChartCard
          title={t`From new to signed`}
          note={t`Counts people across all applications since tracking started. People who applied in this period are still in progress, so they are not rated yet.`}
          isEmpty={report.funnel.rows.length === 0}
          numbers={<AnalyticsStageLedger funnel={report.funnel} />}
        >
          <AnalyticsFunnelChart
            ariaLabel={t`People reaching each stage, with the percent moving on to the next`}
            steps={buildFunnelChartSteps({
              funnel: report.funnel,
              formatNumber,
            })}
            lowestStepKey={report.funnel.lowestStepStageKey}
          />
        </AnalyticsChartCard>
        <AnalyticsChartCard
          title={t`Conversion at each step`}
          note={t`The percent of people who moved on within the time allowed. A lighter column is a small sample or still in progress, and a dash means not enough data.`}
          isEmpty={report.funnel.rows.length < 2}
        >
          <AnalyticsColumnChart
            ariaLabel={t`Percent of people moving on at each step`}
            columns={buildStepConversionColumns({
              funnel: report.funnel,
              formatNumber,
            })}
            highlightedColumnKey={report.funnel.lowestStepStageKey}
            highlightLabel={t`Lowest step`}
            maxValue={1}
            formatValue={formatRate}
          />
        </AnalyticsChartCard>
        <AnalyticsChartCard
          title={
            isBySource
              ? t`How many people came from each source?`
              : t`How many people are in each track?`
          }
          note={t`People as of when this report was made. Someone with several positions counts once in each.`}
          isEmpty={
            peopleRows.rows.length === 0 && peopleRows.dividedRows.length === 0
          }
          numbers={
            <AnalyticsCategoryTable
              categories={report.categories}
              stages={report.funnel.rows}
            />
          }
        >
          <AnalyticsHorizontalBarChart
            ariaLabel={
              isBySource
                ? t`People by source, active people darker`
                : t`People by track, active people darker`
            }
            rows={peopleRows.rows}
            dividedRows={peopleRows.dividedRows}
            dividerLabel={t`No value or not mapped`}
          />
        </AnalyticsChartCard>
        <AnalyticsChartCard
          title={
            isBySource
              ? t`Which source converts best?`
              : t`Which track converts best?`
          }
          note={t`Overall conversion across all applications since tracking started. A lighter bar is a small sample or still in progress, and a dash means not enough data.`}
          isEmpty={
            rateRows.rows.length === 0 && rateRows.dividedRows.length === 0
          }
        >
          <AnalyticsHorizontalBarChart
            ariaLabel={
              isBySource
                ? t`Overall conversion by source`
                : t`Overall conversion by track`
            }
            rows={rateRows.rows}
            dividedRows={rateRows.dividedRows}
            dividerLabel={t`No value or not mapped`}
            formatValue={formatRate}
          />
        </AnalyticsChartCard>
        <AnalyticsChartCard
          title={t`What moved this period?`}
          note={t`Moves into and out of each stage in this period, by the date they happened.`}
          isEmpty={report.movement.length === 0}
          numbers={<AnalyticsMovementTable rows={report.movement} />}
        >
          <AnalyticsDivergingBarChart
            ariaLabel={t`People entering and leaving each stage this period`}
            rows={report.movement.map((row) => ({
              key: row.stageKey,
              label: row.label,
              rightValue: row.enteredInPeriod,
              leftValue: row.leftInPeriod,
            }))}
            rightLabel={t`Entered`}
            leftLabel={t`Left`}
          />
        </AnalyticsChartCard>
        <AnalyticsChartCard
          title={t`Who is past their stage limit?`}
          note={t`Active people, as of when this report was made.`}
          isEmpty={!report.stuckByStage.some((row) => row.count > 0)}
          emptyMessage={t`No one is past their stage limit.`}
          numbers={<AnalyticsReportPastLimitTable rows={report.stuckByStage} />}
        >
          <AnalyticsHorizontalBarChart
            ariaLabel={t`People past their stage limit, by stage`}
            rows={report.stuckByStage.map((row) => ({
              key: row.stageKey,
              label: row.label,
              segments: [
                {
                  key: 'past-limit',
                  label: t`Past stage limit`,
                  value: row.count,
                  color: ANALYTICS_CHART_COLOR.warning,
                },
              ],
            }))}
          />
        </AnalyticsChartCard>
        {report.cohorts.length > 0 && (
          <AnalyticsChartCard
            title={t`Are newer groups converting better?`}
            note={t`People grouped by the month they applied, up to the end of this period. A striped cell is still in progress, a lighter one is a small sample, and a dash means not enough data.`}
            isFullWidth
            numbers={
              <AnalyticsCohortTable
                rows={report.cohorts}
                stages={report.funnel.rows}
                period="MONTH"
                minimumSample={report.minimumSample}
              />
            }
          >
            <AnalyticsHeatmap
              ariaLabel={t`Conversion at each step for people grouped by the month they applied`}
              columns={cohortHeatmap.columns}
              rows={cohortHeatmap.rows}
              rowHeaderLabel={t`People who applied in`}
            />
          </AnalyticsChartCard>
        )}
        {buildAnalyticsReportTrendCharts(report, formatNumber).map((chart) => (
          <AnalyticsChartCard
            key={chart.key}
            title={chart.title}
            note={chart.note}
            isEmpty={isDefined(chart.unavailableMessage)}
            emptyMessage={chart.unavailableMessage ?? undefined}
          >
            <AnalyticsLineChart
              ariaLabel={chart.title}
              buckets={chart.buckets}
              series={[
                {
                  key: chart.key,
                  label: chart.seriesLabel,
                  values: chart.values,
                  color: ANALYTICS_CHART_COLOR.accent,
                  ...chart.sample,
                },
              ]}
              previousValues={chart.previousValues}
              formatValue={chart.formatValue}
              isRate={chart.isRate}
            />
          </AnalyticsChartCard>
        ))}
        <AnalyticsChartCard
          title={t`Compared with the previous period`}
          note={
            canCompare
              ? t`Counts inside each period, by the date they happened. A row is marked when the change is significant and both counts are at least ${minimumSample}.`
              : undefined
          }
          isFullWidth
          isEmpty={!canCompare}
          emptyMessage={getNoEarlierPeriodText()}
        >
          <AnalyticsReportComparisonsTable
            comparisons={report.comparisons}
            movement={report.movement}
          />
        </AnalyticsChartCard>
      </AnalyticsChartGrid>
    </StyledReport>
  );
};
