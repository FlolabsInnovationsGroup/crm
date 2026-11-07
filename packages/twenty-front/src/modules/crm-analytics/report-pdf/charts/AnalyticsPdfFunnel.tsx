import { t } from '@lingui/core/macro';
import { Circle, G, Path, Rect, Svg } from '@react-pdf/renderer';
import { isDefined } from 'twenty-shared/utils';

import { AnalyticsPdfSvgLabel } from '@/crm-analytics/report-pdf/charts/AnalyticsPdfSvgLabel';
import {
  AnalyticsPdfSvgText,
  getAnalyticsPdfBaseline,
} from '@/crm-analytics/report-pdf/charts/AnalyticsPdfSvgText';
import { ANALYTICS_PDF_COLOR } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfColor';
import { ANALYTICS_PDF_FONT_SIZE } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfFontSize';
import { type AnalyticsPdfRate } from '@/crm-analytics/report-pdf/types/AnalyticsPdfRate';
import {
  estimateAnalyticsPdfTextWidth,
  truncateAnalyticsPdfLabel,
} from '@/crm-analytics/report-pdf/utils/fitAnalyticsPdfLabel';

const LABEL_WIDTH = 96;
const STEP_WIDTH = 136;
const STEP_GAP = 10;
const MINIMUM_BAR_WIDTH = 2;
const BAR_CORNER_RADIUS = 1.5;
const COUNT_PADDING = 8;
const COUNT_GAP = 4;
const TEXT_GAP = 4;
const MARKER_RADIUS = 2.25;
const MARKER_GAP = 7;

export type AnalyticsPdfFunnelRow = {
  key: string;
  label: string;
  count: number;
  countText: string;
  // How many moved on to the row below. The last row has none.
  stepRate: AnalyticsPdfRate | null;
  isLowestStep: boolean;
};

type AnalyticsPdfFunnelProps = {
  rows: AnalyticsPdfFunnelRow[];
  width: number;
  barHeight: number;
  connectorHeight: number;
};

export const AnalyticsPdfFunnel = ({
  rows,
  width,
  barHeight,
  connectorHeight,
}: AnalyticsPdfFunnelProps) => {
  const plotWidth = width - LABEL_WIDTH - STEP_WIDTH - STEP_GAP;
  const centerX = LABEL_WIDTH + plotWidth / 2;
  const stepX = LABEL_WIDTH + plotWidth + STEP_GAP;
  const rowPitch = barHeight + connectorHeight;
  const maximumCount = Math.max(1, ...rows.map(({ count }) => count));
  const getBarWidth = (count: number) =>
    count === 0
      ? 0
      : Math.max((count / maximumCount) * plotWidth, MINIMUM_BAR_WIDTH);

  return (
    <Svg
      width={width}
      height={rows.length * barHeight + (rows.length - 1) * connectorHeight}
    >
      {rows.map((row, rowIndex) => {
        const barY = rowIndex * rowPitch;
        const barCenterY = barY + barHeight / 2;
        const barWidth = getBarWidth(row.count);
        const nextRow = rows[rowIndex + 1];
        const connectorTop = barY + barHeight;
        const connectorCenterY = connectorTop + connectorHeight / 2;
        const countWidth = estimateAnalyticsPdfTextWidth(
          row.countText,
          ANALYTICS_PDF_FONT_SIZE.label,
          true,
        );
        const isCountInside = countWidth + COUNT_PADDING <= barWidth;
        const stepRate = row.stepRate;
        const stepBaseline = getAnalyticsPdfBaseline(
          connectorCenterY,
          ANALYTICS_PDF_FONT_SIZE.label,
        );
        const stepRateWidth = isDefined(stepRate)
          ? estimateAnalyticsPdfTextWidth(
              stepRate.text,
              ANALYTICS_PDF_FONT_SIZE.label,
              true,
            )
          : 0;
        const moveOnText = t`moved on`;
        const moveOnWidth = estimateAnalyticsPdfTextWidth(
          moveOnText,
          ANALYTICS_PDF_FONT_SIZE.axis,
        );
        const trailingX =
          stepX + stepRateWidth + TEXT_GAP + moveOnWidth + TEXT_GAP;

        return (
          <G key={row.key}>
            {isDefined(nextRow) && (
              <Path
                d={`M${centerX - barWidth / 2},${connectorTop}L${centerX + barWidth / 2},${connectorTop}L${centerX + getBarWidth(nextRow.count) / 2},${connectorTop + connectorHeight}L${centerX - getBarWidth(nextRow.count) / 2},${connectorTop + connectorHeight}Z`}
                fill={
                  row.isLowestStep
                    ? ANALYTICS_PDF_COLOR.accentMiddle
                    : ANALYTICS_PDF_COLOR.accentWash
                }
              />
            )}
            {barWidth > 0 && (
              <Rect
                x={centerX - barWidth / 2}
                y={barY}
                width={barWidth}
                height={barHeight}
                rx={BAR_CORNER_RADIUS}
                fill={ANALYTICS_PDF_COLOR.accent}
              />
            )}
            <AnalyticsPdfSvgLabel
              x={0}
              centerY={barCenterY}
              text={row.label}
              maximumWidth={LABEL_WIDTH - 6}
            />
            <AnalyticsPdfSvgText
              x={isCountInside ? centerX : centerX + barWidth / 2 + COUNT_GAP}
              y={getAnalyticsPdfBaseline(
                barCenterY,
                ANALYTICS_PDF_FONT_SIZE.label,
              )}
              text={row.countText}
              isBold
              color={
                isCountInside
                  ? ANALYTICS_PDF_COLOR.onDark
                  : ANALYTICS_PDF_COLOR.ink
              }
              anchor={isCountInside ? 'middle' : 'start'}
            />
            {isDefined(stepRate) && (
              <>
                <AnalyticsPdfSvgText
                  x={stepX}
                  y={stepBaseline}
                  text={stepRate.text}
                  isBold={!stepRate.isLighter}
                  color={
                    stepRate.isLighter
                      ? ANALYTICS_PDF_COLOR.inkSecondary
                      : ANALYTICS_PDF_COLOR.ink
                  }
                />
                <AnalyticsPdfSvgText
                  x={stepX + stepRateWidth + TEXT_GAP}
                  y={stepBaseline}
                  text={moveOnText}
                  fontSize={ANALYTICS_PDF_FONT_SIZE.axis}
                  color={ANALYTICS_PDF_COLOR.inkSecondary}
                />
                {isDefined(stepRate.detail) && (
                  <AnalyticsPdfSvgText
                    x={trailingX}
                    y={stepBaseline}
                    text={truncateAnalyticsPdfLabel({
                      text: stepRate.detail,
                      maximumWidth: width - trailingX,
                      fontSize: ANALYTICS_PDF_FONT_SIZE.axis,
                    })}
                    fontSize={ANALYTICS_PDF_FONT_SIZE.axis}
                    color={ANALYTICS_PDF_COLOR.inkSecondary}
                  />
                )}
              </>
            )}
            {row.isLowestStep && (
              <>
                <Circle
                  cx={trailingX + MARKER_RADIUS}
                  cy={connectorCenterY}
                  r={MARKER_RADIUS}
                  fill={ANALYTICS_PDF_COLOR.accent}
                />
                <AnalyticsPdfSvgText
                  x={trailingX + MARKER_GAP}
                  y={stepBaseline}
                  text={t`Lowest step`}
                  fontSize={ANALYTICS_PDF_FONT_SIZE.axis}
                  isBold
                />
              </>
            )}
          </G>
        );
      })}
    </Svg>
  );
};
