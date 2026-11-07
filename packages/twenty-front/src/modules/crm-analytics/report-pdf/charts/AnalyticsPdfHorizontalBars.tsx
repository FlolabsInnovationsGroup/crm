import { G, Line, Path, Svg } from '@react-pdf/renderer';
import { isDefined } from 'twenty-shared/utils';

import { AnalyticsPdfSvgLabel } from '@/crm-analytics/report-pdf/charts/AnalyticsPdfSvgLabel';
import {
  AnalyticsPdfSvgText,
  getAnalyticsPdfBaseline,
} from '@/crm-analytics/report-pdf/charts/AnalyticsPdfSvgText';
import { ANALYTICS_PDF_COLOR } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfColor';
import { ANALYTICS_PDF_FONT_SIZE } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfFontSize';
import { buildAnalyticsPdfBarPath } from '@/crm-analytics/report-pdf/utils/buildAnalyticsPdfBarPath';
import { estimateAnalyticsPdfTextWidth } from '@/crm-analytics/report-pdf/utils/fitAnalyticsPdfLabel';

const LABEL_GAP = 8;
const TIP_GAP = 4;
const DETAIL_GAP = 3;
const MINIMUM_PLOT_WIDTH = 24;
const MAXIMUM_BAR_HEIGHT = 12;
const BAR_SHARE_OF_ROW = 0.68;
const TWO_LINE_ROW_HEIGHT = 17;
const SMALLEST_SCALE_MAXIMUM = 0.01;

export type AnalyticsPdfBarTone = 'ACCENT' | 'LIGHTER' | 'NEUTRAL';

export type AnalyticsPdfBarRow = {
  key: string;
  label: string;
  value: number | null;
  valueText: string;
  detailText?: string | null;
  // Drawn darker from the baseline, inside the whole bar.
  partValue?: number | null;
  tone: AnalyticsPdfBarTone;
};

const getBarFill = (tone: AnalyticsPdfBarTone) => {
  if (tone === 'NEUTRAL') {
    return ANALYTICS_PDF_COLOR.neutral;
  }

  return tone === 'LIGHTER'
    ? ANALYTICS_PDF_COLOR.accentLight
    : ANALYTICS_PDF_COLOR.accent;
};

const getPartBarFill = (tone: AnalyticsPdfBarTone) =>
  tone === 'NEUTRAL' ? ANALYTICS_PDF_COLOR.neutral : ANALYTICS_PDF_COLOR.accent;

const estimateTipWidth = ({ valueText, detailText }: AnalyticsPdfBarRow) => {
  const valueWidth = estimateAnalyticsPdfTextWidth(
    valueText,
    ANALYTICS_PDF_FONT_SIZE.label,
    true,
  );

  return isDefined(detailText)
    ? valueWidth +
        DETAIL_GAP +
        estimateAnalyticsPdfTextWidth(detailText, ANALYTICS_PDF_FONT_SIZE.axis)
    : valueWidth;
};

type AnalyticsPdfHorizontalBarsProps = {
  rows: AnalyticsPdfBarRow[];
  width: number;
  // Zero leaves the labels to a chart beside this one that shares its rows.
  labelWidth: number;
  rowHeight: number;
  maximumValue?: number;
};

export const AnalyticsPdfHorizontalBars = ({
  rows,
  width,
  labelWidth,
  rowHeight,
  maximumValue,
}: AnalyticsPdfHorizontalBarsProps) => {
  const tipWidth = Math.max(0, ...rows.map(estimateTipWidth)) + TIP_GAP;
  const plotWidth = Math.max(width - labelWidth - tipWidth, MINIMUM_PLOT_WIDTH);
  const scaleMaximum = Math.max(
    maximumValue ?? 0,
    ...rows.map(({ value }) => value ?? 0),
    SMALLEST_SCALE_MAXIMUM,
  );
  const barHeight = Math.min(rowHeight * BAR_SHARE_OF_ROW, MAXIMUM_BAR_HEIGHT);
  const height = rows.length * rowHeight;

  return (
    <Svg width={width} height={height}>
      {rows.map((row, rowIndex) => {
        const centerY = (rowIndex + 0.5) * rowHeight;
        const barY = centerY - barHeight / 2;
        const barWidth = ((row.value ?? 0) / scaleMaximum) * plotWidth;
        const partWidth = ((row.partValue ?? 0) / scaleMaximum) * plotWidth;
        const tipX = labelWidth + barWidth + TIP_GAP;
        const isLighter = row.tone === 'LIGHTER' || !isDefined(row.value);
        const baseline = getAnalyticsPdfBaseline(
          centerY,
          ANALYTICS_PDF_FONT_SIZE.label,
        );

        return (
          <G key={row.key}>
            {labelWidth > 0 && (
              <AnalyticsPdfSvgLabel
                x={0}
                centerY={centerY}
                text={row.label}
                maximumWidth={labelWidth - LABEL_GAP}
                maximumLines={rowHeight >= TWO_LINE_ROW_HEIGHT ? 2 : 1}
                color={ANALYTICS_PDF_COLOR.ink}
              />
            )}
            {barWidth > 0 && (
              <Path
                d={buildAnalyticsPdfBarPath({
                  x: labelWidth,
                  y: barY,
                  width: barWidth,
                  height: barHeight,
                  dataEnd: 'RIGHT',
                })}
                // Pale accent means a small group, so the rest of a split bar stays gray.
                fill={
                  isDefined(row.partValue)
                    ? ANALYTICS_PDF_COLOR.neutralSoft
                    : getBarFill(row.tone)
                }
              />
            )}
            {partWidth > 0 && (
              <Path
                d={buildAnalyticsPdfBarPath({
                  x: labelWidth,
                  y: barY,
                  width: partWidth,
                  height: barHeight,
                  dataEnd: 'RIGHT',
                })}
                fill={getPartBarFill(row.tone)}
              />
            )}
            <AnalyticsPdfSvgText
              x={tipX}
              y={baseline}
              text={row.valueText}
              isBold={!isLighter}
              color={
                isLighter
                  ? ANALYTICS_PDF_COLOR.inkSecondary
                  : ANALYTICS_PDF_COLOR.ink
              }
            />
            {isDefined(row.detailText) && (
              <AnalyticsPdfSvgText
                x={
                  tipX +
                  DETAIL_GAP +
                  estimateAnalyticsPdfTextWidth(
                    row.valueText,
                    ANALYTICS_PDF_FONT_SIZE.label,
                  )
                }
                y={baseline}
                text={row.detailText}
                fontSize={ANALYTICS_PDF_FONT_SIZE.axis}
                color={ANALYTICS_PDF_COLOR.inkSecondary}
              />
            )}
          </G>
        );
      })}
      <Line
        x1={labelWidth}
        y1={0}
        x2={labelWidth}
        y2={height}
        stroke={ANALYTICS_PDF_COLOR.baseline}
        strokeWidth={0.75}
      />
    </Svg>
  );
};
