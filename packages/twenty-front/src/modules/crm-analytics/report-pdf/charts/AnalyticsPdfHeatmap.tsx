import { G, Rect, Svg } from '@react-pdf/renderer';
import { isDefined } from 'twenty-shared/utils';

import { AnalyticsPdfSvgLabel } from '@/crm-analytics/report-pdf/charts/AnalyticsPdfSvgLabel';
import {
  AnalyticsPdfSvgText,
  getAnalyticsPdfBaseline,
} from '@/crm-analytics/report-pdf/charts/AnalyticsPdfSvgText';
import { ANALYTICS_PDF_COLOR } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfColor';
import { ANALYTICS_PDF_FONT_SIZE } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfFontSize';
import { type AnalyticsPdfRate } from '@/crm-analytics/report-pdf/types/AnalyticsPdfRate';
import { getAnalyticsPdfHeatmapColor } from '@/crm-analytics/report-pdf/utils/getAnalyticsPdfHeatmapColor';

const HEADER_HEIGHT = 22;
const CELL_GAP = 1.5;
const CELL_RADIUS = 1.5;
const SEPARATED_COLUMN_GAP = 7;
const LABEL_GAP = 8;
const MAXIMUM_COLUMN_WIDTH = 72;
const TWO_LINE_ROW_HEIGHT = 17;
const DETAIL_OFFSET = 3.6;

export type AnalyticsPdfHeatmapColumn = {
  key: string;
  label: string;
  isSeparated?: boolean;
};

export type AnalyticsPdfHeatmapRow = {
  key: string;
  label: string;
  detail?: string | null;
  cells: AnalyticsPdfRate[];
};

type AnalyticsPdfHeatmapProps = {
  columns: AnalyticsPdfHeatmapColumn[];
  rows: AnalyticsPdfHeatmapRow[];
  width: number;
  labelWidth: number;
  rowHeight: number;
  cornerLabel?: string;
};

export const AnalyticsPdfHeatmap = ({
  columns,
  rows,
  width,
  labelWidth,
  rowHeight,
  cornerLabel,
}: AnalyticsPdfHeatmapProps) => {
  const separatedGap = columns.some(({ isSeparated }) => isSeparated === true)
    ? SEPARATED_COLUMN_GAP
    : 0;
  const columnWidth = Math.min(
    (width - labelWidth - separatedGap) / Math.max(columns.length, 1),
    MAXIMUM_COLUMN_WIDTH,
  );
  const getColumnX = (columnIndex: number) =>
    labelWidth +
    columnIndex * columnWidth +
    (columns[columnIndex].isSeparated === true ? separatedGap : 0);

  return (
    <Svg width={width} height={HEADER_HEIGHT + rows.length * rowHeight}>
      {isDefined(cornerLabel) && (
        <AnalyticsPdfSvgText
          x={0}
          y={HEADER_HEIGHT - 5}
          text={cornerLabel}
          fontSize={ANALYTICS_PDF_FONT_SIZE.axis}
          color={ANALYTICS_PDF_COLOR.inkSecondary}
        />
      )}
      {columns.map((column, columnIndex) => (
        <AnalyticsPdfSvgLabel
          key={column.key}
          x={getColumnX(columnIndex) + columnWidth / 2}
          centerY={HEADER_HEIGHT / 2}
          text={column.label}
          maximumWidth={columnWidth - 2}
          fontSize={ANALYTICS_PDF_FONT_SIZE.axis}
          color={ANALYTICS_PDF_COLOR.inkSecondary}
          anchor="middle"
        />
      ))}
      {rows.map((row, rowIndex) => {
        const rowY = HEADER_HEIGHT + rowIndex * rowHeight;
        const rowCenterY = rowY + rowHeight / 2;
        const hasRowDetail = isDefined(row.detail);

        return (
          <G key={row.key}>
            <AnalyticsPdfSvgLabel
              x={0}
              centerY={hasRowDetail ? rowCenterY - 4 : rowCenterY}
              text={row.label}
              maximumWidth={labelWidth - LABEL_GAP}
              maximumLines={
                !hasRowDetail && rowHeight >= TWO_LINE_ROW_HEIGHT ? 2 : 1
              }
            />
            {hasRowDetail && (
              <AnalyticsPdfSvgText
                x={0}
                y={getAnalyticsPdfBaseline(
                  rowCenterY + 4.5,
                  ANALYTICS_PDF_FONT_SIZE.axis,
                )}
                text={row.detail ?? ''}
                fontSize={ANALYTICS_PDF_FONT_SIZE.axis}
                color={ANALYTICS_PDF_COLOR.inkSecondary}
              />
            )}
            {row.cells.map((cell, cellIndex) => {
              const cellX = getColumnX(cellIndex);
              const cellWidth = columnWidth - CELL_GAP;
              const cellHeight = rowHeight - CELL_GAP;
              const cellCenterX = cellX + cellWidth / 2;
              const cellCenterY = rowY + cellHeight / 2;
              const colors = getAnalyticsPdfHeatmapColor(cell);
              const hasDetail = isDefined(cell.shortDetail);

              return (
                <G key={cellIndex}>
                  <Rect
                    x={cellX}
                    y={rowY}
                    width={cellWidth}
                    height={cellHeight}
                    rx={CELL_RADIUS}
                    fill={colors.fill}
                  />
                  <AnalyticsPdfSvgText
                    x={cellCenterX}
                    y={getAnalyticsPdfBaseline(
                      hasDetail ? cellCenterY - DETAIL_OFFSET : cellCenterY,
                      ANALYTICS_PDF_FONT_SIZE.note,
                    )}
                    text={cell.text}
                    fontSize={ANALYTICS_PDF_FONT_SIZE.note}
                    color={colors.text}
                    isBold={!cell.isLighter}
                    anchor="middle"
                  />
                  {hasDetail && (
                    <AnalyticsPdfSvgText
                      x={cellCenterX}
                      y={getAnalyticsPdfBaseline(
                        cellCenterY + DETAIL_OFFSET + 0.4,
                        ANALYTICS_PDF_FONT_SIZE.cellDetail,
                      )}
                      text={cell.shortDetail ?? ''}
                      fontSize={ANALYTICS_PDF_FONT_SIZE.cellDetail}
                      color={colors.text}
                      anchor="middle"
                    />
                  )}
                </G>
              );
            })}
          </G>
        );
      })}
    </Svg>
  );
};
