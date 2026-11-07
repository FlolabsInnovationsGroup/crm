import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';
import { themeCssVariables } from 'twenty-ui/theme';

import { AnalyticsChartNoData } from '@/crm-analytics/charts/AnalyticsChartNoData';
import { type AnalyticsChartTooltipContent } from '@/crm-analytics/charts/AnalyticsChartTooltip';
import { AnalyticsChartUnknownValue } from '@/crm-analytics/charts/AnalyticsChartUnknownValue';
import { getAnalyticsSequentialColor } from '@/crm-analytics/charts/getAnalyticsSequentialColor';
import { useAnalyticsChartTooltip } from '@/crm-analytics/charts/useAnalyticsChartTooltip';
import { formatAnalyticsRate } from '@/crm-analytics/utils/formatAnalyticsRate';

export type AnalyticsHeatmapColumn = {
  key: string;
  label: string;
};

export type AnalyticsHeatmapCell = {
  columnKey: string;
  // Null is unknown: a dash and no color, never 0%.
  value: number | null;
  // Text in the cell. Defaults to the value as a percent.
  valueLabel?: string;
  // Still inside its window: lighter stripes, and it says "so far".
  isInProgress?: boolean;
  // Under the minimum sample: lighter, and the tooltip should give the count.
  isSmallSample?: boolean;
  tooltip?: AnalyticsChartTooltipContent;
};

export type AnalyticsHeatmapRow = {
  key: string;
  label: string;
  cells: AnalyticsHeatmapCell[];
};

const StyledRoot = styled.div`
  min-width: 0;
`;

const StyledScroller = styled.div`
  overflow-x: auto;
`;

const StyledTable = styled.table`
  border-collapse: separate;
  border-spacing: 2px;
  font-size: ${themeCssVariables.font.size.sm};
  min-width: 100%;
`;

const StyledColumnHeader = styled.th`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
  font-weight: ${themeCssVariables.font.weight.regular};
  line-height: 1.2;
  min-width: 64px;
  padding: ${themeCssVariables.spacing[1]};
  text-align: center;
  vertical-align: bottom;
`;

const StyledCorner = styled.th`
  background: ${themeCssVariables.background.primary};
  left: 0;
  position: sticky;
  z-index: 1;
`;

const StyledRowHeader = styled.th`
  background: ${themeCssVariables.background.primary};
  color: ${themeCssVariables.font.color.primary};
  font-weight: ${themeCssVariables.font.weight.regular};
  left: 0;
  line-height: 1.2;
  max-width: 200px;
  min-width: 112px;
  overflow-wrap: anywhere;
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]}
    ${themeCssVariables.spacing[1]} 0;
  position: sticky;
  text-align: start;
  z-index: 1;
`;

const StyledRowButton = styled.button`
  background: none;
  border: none;
  border-radius: ${themeCssVariables.border.radius.sm};
  color: inherit;
  cursor: pointer;
  font: inherit;
  padding: 0;
  text-align: start;

  &:focus-visible {
    outline: 2px solid ${themeCssVariables.color.blue};
  }

  &:hover {
    text-decoration: underline;
  }
`;

const StyledCell = styled.td`
  border-radius: ${themeCssVariables.border.radius.sm};
  font-variant-numeric: tabular-nums;
  height: 36px;
  line-height: 1.1;
  min-width: 64px;
  padding: 2px ${themeCssVariables.spacing[1]};
  text-align: center;

  &:hover {
    outline: 2px solid ${themeCssVariables.font.color.secondary};
    outline-offset: -2px;
  }
`;

const StyledSoFar = styled.span`
  display: block;
  font-size: ${themeCssVariables.font.size.xxs};
`;

type AnalyticsHeatmapProps = {
  // One line that says what the chart shows, for screen readers.
  ariaLabel: string;
  columns: AnalyticsHeatmapColumn[];
  rows: AnalyticsHeatmapRow[];
  // Heading over the first column, such as "Track".
  rowHeaderLabel?: string;
  // The value that gets the darkest color. Defaults to the largest value shown.
  maxValue?: number;
  formatValue?: (value: number) => string;
  onRowClick?: (rowKey: string) => void;
};

export const AnalyticsHeatmap = ({
  ariaLabel,
  columns,
  rows,
  rowHeaderLabel,
  maxValue,
  formatValue,
  onRowClick,
}: AnalyticsHeatmapProps) => {
  const { tooltip, showTooltip, moveTooltip, hideTooltip } =
    useAnalyticsChartTooltip();

  if (rows.length === 0 || columns.length === 0) {
    return <AnalyticsChartNoData />;
  }

  const formatCellValue =
    formatValue ?? ((value: number) => formatAnalyticsRate(value) ?? '');

  const scaleTop =
    maxValue ??
    Math.max(
      0,
      ...rows.flatMap(({ cells }) =>
        cells.map(({ value }) => value).filter(isDefined),
      ),
    );

  const getCellStyle = (cell: AnalyticsHeatmapCell, value: number) => {
    const { fill, text } = getAnalyticsSequentialColor({
      ratio: scaleTop > 0 ? value / scaleTop : 0,
      isLighter: cell.isInProgress === true || cell.isSmallSample === true,
    });

    return {
      background:
        cell.isInProgress === true
          ? `repeating-linear-gradient(135deg, ${fill} 0 4px, ${themeCssVariables.background.primary} 4px 6px)`
          : fill,
      color: text,
    };
  };

  const renderCell = (
    row: AnalyticsHeatmapRow,
    column: AnalyticsHeatmapColumn,
  ) => {
    const cell = row.cells.find(({ columnKey }) => columnKey === column.key);
    const value = cell?.value;
    const isInProgress = cell?.isInProgress === true;
    const valueText = isDefined(value)
      ? (cell?.valueLabel ?? formatCellValue(value))
      : t`Not enough data`;

    const content: AnalyticsChartTooltipContent = cell?.tooltip ?? {
      title: `${row.label}, ${column.label}`,
      rows: [
        { label: isInProgress ? t`So far` : t`Value`, value: valueText },
      ],
    };

    return (
      <StyledCell
        key={column.key}
        style={
          isDefined(cell) && isDefined(value)
            ? getCellStyle(cell, value)
            : undefined
        }
        onPointerEnter={(event) => showTooltip(content, event)}
        onPointerMove={moveTooltip}
        onPointerLeave={hideTooltip}
      >
        {isDefined(value) ? valueText : <AnalyticsChartUnknownValue />}
        {isDefined(value) && isInProgress && (
          <StyledSoFar>{t`so far`}</StyledSoFar>
        )}
      </StyledCell>
    );
  };

  return (
    <StyledRoot>
      <StyledScroller>
        <StyledTable aria-label={ariaLabel}>
          <thead>
            <tr>
              <StyledCorner scope="col">{rowHeaderLabel}</StyledCorner>
              {columns.map((column) => (
                <StyledColumnHeader key={column.key} scope="col">
                  {column.label}
                </StyledColumnHeader>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <StyledRowHeader scope="row">
                  {isDefined(onRowClick) ? (
                    <StyledRowButton
                      type="button"
                      onClick={() => onRowClick(row.key)}
                    >
                      {row.label}
                    </StyledRowButton>
                  ) : (
                    row.label
                  )}
                </StyledRowHeader>
                {columns.map((column) => renderCell(row, column))}
              </tr>
            ))}
          </tbody>
        </StyledTable>
      </StyledScroller>
      {tooltip}
    </StyledRoot>
  );
};
