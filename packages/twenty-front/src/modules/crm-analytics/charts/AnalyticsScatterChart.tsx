import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';
import { themeCssVariables } from 'twenty-ui/theme';

import { activateAnalyticsChartMarkOnKey } from '@/crm-analytics/charts/activateAnalyticsChartMarkOnKey';
import { AnalyticsChartAxisText } from '@/crm-analytics/charts/AnalyticsChartAxisText';
import { ANALYTICS_CHART_COLOR } from '@/crm-analytics/charts/AnalyticsChartColor';
import { AnalyticsChartNoData } from '@/crm-analytics/charts/AnalyticsChartNoData';
import { type AnalyticsChartTooltipContent } from '@/crm-analytics/charts/AnalyticsChartTooltip';
import { getAnalyticsNiceTicks } from '@/crm-analytics/charts/getAnalyticsNiceTicks';
import { useAnalyticsChartTooltip } from '@/crm-analytics/charts/useAnalyticsChartTooltip';
import { useAnalyticsChartWidth } from '@/crm-analytics/charts/useAnalyticsChartWidth';
import { useNumberFormat } from '@/localization/hooks/useNumberFormat';

const MARGIN = { top: 20, right: 16, bottom: 40, left: 44 };
const POINT_RADIUS = 5;
const HIT_RADIUS = 12;
const SMALL_SAMPLE_OPACITY = 0.45;
const LABEL_CHARACTER_WIDTH_IN_PX = 6.5;
const LABEL_HEIGHT_IN_PX = 14;
const LABEL_GAP_IN_PX = 8;
const LABEL_MAX_CHARACTERS = 20;
const X_TICK_WIDTH_IN_PX = 56;

export type AnalyticsScatterPoint = {
  key: string;
  label: string;
  x: number;
  // Null is unknown: the point is left out and counted under the chart, never drawn at 0.
  y: number | null;
  isSmallSample?: boolean;
  tooltip?: AnalyticsChartTooltipContent;
};

const StyledRoot = styled.div`
  min-width: 0;
`;

const StyledSvg = styled.svg`
  display: block;
  overflow: visible;
`;

const StyledPointGroup = styled.g<{ isClickable: boolean }>`
  cursor: ${({ isClickable }) => (isClickable ? 'pointer' : 'default')};
  outline: none;

  &:focus-visible circle:last-of-type,
  &:hover circle:last-of-type {
    stroke: ${themeCssVariables.font.color.primary};
  }
`;

const StyledPointLabel = styled.text`
  fill: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.xs};
  pointer-events: none;
`;

const StyledLeftOut = styled.p`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
  margin: ${themeCssVariables.spacing[1]} 0 0;
`;

const getMedian = (values: number[]) => {
  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};

const shortenLabel = (label: string) =>
  label.length > LABEL_MAX_CHARACTERS
    ? `${label.slice(0, LABEL_MAX_CHARACTERS - 1)}…`
    : label;

type LabelBox = { left: number; right: number; top: number; bottom: number };

type LabelPlacement = { text: string; side: 'left' | 'right' };

const doBoxesOverlap = (first: LabelBox, second: LabelBox) =>
  first.left < second.right &&
  second.left < first.right &&
  first.top < second.bottom &&
  second.top < first.bottom;

type AnalyticsScatterChartProps = {
  // One line that says what the chart shows, for screen readers.
  ariaLabel: string;
  points: AnalyticsScatterPoint[];
  xLabel: string;
  yLabel: string;
  formatX?: (value: number) => string;
  formatY?: (value: number) => string;
  isYRate?: boolean;
  height?: number;
  onPointClick?: (pointKey: string) => void;
};

export const AnalyticsScatterChart = ({
  ariaLabel,
  points,
  xLabel,
  yLabel,
  formatX,
  formatY,
  isYRate = false,
  height = 300,
  onPointClick,
}: AnalyticsScatterChartProps) => {
  const { formatNumber } = useNumberFormat();
  const { widthRef, width } = useAnalyticsChartWidth();
  const {
    tooltip,
    showTooltip,
    showTooltipAtElement,
    moveTooltip,
    hideTooltip,
  } = useAnalyticsChartTooltip();

  const plotted = points.flatMap((point) =>
    isDefined(point.y) ? [{ ...point, y: point.y }] : [],
  );

  if (plotted.length === 0) {
    return <AnalyticsChartNoData />;
  }

  const formatXValue = formatX ?? ((value: number) => formatNumber(value));
  const formatYValue = formatY ?? ((value: number) => formatNumber(value));

  const xTicks = getAnalyticsNiceTicks({
    maxValue: Math.max(...plotted.map(({ x }) => x)),
    hasOnlyWholeValues: plotted.every(({ x }) => Number.isInteger(x)),
  });
  const yTicks = getAnalyticsNiceTicks({
    maxValue: Math.max(...plotted.map(({ y }) => y)),
    isRate: isYRate,
  });
  const xTop = xTicks[xTicks.length - 1];
  const yTop = yTicks[yTicks.length - 1];

  const plotWidth = Math.max(width - MARGIN.left - MARGIN.right, 1);
  const plotHeight = height - MARGIN.top - MARGIN.bottom;
  const plotRight = MARGIN.left + plotWidth;
  const plotBottom = MARGIN.top + plotHeight;

  const toSvgX = (value: number) => MARGIN.left + (value / xTop) * plotWidth;
  const toSvgY = (value: number) => plotBottom - (value / yTop) * plotHeight;

  const xMedian = getMedian(plotted.map(({ x }) => x));
  const yMedian = getMedian(plotted.map(({ y }) => y));

  const xTickStride = Math.ceil(
    (xTicks.length * X_TICK_WIDTH_IN_PX) / plotWidth,
  );

  // Greedy placement: right of the point, then left. A label that still collides stays in the tooltip.
  const placedBoxes: LabelBox[] = [];
  const labelPlacements = new Map<string, LabelPlacement>();

  plotted.forEach((point) => {
    const text = shortenLabel(point.label);
    const textWidth = text.length * LABEL_CHARACTER_WIDTH_IN_PX;
    const svgX = toSvgX(point.x);
    const svgY = toSvgY(point.y);
    const top = svgY - LABEL_HEIGHT_IN_PX / 2;
    const bottom = svgY + LABEL_HEIGHT_IN_PX / 2;

    const rightBox = {
      left: svgX + LABEL_GAP_IN_PX,
      right: svgX + LABEL_GAP_IN_PX + textWidth,
      top,
      bottom,
    };
    const leftBox = {
      left: svgX - LABEL_GAP_IN_PX - textWidth,
      right: svgX - LABEL_GAP_IN_PX,
      top,
      bottom,
    };

    const isFree = (box: LabelBox) =>
      box.left >= 0 &&
      box.right <= width &&
      !placedBoxes.some((placed) => doBoxesOverlap(box, placed));

    if (isFree(rightBox)) {
      placedBoxes.push(rightBox);
      labelPlacements.set(point.key, { text, side: 'right' });
    } else if (isFree(leftBox)) {
      placedBoxes.push(leftBox);
      labelPlacements.set(point.key, { text, side: 'left' });
    }
  });

  const leftOutCount = points.length - plotted.length;

  return (
    <StyledRoot
      ref={widthRef}
      role={isDefined(onPointClick) ? 'group' : 'img'}
      aria-label={ariaLabel}
    >
      <StyledSvg width={width} height={height}>
        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={MARGIN.left}
              x2={plotRight}
              y1={toSvgY(tick)}
              y2={toSvgY(tick)}
              stroke={themeCssVariables.border.color.medium}
            />
            <AnalyticsChartAxisText
              x={MARGIN.left - 6}
              y={toSvgY(tick)}
              textAnchor="end"
              dominantBaseline="middle"
            >
              {formatYValue(tick)}
            </AnalyticsChartAxisText>
          </g>
        ))}
        {xTicks
          .filter((_, index) => index % xTickStride === 0)
          .map((tick) => (
            <AnalyticsChartAxisText
              key={tick}
              x={toSvgX(tick)}
              y={plotBottom + 16}
              textAnchor="middle"
            >
              {formatXValue(tick)}
            </AnalyticsChartAxisText>
          ))}
        <AnalyticsChartAxisText
          x={MARGIN.left + plotWidth / 2}
          y={height - 4}
          textAnchor="middle"
        >
          {xLabel}
        </AnalyticsChartAxisText>
        <AnalyticsChartAxisText x={MARGIN.left + 4} y={MARGIN.top - 2}>
          {yLabel}
        </AnalyticsChartAxisText>
        <line
          x1={toSvgX(xMedian)}
          x2={toSvgX(xMedian)}
          y1={MARGIN.top}
          y2={plotBottom}
          stroke={themeCssVariables.border.color.strong}
        />
        <line
          x1={MARGIN.left}
          x2={plotRight}
          y1={toSvgY(yMedian)}
          y2={toSvgY(yMedian)}
          stroke={themeCssVariables.border.color.strong}
        />
        <AnalyticsChartAxisText
          x={plotRight}
          y={toSvgY(yMedian) - 4}
          textAnchor="end"
        >
          {t`Median`}
        </AnalyticsChartAxisText>
        {plotted.map((point) => {
          const svgX = toSvgX(point.x);
          const svgY = toSvgY(point.y);
          const placement = labelPlacements.get(point.key);
          const isClickable = isDefined(onPointClick);
          const activate = () => onPointClick?.(point.key);

          const content: AnalyticsChartTooltipContent = point.tooltip ?? {
            title: point.label,
            rows: [
              { label: xLabel, value: formatXValue(point.x) },
              { label: yLabel, value: formatYValue(point.y) },
            ],
          };

          return (
            <StyledPointGroup
              key={point.key}
              isClickable={isClickable}
              role={isClickable ? 'button' : undefined}
              tabIndex={isClickable ? 0 : undefined}
              aria-label={isClickable ? point.label : undefined}
              onClick={isClickable ? activate : undefined}
              onKeyDown={
                isClickable
                  ? activateAnalyticsChartMarkOnKey(activate)
                  : undefined
              }
              onFocus={(event) =>
                showTooltipAtElement(content, event.currentTarget)
              }
              onBlur={hideTooltip}
              onPointerEnter={(event) => showTooltip(content, event)}
              onPointerMove={moveTooltip}
              onPointerLeave={hideTooltip}
            >
              {isDefined(placement) && (
                <StyledPointLabel
                  x={
                    placement.side === 'right'
                      ? svgX + LABEL_GAP_IN_PX
                      : svgX - LABEL_GAP_IN_PX
                  }
                  y={svgY}
                  textAnchor={placement.side === 'right' ? 'start' : 'end'}
                  dominantBaseline="middle"
                >
                  {placement.text}
                </StyledPointLabel>
              )}
              <circle cx={svgX} cy={svgY} r={HIT_RADIUS} fill="transparent" />
              <circle
                cx={svgX}
                cy={svgY}
                r={POINT_RADIUS}
                fill={ANALYTICS_CHART_COLOR.accent}
                fillOpacity={point.isSmallSample ? SMALL_SAMPLE_OPACITY : 1}
                stroke={themeCssVariables.background.primary}
                strokeWidth={2}
              />
            </StyledPointGroup>
          );
        })}
      </StyledSvg>
      {leftOutCount > 0 && (
        <StyledLeftOut>
          {t`${leftOutCount} not shown because there is not enough data yet.`}
        </StyledLeftOut>
      )}
      {tooltip}
    </StyledRoot>
  );
};
