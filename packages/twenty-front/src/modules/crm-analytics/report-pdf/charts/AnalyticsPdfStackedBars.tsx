import { G, Rect, Svg } from '@react-pdf/renderer';

import { AnalyticsPdfSvgLabel } from '@/crm-analytics/report-pdf/charts/AnalyticsPdfSvgLabel';
import {
  AnalyticsPdfSvgText,
  getAnalyticsPdfBaseline,
} from '@/crm-analytics/report-pdf/charts/AnalyticsPdfSvgText';
import { ANALYTICS_PDF_COLOR } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfColor';
import { ANALYTICS_PDF_FONT_SIZE } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfFontSize';
import { ANALYTICS_PDF_UNKNOWN_VALUE } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfUnknownValue';
import { estimateAnalyticsPdfTextWidth } from '@/crm-analytics/report-pdf/utils/fitAnalyticsPdfLabel';
import { formatAnalyticsRate } from '@/crm-analytics/utils/formatAnalyticsRate';

const LABEL_GAP = 8;
const SEGMENT_GAP = 1.5;
const TOTAL_GAP = 8;
const CORNER_RADIUS = 1.5;
const SEGMENT_LABEL_PADDING = 6;
const LIGHTER_OPACITY = 0.5;
const TWO_LINE_ROW_HEIGHT = 17;

export type AnalyticsPdfStackedSegment = {
  key: string;
  value: number;
  fill: string;
  textColor: string;
};

export type AnalyticsPdfStackedRow = {
  key: string;
  label: string;
  total: number;
  totalText: string;
  isLighter: boolean;
  segments: AnalyticsPdfStackedSegment[];
};

type AnalyticsPdfStackedBarsProps = {
  rows: AnalyticsPdfStackedRow[];
  width: number;
  labelWidth: number;
  rowHeight: number;
  barHeight: number;
  totalWidth: number;
};

export const AnalyticsPdfStackedBars = ({
  rows,
  width,
  labelWidth,
  rowHeight,
  barHeight,
  totalWidth,
}: AnalyticsPdfStackedBarsProps) => {
  const plotWidth = width - labelWidth - totalWidth - TOTAL_GAP;

  return (
    <Svg width={width} height={rows.length * rowHeight}>
      {rows.map((row, rowIndex) => {
        const centerY = (rowIndex + 0.5) * rowHeight;
        const barY = centerY - barHeight / 2;
        let segmentX = labelWidth;

        return (
          <G key={row.key}>
            <AnalyticsPdfSvgLabel
              x={0}
              centerY={centerY}
              text={row.label}
              maximumWidth={labelWidth - LABEL_GAP}
              maximumLines={rowHeight >= TWO_LINE_ROW_HEIGHT ? 2 : 1}
            />
            {row.total === 0 && (
              <AnalyticsPdfSvgText
                x={labelWidth}
                y={getAnalyticsPdfBaseline(
                  centerY,
                  ANALYTICS_PDF_FONT_SIZE.label,
                )}
                text={ANALYTICS_PDF_UNKNOWN_VALUE}
                color={ANALYTICS_PDF_COLOR.inkSecondary}
              />
            )}
            {row.total > 0 &&
              row.segments
                .filter(({ value }) => value > 0)
                .map((segment) => {
                  const fullWidth = (segment.value / row.total) * plotWidth;
                  const drawnWidth = Math.max(fullWidth - SEGMENT_GAP, 0.5);
                  const x = segmentX;
                  const shareText =
                    formatAnalyticsRate(segment.value / row.total) ?? '';
                  const canHoldLabel =
                    estimateAnalyticsPdfTextWidth(
                      shareText,
                      ANALYTICS_PDF_FONT_SIZE.axis,
                    ) +
                      SEGMENT_LABEL_PADDING <=
                    drawnWidth;

                  segmentX += fullWidth;

                  return (
                    <G key={segment.key}>
                      <Rect
                        x={x}
                        y={barY}
                        width={drawnWidth}
                        height={barHeight}
                        rx={CORNER_RADIUS}
                        fill={segment.fill}
                        fillOpacity={row.isLighter ? LIGHTER_OPACITY : 1}
                      />
                      {canHoldLabel && (
                        <AnalyticsPdfSvgText
                          x={x + drawnWidth / 2}
                          y={getAnalyticsPdfBaseline(
                            centerY,
                            ANALYTICS_PDF_FONT_SIZE.axis,
                          )}
                          text={shareText}
                          fontSize={ANALYTICS_PDF_FONT_SIZE.axis}
                          color={
                            row.isLighter
                              ? ANALYTICS_PDF_COLOR.onLight
                              : segment.textColor
                          }
                          anchor="middle"
                        />
                      )}
                    </G>
                  );
                })}
            <AnalyticsPdfSvgText
              x={width}
              y={getAnalyticsPdfBaseline(centerY, ANALYTICS_PDF_FONT_SIZE.axis)}
              text={row.totalText}
              fontSize={ANALYTICS_PDF_FONT_SIZE.axis}
              color={ANALYTICS_PDF_COLOR.inkSecondary}
              anchor="end"
            />
          </G>
        );
      })}
    </Svg>
  );
};
