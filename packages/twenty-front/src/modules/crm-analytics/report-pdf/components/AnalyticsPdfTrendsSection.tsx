import { i18n } from '@lingui/core';
import { plural, t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';

import { AnalyticsPdfDivergingBars } from '@/crm-analytics/report-pdf/charts/AnalyticsPdfDivergingBars';
import { AnalyticsPdfHorizontalBars } from '@/crm-analytics/report-pdf/charts/AnalyticsPdfHorizontalBars';
import { AnalyticsPdfLegend } from '@/crm-analytics/report-pdf/charts/AnalyticsPdfLegend';
import {
  AnalyticsPdfLine,
  type AnalyticsPdfLineChartPoint,
} from '@/crm-analytics/report-pdf/charts/AnalyticsPdfLine';
import {
  AnalyticsPdfChartBlock,
  AnalyticsPdfChartPair,
} from '@/crm-analytics/report-pdf/components/AnalyticsPdfChartBlock';
import { AnalyticsPdfHeatmapBlocks } from '@/crm-analytics/report-pdf/components/AnalyticsPdfHeatmapBlocks';
import { AnalyticsPdfNoData } from '@/crm-analytics/report-pdf/components/AnalyticsPdfNoData';
import { AnalyticsPdfSection } from '@/crm-analytics/report-pdf/components/AnalyticsPdfSection';
import { ANALYTICS_PDF_COLOR } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfColor';
import { ANALYTICS_PDF_LINE_DASH } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfLineDash';
import { ANALYTICS_PDF_PAGE_LAYOUT } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfPageLayout';
import { describeAnalyticsPdfRate } from '@/crm-analytics/report-pdf/utils/describeAnalyticsPdfRate';
import { findAnalyticsPdfTrendSeries } from '@/crm-analytics/report-pdf/utils/findAnalyticsPdfTrendSeries';
import {
  formatAnalyticsPdfNumber,
  formatAnalyticsPdfPeople,
} from '@/crm-analytics/report-pdf/utils/formatAnalyticsPdfNumber';
import { getAnalyticsPdfRowLabelLayout } from '@/crm-analytics/report-pdf/utils/getAnalyticsPdfRowLabelLayout';
import {
  type AnalyticsReport,
  type AnalyticsSeries,
  type AnalyticsTrendMetric,
} from '@/crm-analytics/types/AnalyticsApi';
import { formatAnalyticsBucketLabel } from '@/crm-analytics/utils/formatAnalyticsBucketLabel';
import { formatAnalyticsRate } from '@/crm-analytics/utils/formatAnalyticsRate';
import { toAnalyticsLocalDate } from '@/crm-analytics/utils/toAnalyticsLocalDate';

const WIDTH = ANALYTICS_PDF_PAGE_LAYOUT.contentWidth;
const HALF_WIDTH = ANALYTICS_PDF_PAGE_LAYOUT.halfWidth;
const MOVED_ROW_HEIGHT = 13.5;
const STUCK_ROW_HEIGHT = 14;
const TREND_LINE_HEIGHT = 92;
const HALF_NOTE_HEIGHT = 33;

const TREND_METRICS: AnalyticsTrendMetric[] = [
  'NEW_APPLICATIONS',
  'OVERALL_CONVERSION',
  'DROP_OFF',
];

const formatLineRate = (value: number) =>
  formatAnalyticsRate(value) ?? formatAnalyticsPdfNumber(value);

// Axis steps can land on 2.5%, which the rate format would round to 3%.
const formatLineRateTick = (value: number) =>
  `${formatAnalyticsPdfNumber(Math.round(value * 1000) / 10)}%`;

const getUnavailableLine = (
  reason: AnalyticsSeries['unavailableReason'],
): string => {
  switch (reason) {
    case 'DAILY_RATE':
      return t`Rates cannot be drawn by day.`;
    case 'NO_SUBMISSION_OBJECT':
      return t`Form submissions are not available, so there is nothing to count.`;
    case 'SNAPSHOT_FILTER_COMBINATION':
      return t`Daily snapshots do not cover this combination.`;
    default:
      return t`Not enough data to draw this line yet.`;
  }
};

const buildLinePoints = (
  series: AnalyticsSeries,
  report: AnalyticsReport,
  isRate: boolean,
): AnalyticsPdfLineChartPoint[] => {
  const period = report.periodType === 'MONTH' ? 'MONTH' : 'WEEK';

  return series.points.map(({ bucketStart, value, previousValue, size }) => {
    const isLighter = isRate && isDefined(size) && size < report.minimumSample;
    const formattedSize = isDefined(size) ? formatAnalyticsPdfNumber(size) : '';

    return {
      key: bucketStart,
      label: formatAnalyticsBucketLabel({
        bucketStart,
        period,
        isCompact: true,
      }),
      value,
      previousValue,
      isLighter,
      shortDetail: isLighter ? t`of ${formattedSize}` : null,
    };
  });
};

// The legend names what is drawn, because a report's own period is just one point on these lines.
const buildLineLegendLabels = (
  pointCount: number,
  periodType: AnalyticsReport['periodType'],
) => {
  const count = formatAnalyticsPdfNumber(pointCount);

  return periodType === 'MONTH'
    ? {
        current: plural(pointCount, {
          one: 'Last month',
          other: `Last ${count} months`,
        }),
        previous: plural(pointCount, {
          one: 'The month before',
          other: `The ${count} months before`,
        }),
      }
    : {
        current: plural(pointCount, {
          one: 'Last week',
          other: `Last ${count} weeks`,
        }),
        previous: plural(pointCount, {
          one: 'The week before',
          other: `The ${count} weeks before`,
        }),
      };
};

type AnalyticsPdfTrendLineProps = {
  report: AnalyticsReport;
  metric: AnalyticsTrendMetric;
  title: string;
  note: string;
  isRate: boolean;
  width: number;
  noteMinimumHeight?: number;
  isInPair?: boolean;
  hasArea?: boolean;
};

const AnalyticsPdfTrendLine = ({
  report,
  metric,
  title,
  note,
  isRate,
  width,
  noteMinimumHeight,
  isInPair = false,
  hasArea = false,
}: AnalyticsPdfTrendLineProps) => {
  const series = findAnalyticsPdfTrendSeries(report, metric);

  if (
    !isDefined(series) ||
    isDefined(series.unavailableReason) ||
    !series.points.some(({ value }) => isDefined(value))
  ) {
    return (
      <AnalyticsPdfNoData
        title={title}
        line={getUnavailableLine(series?.unavailableReason ?? null)}
        width={width}
        isInPair={isInPair}
      />
    );
  }

  const linePoints = buildLinePoints(series, report, isRate);
  const legendLabels = buildLineLegendLabels(
    linePoints.length,
    report.periodType,
  );
  const hasPreviousLine = linePoints.some(({ previousValue }) =>
    isDefined(previousValue),
  );
  const hasSmallGroups = linePoints.some(
    ({ value, isLighter }) => isDefined(value) && isLighter,
  );

  return (
    <AnalyticsPdfChartBlock
      title={title}
      note={
        hasPreviousLine
          ? `${note} ${t`Dashed is the window before, moved forward to compare.`}`
          : note
      }
      width={width}
      noteMinimumHeight={noteMinimumHeight}
      isInPair={isInPair}
      legend={
        <AnalyticsPdfLegend
          items={[
            {
              key: 'CURRENT',
              label: legendLabels.current,
              color: ANALYTICS_PDF_COLOR.accent,
              isLine: true,
            },
            ...(hasPreviousLine
              ? [
                  {
                    key: 'PREVIOUS',
                    label: legendLabels.previous,
                    color: ANALYTICS_PDF_COLOR.neutral,
                    isLine: true,
                    lineDash: ANALYTICS_PDF_LINE_DASH.previous,
                  },
                ]
              : []),
            ...(hasSmallGroups
              ? [
                  {
                    key: 'SMALL_GROUP',
                    label: t`Small group`,
                    color: ANALYTICS_PDF_COLOR.accent,
                    isLine: true,
                    lineDash: ANALYTICS_PDF_LINE_DASH.smallGroup,
                  },
                ]
              : []),
          ]}
        />
      }
    >
      <AnalyticsPdfLine
        points={linePoints}
        width={width}
        height={TREND_LINE_HEIGHT}
        formatValue={isRate ? formatLineRate : formatAnalyticsPdfNumber}
        formatTick={isRate ? formatLineRateTick : formatAnalyticsPdfNumber}
        hasOnlyWholeValues={!isRate}
        isRate={isRate}
        hasArea={hasArea}
      />
    </AnalyticsPdfChartBlock>
  );
};

type AnalyticsPdfTrendsSectionProps = {
  report: AnalyticsReport;
};

export const AnalyticsPdfTrendsSection = ({
  report,
}: AnalyticsPdfTrendsSectionProps) => {
  const { funnel, minimumSample, cohorts, stuckByStage, movement } = report;
  const hasTrendSeries = TREND_METRICS.some((metric) =>
    isDefined(findAnalyticsPdfTrendSeries(report, metric)),
  );
  const movedRows = movement.filter(
    ({ enteredInPeriod, leftInPeriod }) =>
      enteredInPeriod > 0 || leftInPeriod > 0,
  );
  const stuckRows = stuckByStage.filter(({ count }) => count > 0);
  const hasAnyChart =
    hasTrendSeries ||
    movedRows.length > 0 ||
    stuckRows.length > 0 ||
    cohorts.length > 0;
  const finalLabel =
    funnel.rows.find(
      ({ stageKey }) => stageKey === funnel.overall.finalStageKey,
    )?.label ?? funnel.rows[funnel.rows.length - 1]?.label;
  const windowDays = funnel.overall.windowDays;
  const stepStages = funnel.rows.slice(0, -1);
  const dropOffRow = funnel.rows.find(
    ({ stageKey }) =>
      stageKey === findAnalyticsPdfTrendSeries(report, 'DROP_OFF')?.stageKey,
  );
  const dropOffLabel = dropOffRow?.label;
  const dropOffWindowDays = dropOffRow?.windowDays;
  const movedLayout = getAnalyticsPdfRowLabelLayout(
    movedRows.map(({ label }) => label),
    MOVED_ROW_HEIGHT,
  );
  const stuckLayout = getAnalyticsPdfRowLabelLayout(
    stuckRows.map(({ label }) => label),
    STUCK_ROW_HEIGHT,
  );
  // A short last page of programs is not left half empty, and the shortest chart then goes first to use that page up.
  const flowsAfterPrograms = report.periodType === 'MONTH';
  const movedBlock =
    movedRows.length > 0 ? (
      <AnalyticsPdfChartBlock
        title={t`What moved this period?`}
        note={t`Moves into and out of each stage in this period, by event date. In stage now is when this report was generated.`}
        legend={
          <AnalyticsPdfLegend
            items={[
              {
                key: 'LEFT',
                label: t`Left the stage`,
                color: ANALYTICS_PDF_COLOR.neutral,
              },
              {
                key: 'ENTERED',
                label: t`Entered the stage`,
                color: ANALYTICS_PDF_COLOR.accent,
              },
            ]}
          />
        }
      >
        <AnalyticsPdfDivergingBars
          rows={movedRows.map((row) => ({
            key: row.stageKey,
            label: row.label,
            leftValue: row.leftInPeriod,
            rightValue: row.enteredInPeriod,
            nowValue: row.countNow,
          }))}
          width={WIDTH}
          labelWidth={movedLayout.labelWidth}
          rowHeight={movedLayout.rowHeight}
        />
      </AnalyticsPdfChartBlock>
    ) : (
      <AnalyticsPdfNoData
        title={hasAnyChart ? t`What moved this period?` : undefined}
        line={t`No one moved between stages in this period.`}
      />
    );
  const cohortTitle = t`Are newer groups converting better?`;
  const cohortBlock =
    cohorts.length > 0 && stepStages.length > 0 ? (
      <AnalyticsPdfHeatmapBlocks
        title={cohortTitle}
        continuedTitle={t`Newer groups, continued`}
        note={t`Share of each group who moved on, by application month, up to the end of this period. Overall is reaching ${finalLabel} within ${windowDays} days.`}
        noDataLine={t`These groups are too recent to show a rate.`}
        columns={[
          ...stepStages.map(({ stageKey, label }) => ({
            key: stageKey,
            label,
          })),
          { key: 'OVERALL', label: t`Overall`, isSeparated: true },
        ]}
        rows={cohorts.map((cohort) => ({
          key: cohort.bucketStart,
          label: i18n.date(toAnalyticsLocalDate(cohort.bucketStart), {
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC',
          }),
          detail: formatAnalyticsPdfPeople(cohort.size),
          cells: [
            ...stepStages.map(({ stageKey }) => {
              const cell = cohort.cells.find(
                (candidate) => candidate.stageKey === stageKey,
              );

              return describeAnalyticsPdfRate({
                rate: cell?.isMature === true ? cell.rate : null,
                soFarRate: cell?.soFarRate,
                sampleSize: isDefined(cell) ? cell.eligible : null,
                minimumSample,
              });
            }),
            describeAnalyticsPdfRate({
              rate: cohort.overallRate,
              soFarRate: cohort.overallSoFarRate,
              sampleSize: cohort.size,
              minimumSample,
            }),
          ],
        }))}
        labelWidth={92}
        rowHeight={24}
        cornerLabel={t`People who applied in`}
      />
    ) : (
      <AnalyticsPdfNoData
        title={hasAnyChart ? cohortTitle : undefined}
        line={
          report.periodType === 'MONTH'
            ? t`No group has applied yet.`
            : t`Groups by application month appear in monthly reports.`
        }
      />
    );
  const stuckBlock =
    stuckRows.length > 0 ? (
      <AnalyticsPdfChartBlock
        title={t`Where are people past their stage limit?`}
        note={t`Active people past the limit for their stage, when this report was generated.`}
      >
        <AnalyticsPdfHorizontalBars
          rows={stuckRows.map((row) => ({
            key: row.stageKey,
            label: row.label,
            value: row.count,
            valueText: formatAnalyticsPdfNumber(row.count),
            tone: 'ACCENT',
          }))}
          width={WIDTH}
          labelWidth={stuckLayout.labelWidth}
          rowHeight={stuckLayout.rowHeight}
        />
      </AnalyticsPdfChartBlock>
    ) : (
      <AnalyticsPdfNoData
        title={
          hasAnyChart ? t`Where are people past their stage limit?` : undefined
        }
        line={t`No one is past their stage limit.`}
      />
    );

  return (
    <AnalyticsPdfSection
      name={t`Trends`}
      question={t`What is changing?`}
      startsNewPage={hasAnyChart && !flowsAfterPrograms}
      isCompact={!hasAnyChart}
    >
      {!hasTrendSeries && (
        <AnalyticsPdfNoData
          line={t`Trend lines are not stored in this report, so new applications, overall conversion and drop-off over time are left out.`}
        />
      )}
      {hasTrendSeries && (
        <>
          <AnalyticsPdfTrendLine
            report={report}
            metric="NEW_APPLICATIONS"
            title={t`New applications over time`}
            note={t`Applications, by the date submitted.`}
            isRate={false}
            width={WIDTH}
            hasArea
          />
          <AnalyticsPdfChartPair>
            <AnalyticsPdfTrendLine
              report={report}
              metric="OVERALL_CONVERSION"
              title={t`Overall conversion over time`}
              note={t`Share reaching ${finalLabel} within ${windowDays} days, by application date. The line stops where people have not had ${windowDays} days yet.`}
              isRate
              width={HALF_WIDTH}
              noteMinimumHeight={HALF_NOTE_HEIGHT}
              isInPair
            />
            <AnalyticsPdfTrendLine
              report={report}
              metric="DROP_OFF"
              title={
                isDefined(dropOffLabel)
                  ? t`Drop-off from ${dropOffLabel} over time`
                  : t`Drop-off over time`
              }
              note={
                isDefined(dropOffLabel) && isDefined(dropOffWindowDays)
                  ? t`Share of people who did not move on from ${dropOffLabel} within ${dropOffWindowDays} days, by application date. The line stops where people have not had ${dropOffWindowDays} days yet.`
                  : t`Share of people who did not move on within the step's window, by application date. The line stops where people have not had the full window yet.`
              }
              isRate
              width={HALF_WIDTH}
              noteMinimumHeight={HALF_NOTE_HEIGHT}
              isInPair
            />
          </AnalyticsPdfChartPair>
        </>
      )}
      {flowsAfterPrograms && stuckBlock}
      {movedBlock}
      {cohortBlock}
      {!flowsAfterPrograms && stuckBlock}
    </AnalyticsPdfSection>
  );
};
