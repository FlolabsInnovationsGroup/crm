import { t } from '@lingui/core/macro';
import { G, Line, Path, Svg } from '@react-pdf/renderer';

import { AnalyticsPdfSvgLabel } from '@/crm-analytics/report-pdf/charts/AnalyticsPdfSvgLabel';
import {
  AnalyticsPdfSvgText,
  getAnalyticsPdfBaseline,
} from '@/crm-analytics/report-pdf/charts/AnalyticsPdfSvgText';
import { ANALYTICS_PDF_COLOR } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfColor';
import { ANALYTICS_PDF_FONT_SIZE } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfFontSize';
import { buildAnalyticsPdfBarPath } from '@/crm-analytics/report-pdf/utils/buildAnalyticsPdfBarPath';
import { formatAnalyticsPdfNumber } from '@/crm-analytics/report-pdf/utils/formatAnalyticsPdfNumber';

const NOW_WIDTH = 34;
const TIP_RESERVE = 24;
const TIP_GAP = 3;
const HEADER_HEIGHT = 13;
const LABEL_GAP = 8;
const TWO_LINE_ROW_HEIGHT = 17;
const BAR_SHARE_OF_ROW = 0.68;

export type AnalyticsPdfDivergingRow = {
  key: string;
  label: string;
  leftValue: number;
  rightValue: number;
  nowValue: number;
};

type AnalyticsPdfDivergingBarsProps = {
  rows: AnalyticsPdfDivergingRow[];
  width: number;
  labelWidth: number;
  rowHeight: number;
};

export const AnalyticsPdfDivergingBars = ({
  rows,
  width,
  labelWidth,
  rowHeight,
}: AnalyticsPdfDivergingBarsProps) => {
  const plotLeft = labelWidth + TIP_RESERVE;
  const plotRight = width - NOW_WIDTH - TIP_RESERVE;
  const axisX = (plotLeft + plotRight) / 2;
  const armWidth = (plotRight - plotLeft) / 2;
  const scaleMaximum = Math.max(
    1,
    ...rows.flatMap(({ leftValue, rightValue }) => [leftValue, rightValue]),
  );
  const barHeight = rowHeight * BAR_SHARE_OF_ROW;
  const height = HEADER_HEIGHT + rows.length * rowHeight;

  return (
    <Svg width={width} height={height}>
      <AnalyticsPdfSvgText
        x={width}
        y={HEADER_HEIGHT - 4}
        text={t`In stage now`}
        fontSize={ANALYTICS_PDF_FONT_SIZE.axis}
        color={ANALYTICS_PDF_COLOR.inkSecondary}
        anchor="end"
      />
      {rows.map((row, rowIndex) => {
        const centerY = HEADER_HEIGHT + (rowIndex + 0.5) * rowHeight;
        const barY = centerY - barHeight / 2;
        const leftWidth = (row.leftValue / scaleMaximum) * armWidth;
        const rightWidth = (row.rightValue / scaleMaximum) * armWidth;
        const baseline = getAnalyticsPdfBaseline(
          centerY,
          ANALYTICS_PDF_FONT_SIZE.label,
        );

        return (
          <G key={row.key}>
            <AnalyticsPdfSvgLabel
              x={0}
              centerY={centerY}
              text={row.label}
              maximumWidth={labelWidth - LABEL_GAP}
              maximumLines={rowHeight >= TWO_LINE_ROW_HEIGHT ? 2 : 1}
            />
            {leftWidth > 0 && (
              <Path
                d={buildAnalyticsPdfBarPath({
                  x: axisX - leftWidth,
                  y: barY,
                  width: leftWidth,
                  height: barHeight,
                  dataEnd: 'LEFT',
                })}
                fill={ANALYTICS_PDF_COLOR.neutral}
              />
            )}
            {rightWidth > 0 && (
              <Path
                d={buildAnalyticsPdfBarPath({
                  x: axisX,
                  y: barY,
                  width: rightWidth,
                  height: barHeight,
                  dataEnd: 'RIGHT',
                })}
                fill={ANALYTICS_PDF_COLOR.accent}
              />
            )}
            <AnalyticsPdfSvgText
              x={axisX - leftWidth - TIP_GAP}
              y={baseline}
              text={formatAnalyticsPdfNumber(row.leftValue)}
              color={ANALYTICS_PDF_COLOR.inkSecondary}
              anchor="end"
            />
            <AnalyticsPdfSvgText
              x={axisX + rightWidth + TIP_GAP}
              y={baseline}
              text={formatAnalyticsPdfNumber(row.rightValue)}
              isBold
            />
            <AnalyticsPdfSvgText
              x={width}
              y={baseline}
              text={formatAnalyticsPdfNumber(row.nowValue)}
              color={ANALYTICS_PDF_COLOR.inkSecondary}
              anchor="end"
            />
          </G>
        );
      })}
      <Line
        x1={axisX}
        y1={HEADER_HEIGHT}
        x2={axisX}
        y2={height}
        stroke={ANALYTICS_PDF_COLOR.baseline}
        strokeWidth={0.75}
      />
    </Svg>
  );
};
