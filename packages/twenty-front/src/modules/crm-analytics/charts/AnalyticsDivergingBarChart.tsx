import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme';

import { ANALYTICS_CHART_COLOR } from '@/crm-analytics/charts/AnalyticsChartColor';
import { AnalyticsChartLegend } from '@/crm-analytics/charts/AnalyticsChartLegend';
import { AnalyticsChartNoData } from '@/crm-analytics/charts/AnalyticsChartNoData';
import { type AnalyticsChartTooltipContent } from '@/crm-analytics/charts/AnalyticsChartTooltip';
import { useAnalyticsChartTooltip } from '@/crm-analytics/charts/useAnalyticsChartTooltip';
import { useNumberFormat } from '@/localization/hooks/useNumberFormat';

// Keeps room for the value beside the longest bar.
const VALUE_ROOM = '5ch';

export type AnalyticsDivergingRow = {
  key: string;
  label: string;
  rightValue: number;
  leftValue: number;
  tooltip?: AnalyticsChartTooltipContent;
};

const StyledRoot = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  min-width: 0;
`;

const StyledRow = styled.div`
  align-items: stretch;
  border-radius: ${themeCssVariables.border.radius.sm};
  display: grid;
  font-size: ${themeCssVariables.font.size.sm};
  grid-template-columns: minmax(72px, 28%) minmax(0, 1fr) minmax(0, 1fr);
  min-height: 28px;

  &:hover {
    background: ${themeCssVariables.background.transparent.light};
  }
`;

const StyledLabel = styled.span`
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  align-self: center;
  color: ${themeCssVariables.font.color.primary};
  display: -webkit-box;
  line-height: 1.2;
  min-width: 0;
  overflow: hidden;
  overflow-wrap: anywhere;
  padding-inline-end: ${themeCssVariables.spacing[2]};
`;

const StyledLeftSide = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[1]};
  justify-content: flex-end;
  min-width: 0;
`;

// A shadow draws the center line without taking width, so both sides scale a bar the same.
const StyledRightSide = styled.div`
  align-items: center;
  box-shadow: -1px 0 0 ${themeCssVariables.border.color.strong};
  display: flex;
  gap: ${themeCssVariables.spacing[1]};
  min-width: 0;
`;

const StyledBar = styled.div<{ side: 'left' | 'right' }>`
  border-radius: ${({ side }) =>
    side === 'right'
      ? `0 ${themeCssVariables.border.radius.sm} ${themeCssVariables.border.radius.sm} 0`
      : `${themeCssVariables.border.radius.sm} 0 0 ${themeCssVariables.border.radius.sm}`};
  height: 16px;
  min-width: 2px;
`;

const StyledValue = styled.span`
  color: ${themeCssVariables.font.color.secondary};
  flex-shrink: 0;
  font-size: ${themeCssVariables.font.size.xs};
  font-variant-numeric: tabular-nums;
`;

type AnalyticsDivergingBarChartProps = {
  // One line that says what the chart shows, for screen readers.
  ariaLabel: string;
  rows: AnalyticsDivergingRow[];
  // What each side means, such as "Entered" and "Left".
  rightLabel: string;
  leftLabel: string;
  formatValue?: (value: number) => string;
};

export const AnalyticsDivergingBarChart = ({
  ariaLabel,
  rows,
  rightLabel,
  leftLabel,
  formatValue,
}: AnalyticsDivergingBarChartProps) => {
  const { formatNumber } = useNumberFormat();
  const { tooltip, showTooltip, moveTooltip, hideTooltip } =
    useAnalyticsChartTooltip();

  if (rows.length === 0) {
    return <AnalyticsChartNoData />;
  }

  const formatRowValue = formatValue ?? ((value: number) => formatNumber(value));
  const rightColor = ANALYTICS_CHART_COLOR.accent;
  const leftColor = ANALYTICS_CHART_COLOR.neutralStrong;

  const largestValue = Math.max(
    ...rows.flatMap(({ rightValue, leftValue }) => [rightValue, leftValue]),
  );

  const getBarWidth = (value: number) =>
    `calc((100% - ${VALUE_ROOM}) * ${largestValue > 0 ? value / largestValue : 0})`;

  return (
    <StyledRoot role="img" aria-label={ariaLabel}>
      <AnalyticsChartLegend
        items={[
          { key: 'left', label: leftLabel, color: leftColor },
          { key: 'right', label: rightLabel, color: rightColor },
        ]}
      />
      <div>
        {rows.map((row) => {
          const content: AnalyticsChartTooltipContent = row.tooltip ?? {
            title: row.label,
            rows: [
              {
                label: rightLabel,
                value: formatRowValue(row.rightValue),
                color: rightColor,
              },
              {
                label: leftLabel,
                value: formatRowValue(row.leftValue),
                color: leftColor,
              },
            ],
          };

          return (
            <StyledRow
              key={row.key}
              onPointerEnter={(event) => showTooltip(content, event)}
              onPointerMove={moveTooltip}
              onPointerLeave={hideTooltip}
            >
              <StyledLabel>{row.label}</StyledLabel>
              <StyledLeftSide>
                <StyledValue>{formatRowValue(row.leftValue)}</StyledValue>
                {row.leftValue > 0 && (
                  <StyledBar
                    side="left"
                    style={{
                      background: leftColor,
                      width: getBarWidth(row.leftValue),
                    }}
                  />
                )}
              </StyledLeftSide>
              <StyledRightSide>
                {row.rightValue > 0 && (
                  <StyledBar
                    side="right"
                    style={{
                      background: rightColor,
                      width: getBarWidth(row.rightValue),
                    }}
                  />
                )}
                <StyledValue>{formatRowValue(row.rightValue)}</StyledValue>
              </StyledRightSide>
            </StyledRow>
          );
        })}
      </div>
      {tooltip}
    </StyledRoot>
  );
};
