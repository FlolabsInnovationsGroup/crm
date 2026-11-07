import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';
import { themeCssVariables } from 'twenty-ui/theme';

import { activateAnalyticsChartMarkOnKey } from '@/crm-analytics/charts/activateAnalyticsChartMarkOnKey';
import { type AnalyticsChartBarSegment } from '@/crm-analytics/charts/AnalyticsChartBarSegment';
import { ANALYTICS_CHART_COLOR } from '@/crm-analytics/charts/AnalyticsChartColor';
import { AnalyticsChartLegend } from '@/crm-analytics/charts/AnalyticsChartLegend';
import { AnalyticsChartNoData } from '@/crm-analytics/charts/AnalyticsChartNoData';
import { type AnalyticsChartTooltipContent } from '@/crm-analytics/charts/AnalyticsChartTooltip';
import { AnalyticsChartUnknownValue } from '@/crm-analytics/charts/AnalyticsChartUnknownValue';
import { useAnalyticsChartTooltip } from '@/crm-analytics/charts/useAnalyticsChartTooltip';
import { formatAnalyticsRate } from '@/crm-analytics/utils/formatAnalyticsRate';
import { useNumberFormat } from '@/localization/hooks/useNumberFormat';

const SMALL_SAMPLE_OPACITY = 0.45;

export type AnalyticsHorizontalBarRow = {
  key: string;
  label: string;
  // One segment for a plain bar, several for a stacked one. No segments means unknown: no bar and a dash.
  segments: AnalyticsChartBarSegment[];
  // Text at the end of the row, such as "12% so far". Defaults to the formatted total.
  valueLabel?: string;
  // A mark on the same scale as the bar, such as a stage limit.
  tickValue?: number | null;
  tickLabel?: string;
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

const StyledRows = styled.div`
  column-gap: ${themeCssVariables.spacing[2]};
  display: grid;
  grid-template-columns: minmax(72px, 32%) minmax(0, 1fr) auto;
  row-gap: 2px;
`;

const StyledRow = styled.div<{ isClickable: boolean }>`
  align-items: center;
  border-radius: ${themeCssVariables.border.radius.sm};
  cursor: ${({ isClickable }) => (isClickable ? 'pointer' : 'default')};
  display: grid;
  font-size: ${themeCssVariables.font.size.sm};
  grid-column: 1 / -1;
  grid-template-columns: subgrid;
  min-height: 28px;
  padding: 2px ${themeCssVariables.spacing[1]};

  &:focus-visible {
    outline: 2px solid ${themeCssVariables.color.blue};
    outline-offset: -2px;
  }

  &:hover {
    background: ${themeCssVariables.background.transparent.light};
  }
`;

const StyledLabel = styled.span`
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  color: ${themeCssVariables.font.color.primary};
  display: -webkit-box;
  line-height: 1.2;
  min-width: 0;
  overflow: hidden;
  overflow-wrap: anywhere;
`;

const StyledBarArea = styled.div`
  height: 16px;
  min-width: 0;
  position: relative;
`;

const StyledBar = styled.div`
  display: flex;
  gap: 2px;
  height: 100%;
`;

const StyledSegment = styled.div`
  flex-basis: 0;
  min-width: 2px;

  &:last-child {
    border-end-end-radius: ${themeCssVariables.border.radius.sm};
    border-start-end-radius: ${themeCssVariables.border.radius.sm};
  }
`;

const StyledTick = styled.div`
  background: ${themeCssVariables.font.color.primary};
  bottom: -2px;
  box-shadow: 0 0 0 1px ${themeCssVariables.background.primary};
  position: absolute;
  top: -2px;
  transform: translateX(-1px);
  width: 2px;
`;

const StyledValue = styled.span`
  color: ${themeCssVariables.font.color.secondary};
  font-variant-numeric: tabular-nums;
  min-width: 4ch;
  text-align: end;
  white-space: nowrap;
`;

const StyledDivider = styled.div`
  border-top: 1px solid ${themeCssVariables.border.color.medium};
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
  grid-column: 1 / -1;
  margin-top: ${themeCssVariables.spacing[1]};
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[1]} 0;
`;

const getRowTotal = ({ segments }: AnalyticsHorizontalBarRow) =>
  segments.reduce((total, { value }) => total + value, 0);

type AnalyticsHorizontalBarChartProps = {
  // One line that says what the chart shows, for screen readers.
  ariaLabel: string;
  rows: AnalyticsHorizontalBarRow[];
  // Rows after a line, in gray unless their segments set a color, such as exit stages.
  dividedRows?: AnalyticsHorizontalBarRow[];
  dividerLabel?: string;
  // Every bar fills the width and shows the split of its own total.
  isPercentMode?: boolean;
  formatValue?: (value: number) => string;
  onRowClick?: (rowKey: string) => void;
};

export const AnalyticsHorizontalBarChart = ({
  ariaLabel,
  rows,
  dividedRows = [],
  dividerLabel,
  isPercentMode = false,
  formatValue,
  onRowClick,
}: AnalyticsHorizontalBarChartProps) => {
  const { formatNumber } = useNumberFormat();
  const { tooltip, showTooltip, showTooltipAtElement, moveTooltip, hideTooltip } =
    useAnalyticsChartTooltip();

  const allRows = [...rows, ...dividedRows];

  if (allRows.length === 0) {
    return <AnalyticsChartNoData />;
  }

  const formatRowValue = formatValue ?? ((value: number) => formatNumber(value));

  const largestValue = Math.max(
    ...allRows.map((row) => Math.max(getRowTotal(row), row.tickValue ?? 0)),
  );

  const toLegendEntries = (
    legendRows: AnalyticsHorizontalBarRow[],
    defaultColor: string,
  ) =>
    legendRows
      .flatMap(({ segments }) => segments)
      .map(
        ({ key, label, color }) =>
          [key, { key, label, color: color ?? defaultColor }] as const,
      );

  const legendItems = [
    ...new Map([
      ...toLegendEntries(rows, ANALYTICS_CHART_COLOR.accent),
      ...toLegendEntries(dividedRows, ANALYTICS_CHART_COLOR.neutralStrong),
    ]).values(),
  ];

  const buildDefaultTooltip = (
    row: AnalyticsHorizontalBarRow,
    defaultColor: string,
  ): AnalyticsChartTooltipContent => {
    const total = getRowTotal(row);

    return {
      title: row.label,
      rows: [
        ...row.segments.map(({ label, value, color }) => {
          const share = total > 0 ? formatAnalyticsRate(value / total) : null;

          return {
            label,
            color: color ?? defaultColor,
            value:
              isPercentMode && isDefined(share)
                ? `${formatRowValue(value)} (${share})`
                : formatRowValue(value),
          };
        }),
        ...(isDefined(row.tickValue)
          ? [
              {
                label: row.tickLabel ?? t`Limit`,
                value: formatRowValue(row.tickValue),
              },
            ]
          : []),
      ],
      note: row.segments.length === 0 ? t`Not enough data` : null,
    };
  };

  const renderRow = (row: AnalyticsHorizontalBarRow, defaultColor: string) => {
    const total = getRowTotal(row);
    const scale = isPercentMode ? total : largestValue;
    const barWidthPercent = scale > 0 ? (total / scale) * 100 : 0;
    const content = row.tooltip ?? buildDefaultTooltip(row, defaultColor);
    const valueText =
      row.valueLabel ??
      (row.segments.length > 0 ? formatRowValue(total) : undefined);
    const isClickable = isDefined(onRowClick);
    const activate = () => onRowClick?.(row.key);

    return (
      <StyledRow
        key={row.key}
        isClickable={isClickable}
        role={isClickable ? 'button' : undefined}
        tabIndex={isClickable ? 0 : undefined}
        aria-label={isClickable ? `${row.label}: ${valueText ?? ''}` : undefined}
        onClick={isClickable ? activate : undefined}
        onKeyDown={
          isClickable ? activateAnalyticsChartMarkOnKey(activate) : undefined
        }
        onFocus={(event) => showTooltipAtElement(content, event.currentTarget)}
        onBlur={hideTooltip}
        onPointerEnter={(event) => showTooltip(content, event)}
        onPointerMove={moveTooltip}
        onPointerLeave={hideTooltip}
      >
        <StyledLabel>{row.label}</StyledLabel>
        <StyledBarArea>
          {barWidthPercent > 0 && (
            <StyledBar
              style={{
                opacity: row.isSmallSample ? SMALL_SAMPLE_OPACITY : undefined,
                width: `${barWidthPercent}%`,
              }}
            >
              {row.segments
                .filter(({ value }) => value > 0)
                .map(({ key, value, color }) => (
                  <StyledSegment
                    key={key}
                    style={{
                      background: color ?? defaultColor,
                      flexGrow: value,
                    }}
                  />
                ))}
            </StyledBar>
          )}
          {isDefined(row.tickValue) && scale > 0 && (
            <StyledTick style={{ left: `${(row.tickValue / scale) * 100}%` }} />
          )}
        </StyledBarArea>
        <StyledValue>
          {isDefined(valueText) ? valueText : <AnalyticsChartUnknownValue />}
        </StyledValue>
      </StyledRow>
    );
  };

  return (
    <StyledRoot
      role={isDefined(onRowClick) ? 'group' : 'img'}
      aria-label={ariaLabel}
    >
      {legendItems.length > 1 && <AnalyticsChartLegend items={legendItems} />}
      <StyledRows>
        {rows.map((row) => renderRow(row, ANALYTICS_CHART_COLOR.accent))}
        {dividedRows.length > 0 && <StyledDivider>{dividerLabel}</StyledDivider>}
        {dividedRows.map((row) =>
          renderRow(row, ANALYTICS_CHART_COLOR.neutralStrong),
        )}
      </StyledRows>
      {tooltip}
    </StyledRoot>
  );
};
