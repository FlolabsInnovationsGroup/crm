import { G, Line, Path, Svg } from '@react-pdf/renderer';
import { isDefined } from 'twenty-shared/utils';

import { AnalyticsPdfSvgLabel } from '@/crm-analytics/report-pdf/charts/AnalyticsPdfSvgLabel';
import { AnalyticsPdfSvgText } from '@/crm-analytics/report-pdf/charts/AnalyticsPdfSvgText';
import { ANALYTICS_PDF_COLOR } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfColor';
import { ANALYTICS_PDF_FONT_SIZE } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfFontSize';
import { type AnalyticsPdfRate } from '@/crm-analytics/report-pdf/types/AnalyticsPdfRate';
import { buildAnalyticsPdfBarPath } from '@/crm-analytics/report-pdf/utils/buildAnalyticsPdfBarPath';

const TOP_BAND = 22;
const LABEL_BAND = 24;
const COLUMN_SHARE_OF_SLOT = 0.62;
const MAXIMUM_COLUMN_WIDTH = 34;
const CAP_GAP = 3;
const DETAIL_LINE_HEIGHT = 8;
const LABEL_SIDE_PADDING = 3;

export type AnalyticsPdfColumn = {
  key: string;
  label: string;
  rate: AnalyticsPdfRate;
  isHighlighted: boolean;
};

const getColumnFill = ({ rate, isHighlighted }: AnalyticsPdfColumn) => {
  if (isHighlighted) {
    return ANALYTICS_PDF_COLOR.accent;
  }

  return rate.isLighter
    ? ANALYTICS_PDF_COLOR.neutralSoft
    : ANALYTICS_PDF_COLOR.neutral;
};

type AnalyticsPdfColumnsProps = {
  columns: AnalyticsPdfColumn[];
  width: number;
  plotHeight: number;
};

// Rates share a fixed 0 to 100 scale, so a column's height means the same in every report.
export const AnalyticsPdfColumns = ({
  columns,
  width,
  plotHeight,
}: AnalyticsPdfColumnsProps) => {
  const slotWidth = width / Math.max(columns.length, 1);
  const columnWidth = Math.min(
    slotWidth * COLUMN_SHARE_OF_SLOT,
    MAXIMUM_COLUMN_WIDTH,
  );
  const baselineY = TOP_BAND + plotHeight;

  return (
    <Svg width={width} height={baselineY + LABEL_BAND}>
      <Line
        x1={0}
        y1={TOP_BAND}
        x2={width}
        y2={TOP_BAND}
        stroke={ANALYTICS_PDF_COLOR.hairline}
        strokeWidth={0.5}
      />
      {columns.map((column, columnIndex) => {
        const centerX = (columnIndex + 0.5) * slotWidth;
        const ratio = column.rate.ratio ?? 0;
        const columnHeight = Math.min(ratio, 1) * plotHeight;
        const capY = baselineY - columnHeight - CAP_GAP;
        const hasDetail = isDefined(column.rate.shortDetail);

        return (
          <G key={column.key}>
            {columnHeight > 0 && (
              <Path
                d={buildAnalyticsPdfBarPath({
                  x: centerX - columnWidth / 2,
                  y: baselineY - columnHeight,
                  width: columnWidth,
                  height: columnHeight,
                  dataEnd: 'TOP',
                })}
                fill={getColumnFill(column)}
              />
            )}
            <AnalyticsPdfSvgText
              x={centerX}
              y={hasDetail ? capY - DETAIL_LINE_HEIGHT : capY}
              text={column.rate.text}
              isBold={!column.rate.isLighter}
              color={
                column.rate.isLighter
                  ? ANALYTICS_PDF_COLOR.inkSecondary
                  : ANALYTICS_PDF_COLOR.ink
              }
              anchor="middle"
            />
            {hasDetail && (
              <AnalyticsPdfSvgText
                x={centerX}
                y={capY}
                text={column.rate.shortDetail ?? ''}
                fontSize={ANALYTICS_PDF_FONT_SIZE.cellDetail}
                color={ANALYTICS_PDF_COLOR.inkSecondary}
                anchor="middle"
              />
            )}
            <AnalyticsPdfSvgLabel
              x={centerX}
              centerY={baselineY + LABEL_BAND / 2}
              text={column.label}
              maximumWidth={slotWidth - LABEL_SIDE_PADDING * 2}
              fontSize={ANALYTICS_PDF_FONT_SIZE.axis}
              anchor="middle"
            />
          </G>
        );
      })}
      <Line
        x1={0}
        y1={baselineY}
        x2={width}
        y2={baselineY}
        stroke={ANALYTICS_PDF_COLOR.baseline}
        strokeWidth={0.75}
      />
    </Svg>
  );
};
