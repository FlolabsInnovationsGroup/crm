import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';
import { themeCssVariables } from 'twenty-ui/theme';

import { type AnalyticsChartBarSegment } from '@/crm-analytics/charts/AnalyticsChartBarSegment';
import { ANALYTICS_CHART_COLOR } from '@/crm-analytics/charts/AnalyticsChartColor';
import { AnalyticsChartLegend } from '@/crm-analytics/charts/AnalyticsChartLegend';
import { AnalyticsChartNoData } from '@/crm-analytics/charts/AnalyticsChartNoData';
import { type AnalyticsChartTooltipContent } from '@/crm-analytics/charts/AnalyticsChartTooltip';
import { AnalyticsChartUnknownValue } from '@/crm-analytics/charts/AnalyticsChartUnknownValue';
import { getAnalyticsNiceTicks } from '@/crm-analytics/charts/getAnalyticsNiceTicks';
import { useAnalyticsChartTooltip } from '@/crm-analytics/charts/useAnalyticsChartTooltip';
import { useAnalyticsChartWidth } from '@/crm-analytics/charts/useAnalyticsChartWidth';
import { useNumberFormat } from '@/localization/hooks/useNumberFormat';

const SMALL_SAMPLE_OPACITY = 0.45;
const AXIS_WIDTH_IN_PX = 44;
const X_LABEL_WIDTH_IN_PX = 64;
const VALUE_LABEL_WIDTH_IN_PX = 40;

export type AnalyticsColumn = {
  key: string;
  label: string;
  // One segment for a plain column, several for a stacked one. No segments means unknown: a dash and no column.
  segments: AnalyticsChartBarSegment[];
  valueLabel?: string;
  isSmallSample?: boolean;
  // Replaces the default tooltip, for example to add "of 14 people".
  tooltip?: AnalyticsChartTooltipContent;
};

const StyledRoot = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  min-width: 0;
`;

// The top margin holds the value above a column that reaches the top of the axis.
const StyledPlot = styled.div`
  border-bottom: 1px solid ${themeCssVariables.border.color.strong};
  box-sizing: border-box;
  margin-inline-start: ${AXIS_WIDTH_IN_PX}px;
  margin-top: ${themeCssVariables.spacing[5]};
  position: relative;
`;

const StyledGridline = styled.div`
  border-top: 1px solid ${themeCssVariables.border.color.medium};
  left: 0;
  position: absolute;
  right: 0;
`;

const StyledTickLabel = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
  font-variant-numeric: tabular-nums;
  padding-inline-end: 6px;
  position: absolute;
  right: 100%;
  top: 0;
  transform: translateY(-50%);
  white-space: nowrap;
`;

const StyledColumns = styled.div`
  align-items: flex-end;
  display: flex;
  height: 100%;
  position: relative;
`;

const StyledSlot = styled.div`
  align-items: center;
  border-radius: ${themeCssVariables.border.radius.sm};
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  height: 100%;
  justify-content: flex-end;
  min-width: 0;
  position: relative;

  &:hover {
    background: ${themeCssVariables.background.transparent.light};
  }
`;

const StyledColumn = styled.div`
  display: flex;
  flex-direction: column;
  max-width: 24px;
  min-height: 2px;
  position: relative;
  width: 72%;
`;

// Clips the segment minimums and gaps, so a short stack never draws past its true height.
const StyledColumnSegments = styled.div`
  display: flex;
  flex: 1 1 0;
  flex-direction: column-reverse;
  gap: 2px;
  min-height: 0;
  overflow: hidden;
`;

const StyledColumnSegment = styled.div`
  flex-basis: 0;
  min-height: 2px;

  &:last-child {
    border-start-end-radius: ${themeCssVariables.border.radius.sm};
    border-start-start-radius: ${themeCssVariables.border.radius.sm};
  }
`;

const StyledColumnValue = styled.div`
  align-items: center;
  bottom: 100%;
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex-direction: column;
  font-size: ${themeCssVariables.font.size.xs};
  font-variant-numeric: tabular-nums;
  left: 50%;
  padding-bottom: 2px;
  position: absolute;
  transform: translateX(-50%);
  white-space: nowrap;
`;

const StyledHighlightLabel = styled.span`
  color: ${themeCssVariables.font.color.primary};
  font-weight: ${themeCssVariables.font.weight.medium};
`;

const StyledUnknownColumn = styled.div`
  font-size: ${themeCssVariables.font.size.xs};
  padding-bottom: 2px;
`;

const StyledXLabels = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  display: flex;
  font-size: ${themeCssVariables.font.size.xs};
  margin-inline-start: ${AXIS_WIDTH_IN_PX}px;
`;

const StyledXLabel = styled.span`
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  display: -webkit-box;
  flex: 1 1 0;
  line-height: 1.2;
  min-width: 0;
  overflow: hidden;
  overflow-wrap: anywhere;
  padding: 0 1px;
  text-align: center;
`;

const StyledThinnedXLabels = styled(StyledXLabels)`
  height: 1.2em;
  position: relative;
`;

const StyledThinnedXLabel = styled.span`
  line-height: 1.2;
  position: absolute;
  transform: translateX(-50%);
  white-space: nowrap;
`;

const getColumnTotal = ({ segments }: AnalyticsColumn) =>
  segments.reduce((total, { value }) => total + value, 0);

type AnalyticsColumnChartProps = {
  // One line that says what the chart shows, for screen readers.
  ariaLabel: string;
  columns: AnalyticsColumn[];
  // This column takes the accent and the others go gray, unless their segments set a color.
  highlightedColumnKey?: string | null;
  highlightLabel?: string;
  // Height of the plot, not counting the labels under it.
  height?: number;
  // Top of the axis, such as 1 for a rate. Defaults to a clean value above the tallest column.
  maxValue?: number;
  formatValue?: (value: number) => string;
  // Dates can skip labels to fit. Other axes keep every name, because a column with none cannot be read.
  isTimeAxis?: boolean;
};

export const AnalyticsColumnChart = ({
  ariaLabel,
  columns,
  highlightedColumnKey,
  highlightLabel,
  height = 200,
  maxValue,
  formatValue,
  isTimeAxis = false,
}: AnalyticsColumnChartProps) => {
  const { formatNumber } = useNumberFormat();
  const { widthRef, width } = useAnalyticsChartWidth();
  const { tooltip, showTooltip, moveTooltip, hideTooltip } =
    useAnalyticsChartTooltip();

  if (columns.length === 0) {
    return <AnalyticsChartNoData />;
  }

  const formatColumnValue =
    formatValue ?? ((value: number) => formatNumber(value));

  const totals = columns.map(getColumnTotal);
  const niceTicks = getAnalyticsNiceTicks({
    maxValue: maxValue ?? Math.max(...totals),
    hasOnlyWholeValues: totals.every((total) => Number.isInteger(total)),
  });
  const axisTop = maxValue ?? niceTicks[niceTicks.length - 1];
  const ticks = niceTicks.filter((tick) => tick <= axisTop);

  const plotWidth = Math.max(width - AXIS_WIDTH_IN_PX, 1);
  const slotWidth = plotWidth / columns.length;
  const xLabelStride = isTimeAxis
    ? Math.ceil(X_LABEL_WIDTH_IN_PX / slotWidth)
    : 1;
  const hasValueLabels = slotWidth >= VALUE_LABEL_WIDTH_IN_PX;

  const legendItems = [
    ...new Map(
      columns
        .flatMap(({ segments }) => segments)
        .map(({ key, label, color }) => [
          key,
          { key, label, color: color ?? ANALYTICS_CHART_COLOR.accent },
        ]),
    ).values(),
  ];

  const getDefaultColor = (columnKey: string) =>
    isDefined(highlightedColumnKey) && columnKey !== highlightedColumnKey
      ? ANALYTICS_CHART_COLOR.neutral
      : ANALYTICS_CHART_COLOR.accent;

  const buildDefaultTooltip = (
    column: AnalyticsColumn,
  ): AnalyticsChartTooltipContent => ({
    title: column.label,
    rows: column.segments.map(({ label, value, color }) => ({
      label,
      value: formatColumnValue(value),
      color: color ?? getDefaultColor(column.key),
    })),
    note: column.segments.length === 0 ? t`Not enough data` : null,
  });

  return (
    <StyledRoot ref={widthRef} role="img" aria-label={ariaLabel}>
      {legendItems.length > 1 && <AnalyticsChartLegend items={legendItems} />}
      <StyledPlot style={{ height }}>
        {ticks.map((tick) => (
          <StyledGridline
            key={tick}
            style={{ bottom: `${(tick / axisTop) * 100}%` }}
          >
            <StyledTickLabel>{formatColumnValue(tick)}</StyledTickLabel>
          </StyledGridline>
        ))}
        <StyledColumns>
          {columns.map((column, index) => {
            const total = totals[index];
            const content = column.tooltip ?? buildDefaultTooltip(column);
            const isHighlighted = column.key === highlightedColumnKey;

            return (
              <StyledSlot
                key={column.key}
                onPointerEnter={(event) => showTooltip(content, event)}
                onPointerMove={moveTooltip}
                onPointerLeave={hideTooltip}
              >
                {column.segments.length === 0 ? (
                  <StyledUnknownColumn>
                    <AnalyticsChartUnknownValue />
                  </StyledUnknownColumn>
                ) : (
                  <StyledColumn
                    style={{
                      height: `${Math.min(total / axisTop, 1) * 100}%`,
                      opacity: column.isSmallSample
                        ? SMALL_SAMPLE_OPACITY
                        : undefined,
                    }}
                  >
                    {hasValueLabels && (
                      <StyledColumnValue>
                        {isHighlighted && isDefined(highlightLabel) && (
                          <StyledHighlightLabel>
                            {highlightLabel}
                          </StyledHighlightLabel>
                        )}
                        {column.valueLabel ?? formatColumnValue(total)}
                      </StyledColumnValue>
                    )}
                    <StyledColumnSegments>
                      {column.segments
                        .filter(({ value }) => value > 0)
                        .map(({ key, value, color }) => (
                          <StyledColumnSegment
                            key={key}
                            style={{
                              background: color ?? getDefaultColor(column.key),
                              flexGrow: value,
                            }}
                          />
                        ))}
                    </StyledColumnSegments>
                  </StyledColumn>
                )}
              </StyledSlot>
            );
          })}
        </StyledColumns>
      </StyledPlot>
      {xLabelStride > 1 ? (
        <StyledThinnedXLabels aria-hidden="true">
          {columns.map((column, index) =>
            index % xLabelStride === 0 ? (
              <StyledThinnedXLabel
                key={column.key}
                style={{ left: `${((index + 0.5) / columns.length) * 100}%` }}
              >
                {column.label}
              </StyledThinnedXLabel>
            ) : null,
          )}
        </StyledThinnedXLabels>
      ) : (
        <StyledXLabels aria-hidden="true">
          {columns.map((column) => (
            <StyledXLabel key={column.key}>{column.label}</StyledXLabel>
          ))}
        </StyledXLabels>
      )}
      {tooltip}
    </StyledRoot>
  );
};
