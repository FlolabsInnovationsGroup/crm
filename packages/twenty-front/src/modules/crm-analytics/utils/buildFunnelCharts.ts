import { plural, t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';

import { ANALYTICS_CHART_COLOR } from '@/crm-analytics/charts/AnalyticsChartColor';
import { type AnalyticsChartTooltipRow } from '@/crm-analytics/charts/AnalyticsChartTooltip';
import { type AnalyticsColumn } from '@/crm-analytics/charts/AnalyticsColumnChart';
import { type AnalyticsFunnelStep } from '@/crm-analytics/charts/AnalyticsFunnelChart';
import { type AnalyticsHorizontalBarRow } from '@/crm-analytics/charts/AnalyticsHorizontalBarChart';
import {
  type AnalyticsFunnel,
  type AnalyticsFunnelRow,
  type AnalyticsStageDefinition,
} from '@/crm-analytics/types/AnalyticsApi';
import {
  type AnalyticsRateDescription,
  describeAnalyticsRate,
} from '@/crm-analytics/utils/describeAnalyticsRate';
import { formatAnalyticsPeopleCount } from '@/crm-analytics/utils/formatAnalyticsPeopleCount';

type FormatNumber = (value: number, options?: { decimals?: number }) => string;

// The last stage has no next step, so its step numbers would report on nothing.
const getStepRows = (rows: AnalyticsFunnelRow[]) => rows.slice(0, -1);

const describeStepRate = (row: AnalyticsFunnelRow) =>
  describeAnalyticsRate({
    rate: row.stepRate,
    soFarRate: row.soFarRate,
    eligible: row.eligible,
    isUnderMinimum: row.isUnderMinimum,
  });

const isLighterRate = ({
  isSmallSample,
  isInProgress,
}: AnalyticsRateDescription) => isSmallSample || isInProgress;

const getStepNote = ({
  isSmallSample,
  isInProgress,
}: AnalyticsRateDescription) => {
  if (isSmallSample) {
    return t`A small group, so read this with care.`;
  }

  return isInProgress ? t`No one has passed this stage's window yet.` : null;
};

const buildStepTooltip = (
  row: AnalyticsFunnelRow,
  nextRow: AnalyticsFunnelRow,
  rate: AnalyticsRateDescription,
  formatNumber: FormatNumber,
) => {
  const fromLabel = row.label;
  const toLabel = nextRow.label;
  const reachedNext = formatNumber(row.reachedNext);
  const people = formatAnalyticsPeopleCount(row.eligible, formatNumber);

  const rows: AnalyticsChartTooltipRow[] = [
    { label: t`Moving on`, value: rate.label ?? t`Not enough data` },
    ...(isDefined(rate.value) && !rate.isInProgress
      ? [{ label: t`Moved on`, value: t`${reachedNext} of ${people}` }]
      : []),
    ...(row.inWindow > 0
      ? [{ label: t`Still in progress`, value: formatNumber(row.inWindow) }]
      : []),
  ];

  return {
    title: t`${fromLabel} to ${toLabel}`,
    rows,
    note: getStepNote(rate),
  };
};

type BuildFunnelChartArgs = {
  funnel: AnalyticsFunnel;
  formatNumber: FormatNumber;
};

export const buildFunnelChartSteps = ({
  funnel: { rows },
  formatNumber,
}: BuildFunnelChartArgs): AnalyticsFunnelStep[] =>
  rows.map((row, index) => {
    const rate = describeStepRate(row);
    const nextRow = rows[index + 1];

    return {
      key: row.stageKey,
      label: row.label,
      count: row.entered,
      moveOnLabel: rate.label,
      isMoveOnMuted: isLighterRate(rate),
      tooltip: {
        title: row.label,
        rows: [
          { label: t`Reached this stage`, value: formatNumber(row.entered) },
        ],
      },
      moveOnTooltip: isDefined(nextRow)
        ? buildStepTooltip(row, nextRow, rate, formatNumber)
        : undefined,
    };
  });

export const buildStepConversionColumns = ({
  funnel: { rows },
  formatNumber,
}: BuildFunnelChartArgs): AnalyticsColumn[] =>
  getStepRows(rows).map((row, index) => {
    const rate = describeStepRate(row);

    return {
      key: row.stageKey,
      label: row.label,
      segments: isDefined(rate.value)
        ? [{ key: 'moveOn', label: t`Moving on`, value: rate.value }]
        : [],
      valueLabel: rate.label ?? undefined,
      isSmallSample: isLighterRate(rate),
      tooltip: buildStepTooltip(row, rows[index + 1], rate, formatNumber),
    };
  });

export const hasAnyStepConversion = ({ rows }: AnalyticsFunnel) =>
  getStepRows(rows).some((row) => isDefined(describeStepRate(row).value));

export const buildStageOutcomeRows = ({
  rows,
  minimumSample,
}: AnalyticsFunnel): AnalyticsHorizontalBarRow[] =>
  getStepRows(rows).map((row) => ({
    key: row.stageKey,
    label: row.label,
    isSmallSample: row.entered < minimumSample,
    segments:
      row.entered > 0
        ? [
            {
              key: 'movedOn',
              label: t`Moved on`,
              value: row.reachedNext,
              color: ANALYTICS_CHART_COLOR.accent,
            },
            {
              key: 'stalled',
              label: t`Stalled`,
              value: row.timedOut,
              color: ANALYTICS_CHART_COLOR.warning,
            },
            {
              key: 'left',
              label: t`Left`,
              value: row.exited,
              color: ANALYTICS_CHART_COLOR.neutralStrong,
            },
            {
              key: 'stillInProgress',
              label: t`Still in progress`,
              value: row.inWindow,
              color: ANALYTICS_CHART_COLOR.neutralSoft,
            },
          ]
        : [],
  }));

type BuildStageDurationRowsArgs = BuildFunnelChartArgs & {
  stages: Pick<AnalyticsStageDefinition, 'stageKey' | 'limitDays'>[];
};

export const buildStageDurationRows = ({
  funnel: { rows, minimumSample },
  stages,
  formatNumber,
}: BuildStageDurationRowsArgs): AnalyticsHorizontalBarRow[] =>
  getStepRows(rows).map((row) => {
    const limitDays = stages.find(
      ({ stageKey }) => stageKey === row.stageKey,
    )?.limitDays;
    const isSmallSample = row.completedStays < minimumSample;
    const days = isDefined(row.medianDays)
      ? formatNumber(row.medianDays, { decimals: 1 })
      : null;
    // On the printed value, since 1.04 prints as 1.
    const daysLabel = isDefined(row.medianDays)
      ? plural(Math.round(row.medianDays * 10) / 10, {
          one: `${days} day`,
          other: `${days} days`,
        })
      : undefined;

    const getNote = () => {
      if (!isDefined(days)) {
        return t`Not enough finished stays yet.`;
      }

      return isSmallSample ? t`A small group, so read this with care.` : null;
    };

    return {
      key: row.stageKey,
      label: row.label,
      segments: isDefined(row.medianDays)
        ? [{ key: 'median', label: t`Median days`, value: row.medianDays }]
        : [],
      valueLabel: daysLabel,
      tickValue: limitDays,
      isSmallSample,
      tooltip: {
        title: row.label,
        rows: [
          ...(isDefined(days) ? [{ label: t`Median days`, value: days }] : []),
          ...(row.completedStays > 0
            ? [
                {
                  label: t`Finished stays`,
                  value: formatNumber(row.completedStays),
                },
              ]
            : []),
          ...(isDefined(limitDays)
            ? [
                {
                  label: t`Stage limit`,
                  value: plural(limitDays, {
                    one: `${limitDays} day`,
                    other: `${limitDays} days`,
                  }),
                },
              ]
            : []),
        ],
        note: getNote(),
      },
    };
  });

export const hasAnyStageDuration = ({ rows }: AnalyticsFunnel) =>
  getStepRows(rows).some((row) => isDefined(row.medianDays));
