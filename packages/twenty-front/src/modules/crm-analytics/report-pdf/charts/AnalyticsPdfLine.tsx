import { Circle, G, Line, Path, Svg } from '@react-pdf/renderer';
import { isDefined } from 'twenty-shared/utils';

import {
  buildAnalyticsAreaPath,
  buildAnalyticsLinePath,
  getAnalyticsIsolatedPoints,
  type AnalyticsLinePoint,
} from '@/crm-analytics/charts/buildAnalyticsLinePath';
import { getAnalyticsNiceTicks } from '@/crm-analytics/charts/getAnalyticsNiceTicks';
import {
  AnalyticsPdfSvgText,
  getAnalyticsPdfBaseline,
} from '@/crm-analytics/report-pdf/charts/AnalyticsPdfSvgText';
import { ANALYTICS_PDF_COLOR } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfColor';
import { ANALYTICS_PDF_FONT_SIZE } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfFontSize';
import { ANALYTICS_PDF_LINE_DASH } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfLineDash';
import { estimateAnalyticsPdfTextWidth } from '@/crm-analytics/report-pdf/utils/fitAnalyticsPdfLabel';

const LEFT_BAND = 28;
const RIGHT_BAND = 40;
const TOP_BAND = 6;
const BOTTOM_BAND = 14;
const TICK_GAP = 5;
const END_LABEL_GAP = 6;
const END_DETAIL_OFFSET = 7;
const LINE_WIDTH = 1.75;
const PREVIOUS_LINE_WIDTH = 1.25;
const AREA_OPACITY = 0.1;
const END_DOT_RADIUS = 2.75;
const END_DOT_RING = 1.25;
const HOLLOW_DOT_STROKE = 1.25;
const ISOLATED_DOT_RADIUS = 2;
const X_LABEL_GAP = 8;
const TARGET_TICK_COUNT = 3;

export type AnalyticsPdfLineChartPoint = {
  key: string;
  label: string;
  value: number | null;
  previousValue: number | null;
  isLighter: boolean;
  // Printed under the end label, so a small group's last value still shows its count.
  shortDetail: string | null;
};

type AnalyticsPdfLineProps = {
  points: AnalyticsPdfLineChartPoint[];
  width: number;
  height: number;
  formatValue: (value: number) => string;
  formatTick: (value: number) => string;
  hasOnlyWholeValues: boolean;
  isRate?: boolean;
  hasArea?: boolean;
};

const roundCoordinate = (value: number) => Math.round(value * 100) / 100;

export const AnalyticsPdfLine = ({
  points,
  width,
  height,
  formatValue,
  formatTick,
  hasOnlyWholeValues,
  isRate = false,
  hasArea = false,
}: AnalyticsPdfLineProps) => {
  const plotLeft = LEFT_BAND;
  const plotRight = width - RIGHT_BAND;
  const plotBottom = height - BOTTOM_BAND;
  const plotHeight = plotBottom - TOP_BAND;
  const slotWidth =
    points.length > 1 ? (plotRight - plotLeft) / (points.length - 1) : 0;
  const maximumValue = Math.max(
    0,
    ...points.flatMap(({ value, previousValue }) => [
      value ?? 0,
      previousValue ?? 0,
    ]),
  );
  const ticks = getAnalyticsNiceTicks({
    maxValue: maximumValue,
    targetCount: TARGET_TICK_COUNT,
    hasOnlyWholeValues,
    isRate,
  });
  const scaleMaximum = ticks[ticks.length - 1];
  const getY = (value: number) =>
    roundCoordinate(plotBottom - (value / scaleMaximum) * plotHeight);
  const getX = (pointIndex: number) =>
    roundCoordinate(
      points.length > 1
        ? plotLeft + pointIndex * slotWidth
        : (plotLeft + plotRight) / 2,
    );
  const toLinePoints = (
    getValue: (point: AnalyticsPdfLineChartPoint) => number | null,
  ): AnalyticsLinePoint[] =>
    points.map((point, pointIndex) => {
      const value = getValue(point);

      return isDefined(value) ? { x: getX(pointIndex), y: getY(value) } : null;
    });

  const currentPoints = toLinePoints(({ value }) => value);
  const previousPoints = toLinePoints(({ previousValue }) => previousValue);
  // The whole line is drawn dotted, so only small-sample stretches show past the firm ones on top.
  const firmPoints = toLinePoints(({ value, isLighter }) =>
    isLighter ? null : value,
  );
  const hasLighterPoints = points.some(
    ({ value, isLighter }) => isDefined(value) && isLighter,
  );
  const lastKnownIndex = points.reduce(
    (lastIndex, { value }, pointIndex) =>
      isDefined(value) ? pointIndex : lastIndex,
    -1,
  );
  const lastKnownPoint = points[lastKnownIndex];
  const longestLabelWidth = Math.max(
    0,
    ...points.map(({ label }) =>
      estimateAnalyticsPdfTextWidth(label, ANALYTICS_PDF_FONT_SIZE.axis),
    ),
  );
  const labelEvery =
    slotWidth > 0
      ? Math.max(1, Math.ceil((longestLabelWidth + X_LABEL_GAP) / slotWidth))
      : 1;

  return (
    <Svg width={width} height={height}>
      {ticks.map((tick) => (
        <G key={tick}>
          <Line
            x1={plotLeft}
            y1={getY(tick)}
            x2={plotRight}
            y2={getY(tick)}
            stroke={
              tick === 0
                ? ANALYTICS_PDF_COLOR.baseline
                : ANALYTICS_PDF_COLOR.hairline
            }
            strokeWidth={tick === 0 ? 0.75 : 0.5}
          />
          <AnalyticsPdfSvgText
            x={plotLeft - TICK_GAP}
            y={getAnalyticsPdfBaseline(
              getY(tick),
              ANALYTICS_PDF_FONT_SIZE.axis,
            )}
            text={formatTick(tick)}
            fontSize={ANALYTICS_PDF_FONT_SIZE.axis}
            color={ANALYTICS_PDF_COLOR.inkMuted}
            anchor="end"
          />
        </G>
      ))}
      {points.map(({ key, label }, pointIndex) =>
        (points.length - 1 - pointIndex) % labelEvery === 0 ? (
          <AnalyticsPdfSvgText
            key={key}
            x={getX(pointIndex)}
            y={height - 3}
            text={label}
            fontSize={ANALYTICS_PDF_FONT_SIZE.axis}
            color={ANALYTICS_PDF_COLOR.inkMuted}
            anchor="middle"
          />
        ) : null,
      )}
      {hasArea && (
        <Path
          d={buildAnalyticsAreaPath(currentPoints, plotBottom)}
          fill={ANALYTICS_PDF_COLOR.accent}
          fillOpacity={AREA_OPACITY}
        />
      )}
      {previousPoints.some(isDefined) && (
        <Path
          d={buildAnalyticsLinePath(previousPoints)}
          stroke={ANALYTICS_PDF_COLOR.neutral}
          strokeWidth={PREVIOUS_LINE_WIDTH}
          strokeDasharray={ANALYTICS_PDF_LINE_DASH.previous}
          strokeLinejoin="round"
          fill="none"
        />
      )}
      {hasLighterPoints && (
        <Path
          d={buildAnalyticsLinePath(currentPoints)}
          stroke={ANALYTICS_PDF_COLOR.accent}
          strokeWidth={LINE_WIDTH}
          strokeDasharray={ANALYTICS_PDF_LINE_DASH.smallGroup}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      )}
      <Path
        d={buildAnalyticsLinePath(firmPoints)}
        stroke={ANALYTICS_PDF_COLOR.accent}
        strokeWidth={LINE_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {getAnalyticsIsolatedPoints(currentPoints).map(({ x, y }) => (
        <Circle
          key={x}
          cx={x}
          cy={y}
          r={ISOLATED_DOT_RADIUS}
          fill={ANALYTICS_PDF_COLOR.surface}
          stroke={ANALYTICS_PDF_COLOR.accent}
          strokeWidth={HOLLOW_DOT_STROKE}
        />
      ))}
      {getAnalyticsIsolatedPoints(firmPoints).map(({ x, y }) => (
        <Circle
          key={x}
          cx={x}
          cy={y}
          r={ISOLATED_DOT_RADIUS}
          fill={ANALYTICS_PDF_COLOR.accent}
        />
      ))}
      {isDefined(lastKnownPoint) && isDefined(lastKnownPoint.value) && (
        <>
          <Circle
            cx={getX(lastKnownIndex)}
            cy={getY(lastKnownPoint.value)}
            r={END_DOT_RADIUS + END_DOT_RING}
            fill={ANALYTICS_PDF_COLOR.surface}
          />
          <Circle
            cx={getX(lastKnownIndex)}
            cy={getY(lastKnownPoint.value)}
            r={END_DOT_RADIUS}
            fill={
              lastKnownPoint.isLighter
                ? ANALYTICS_PDF_COLOR.surface
                : ANALYTICS_PDF_COLOR.accent
            }
            stroke={ANALYTICS_PDF_COLOR.accent}
            strokeWidth={lastKnownPoint.isLighter ? HOLLOW_DOT_STROKE : 0}
          />
          <AnalyticsPdfSvgText
            x={getX(lastKnownIndex) + END_LABEL_GAP}
            y={getAnalyticsPdfBaseline(
              getY(lastKnownPoint.value),
              ANALYTICS_PDF_FONT_SIZE.label,
            )}
            text={formatValue(lastKnownPoint.value)}
            isBold={!lastKnownPoint.isLighter}
            color={
              lastKnownPoint.isLighter
                ? ANALYTICS_PDF_COLOR.inkSecondary
                : ANALYTICS_PDF_COLOR.ink
            }
          />
          {isDefined(lastKnownPoint.shortDetail) && (
            <AnalyticsPdfSvgText
              x={getX(lastKnownIndex) + END_LABEL_GAP}
              y={
                getAnalyticsPdfBaseline(
                  getY(lastKnownPoint.value),
                  ANALYTICS_PDF_FONT_SIZE.label,
                ) + END_DETAIL_OFFSET
              }
              text={lastKnownPoint.shortDetail}
              fontSize={ANALYTICS_PDF_FONT_SIZE.cellDetail}
              color={ANALYTICS_PDF_COLOR.inkSecondary}
            />
          )}
        </>
      )}
    </Svg>
  );
};
