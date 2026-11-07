import { t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';

import { AnalyticsPdfColumns } from '@/crm-analytics/report-pdf/charts/AnalyticsPdfColumns';
import { AnalyticsPdfFunnel } from '@/crm-analytics/report-pdf/charts/AnalyticsPdfFunnel';
import {
  AnalyticsPdfHorizontalBars,
  type AnalyticsPdfBarRow,
} from '@/crm-analytics/report-pdf/charts/AnalyticsPdfHorizontalBars';
import { AnalyticsPdfLegend } from '@/crm-analytics/report-pdf/charts/AnalyticsPdfLegend';
import {
  AnalyticsPdfStackedBars,
  type AnalyticsPdfStackedRow,
} from '@/crm-analytics/report-pdf/charts/AnalyticsPdfStackedBars';
import { AnalyticsPdfChartBlock } from '@/crm-analytics/report-pdf/components/AnalyticsPdfChartBlock';
import { AnalyticsPdfNoData } from '@/crm-analytics/report-pdf/components/AnalyticsPdfNoData';
import { AnalyticsPdfSection } from '@/crm-analytics/report-pdf/components/AnalyticsPdfSection';
import { ANALYTICS_PDF_COLOR } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfColor';
import { ANALYTICS_PDF_PAGE_LAYOUT } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfPageLayout';
import { ANALYTICS_PDF_UNKNOWN_VALUE } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfUnknownValue';
import { type AnalyticsPdfRate } from '@/crm-analytics/report-pdf/types/AnalyticsPdfRate';
import { describeAnalyticsPdfRate } from '@/crm-analytics/report-pdf/utils/describeAnalyticsPdfRate';
import {
  formatAnalyticsPdfDays,
  formatAnalyticsPdfNumber,
  formatAnalyticsPdfOfPeople,
  formatAnalyticsPdfStays,
} from '@/crm-analytics/report-pdf/utils/formatAnalyticsPdfNumber';
import { getAnalyticsPdfRowLabelLayout } from '@/crm-analytics/report-pdf/utils/getAnalyticsPdfRowLabelLayout';
import {
  type AnalyticsFunnelRow,
  type AnalyticsReport,
} from '@/crm-analytics/types/AnalyticsApi';
import { buildFunnelTakeaway } from '@/crm-analytics/utils/buildFunnelTakeaway';

const WIDTH = ANALYTICS_PDF_PAGE_LAYOUT.contentWidth;
const STACKED_ROW_HEIGHT = 14.5;
const BAR_ROW_HEIGHT = 13.5;
// Above this many steps, a column's label no longer fits under it.
const MAXIMUM_COLUMN_CHART_STEPS = 12;

const buildStackedRow = (
  row: AnalyticsFunnelRow,
  minimumSample: number,
): AnalyticsPdfStackedRow => ({
  key: row.stageKey,
  label: row.label,
  total: row.entered,
  totalText:
    row.entered > 0
      ? formatAnalyticsPdfOfPeople(row.entered)
      : ANALYTICS_PDF_UNKNOWN_VALUE,
  isLighter: row.entered < minimumSample,
  segments: [
    {
      key: 'MOVED_ON',
      value: row.reachedNext,
      fill: ANALYTICS_PDF_COLOR.accent,
      textColor: ANALYTICS_PDF_COLOR.onDark,
    },
    {
      key: 'STALLED',
      value: row.timedOut,
      fill: ANALYTICS_PDF_COLOR.stalled,
      textColor: ANALYTICS_PDF_COLOR.onLight,
    },
    {
      key: 'LEFT',
      value: row.exited,
      fill: ANALYTICS_PDF_COLOR.left,
      textColor: ANALYTICS_PDF_COLOR.onDark,
    },
    {
      key: 'IN_PROGRESS',
      value: row.inWindow,
      fill: ANALYTICS_PDF_COLOR.neutralSoft,
      textColor: ANALYTICS_PDF_COLOR.ink,
    },
  ],
});

const buildDurationRow = (
  row: AnalyticsFunnelRow,
  minimumSample: number,
): AnalyticsPdfBarRow => {
  const isSmallSample = row.completedStays < minimumSample;
  const stays = formatAnalyticsPdfStays(row.completedStays);

  return {
    key: row.stageKey,
    label: row.label,
    value: row.medianDays,
    valueText: isDefined(row.medianDays)
      ? formatAnalyticsPdfDays(row.medianDays)
      : ANALYTICS_PDF_UNKNOWN_VALUE,
    detailText:
      isDefined(row.medianDays) && isSmallSample ? t`from ${stays}` : null,
    tone: isSmallSample ? 'LIGHTER' : 'ACCENT',
  };
};

const buildStepRateBarRow = (
  row: AnalyticsFunnelRow,
  rate: AnalyticsPdfRate,
  lowestStepStageKey: string | null,
): AnalyticsPdfBarRow => ({
  key: row.stageKey,
  label: row.label,
  value: rate.ratio,
  valueText: rate.text,
  detailText: rate.detail,
  tone: row.stageKey === lowestStepStageKey ? 'ACCENT' : 'NEUTRAL',
});

type AnalyticsPdfFunnelSectionProps = {
  report: AnalyticsReport;
};

export const AnalyticsPdfFunnelSection = ({
  report,
}: AnalyticsPdfFunnelSectionProps) => {
  const { funnel, minimumSample } = report;
  const hasData = funnel.rows.some(({ entered }) => entered > 0);

  if (!hasData) {
    return (
      <AnalyticsPdfSection
        name={t`Funnel`}
        question={t`Where do we lose people?`}
        startsNewPage={false}
        isCompact
      >
        <AnalyticsPdfNoData
          line={t`No one has entered the funnel since tracking started.`}
        />
      </AnalyticsPdfSection>
    );
  }

  const stepRows = funnel.rows.slice(0, -1);
  const firstLabel = funnel.rows[0].label;
  const lastLabel = funnel.rows[funnel.rows.length - 1].label;
  const describeStepRate = (row: AnalyticsFunnelRow) =>
    describeAnalyticsPdfRate({
      rate: row.stepRate,
      soFarRate: row.soFarRate,
      sampleSize: row.eligible,
      minimumSample,
    });
  const stepLabels = stepRows.map(({ label }) => label);
  const stackedLayout = getAnalyticsPdfRowLabelLayout(
    stepLabels,
    STACKED_ROW_HEIGHT,
  );
  const barLayout = getAnalyticsPdfRowLabelLayout(stepLabels, BAR_ROW_HEIGHT);
  const hasKnownStepRate = stepRows.some((row) =>
    isDefined(describeStepRate(row).ratio),
  );
  const hasKnownDuration = stepRows.some(({ medianDays }) =>
    isDefined(medianDays),
  );
  const hasPeopleInSteps = stepRows.some(({ entered }) => entered > 0);
  const conversionTitle = t`Conversion at each step`;
  const conversionNote = t`Share of people who moved on within the step's window, all applications since tracking start. The lowest step is in color.`;
  const stackedTitle = t`What happened to people at each stage?`;
  const durationTitle = t`How long do people stay?`;

  return (
    <AnalyticsPdfSection
      name={t`Funnel`}
      question={t`Where do we lose people?`}
      takeaway={buildFunnelTakeaway({
        funnel,
        formatNumber: formatAnalyticsPdfNumber,
      })}
      startsNewPage
    >
      <AnalyticsPdfChartBlock
        title={t`From ${firstLabel} to ${lastLabel}`}
        note={t`People, all applications since tracking start. The percent moved on counts only people past that step's window.`}
      >
        <AnalyticsPdfFunnel
          rows={funnel.rows.map((row, rowIndex) => ({
            key: row.stageKey,
            label: row.label,
            count: row.entered,
            countText: formatAnalyticsPdfNumber(row.entered),
            stepRate:
              rowIndex < funnel.rows.length - 1 ? describeStepRate(row) : null,
            isLowestStep: row.stageKey === funnel.lowestStepStageKey,
          }))}
          width={WIDTH}
          barHeight={18}
          connectorHeight={10}
        />
      </AnalyticsPdfChartBlock>
      {stepRows.length > 0 && (
        <>
          {!hasKnownStepRate && (
            <AnalyticsPdfNoData
              title={conversionTitle}
              line={t`Conversion appears once people have had a step's full window.`}
            />
          )}
          {hasKnownStepRate && (
            <AnalyticsPdfChartBlock
              title={conversionTitle}
              note={conversionNote}
            >
              {stepRows.length > MAXIMUM_COLUMN_CHART_STEPS ? (
                <AnalyticsPdfHorizontalBars
                  rows={stepRows.map((row) =>
                    buildStepRateBarRow(
                      row,
                      describeStepRate(row),
                      funnel.lowestStepStageKey,
                    ),
                  )}
                  width={WIDTH}
                  labelWidth={barLayout.labelWidth}
                  rowHeight={barLayout.rowHeight}
                  maximumValue={1}
                />
              ) : (
                <AnalyticsPdfColumns
                  columns={stepRows.map((row) => ({
                    key: row.stageKey,
                    label: row.label,
                    rate: describeStepRate(row),
                    isHighlighted: row.stageKey === funnel.lowestStepStageKey,
                  }))}
                  width={WIDTH}
                  plotHeight={56}
                />
              )}
            </AnalyticsPdfChartBlock>
          )}
          {!hasPeopleInSteps && (
            <AnalyticsPdfNoData
              title={stackedTitle}
              line={t`No one has reached a stage with a next step yet.`}
            />
          )}
          {hasPeopleInSteps && (
            <AnalyticsPdfChartBlock
              title={stackedTitle}
              note={t`Share of the people who reached each stage, all applications since tracking start.`}
              legend={
                <AnalyticsPdfLegend
                  items={[
                    {
                      key: 'MOVED_ON',
                      label: t`Moved on`,
                      color: ANALYTICS_PDF_COLOR.accent,
                    },
                    {
                      key: 'STALLED',
                      label: t`Stalled`,
                      color: ANALYTICS_PDF_COLOR.stalled,
                    },
                    {
                      key: 'LEFT',
                      label: t`Left`,
                      color: ANALYTICS_PDF_COLOR.left,
                    },
                    {
                      key: 'IN_PROGRESS',
                      label: t`Still in progress`,
                      color: ANALYTICS_PDF_COLOR.neutralSoft,
                    },
                  ]}
                />
              }
            >
              <AnalyticsPdfStackedBars
                rows={stepRows.map((row) =>
                  buildStackedRow(row, minimumSample),
                )}
                width={WIDTH}
                labelWidth={stackedLayout.labelWidth}
                rowHeight={stackedLayout.rowHeight}
                barHeight={12}
                totalWidth={66}
              />
            </AnalyticsPdfChartBlock>
          )}
          {!hasKnownDuration && (
            <AnalyticsPdfNoData
              title={durationTitle}
              line={t`Time in stage appears once people have completed a stay.`}
            />
          )}
          {hasKnownDuration && (
            <AnalyticsPdfChartBlock
              title={durationTitle}
              note={t`Median days in each stage, from completed stays, all applications since tracking start.`}
            >
              <AnalyticsPdfHorizontalBars
                rows={stepRows.map((row) =>
                  buildDurationRow(row, minimumSample),
                )}
                width={WIDTH}
                labelWidth={barLayout.labelWidth}
                rowHeight={barLayout.rowHeight}
              />
            </AnalyticsPdfChartBlock>
          )}
        </>
      )}
    </AnalyticsPdfSection>
  );
};
