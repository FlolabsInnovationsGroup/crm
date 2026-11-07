import { styled } from '@linaria/react';
import { type PointerEvent, useState } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { themeCssVariables } from 'twenty-ui/theme';

import { ANALYTICS_CHART_COLOR } from '@/crm-analytics/charts/AnalyticsChartColor';
import { type AnalyticsChartTooltipContent } from '@/crm-analytics/charts/AnalyticsChartTooltip';
import {
  buildAnalyticsSplitLinePaths,
  getAnalyticsIsolatedPoints,
} from '@/crm-analytics/charts/buildAnalyticsLinePath';
import { useAnalyticsChartTooltip } from '@/crm-analytics/charts/useAnalyticsChartTooltip';
import { useAnalyticsChartWidth } from '@/crm-analytics/charts/useAnalyticsChartWidth';

const EDGE_ROOM_IN_PX = 4;
const END_DOT_RADIUS = 3;
const LIGHTER_OPACITY = 0.45;

export type AnalyticsSparklineMark = {
  tooltip: AnalyticsChartTooltipContent;
  // A small group: this value draws lighter.
  isLighter: boolean;
};

export type AnalyticsSparklineData = {
  values: (number | null)[];
  // One per value, in the same order.
  marks: AnalyticsSparklineMark[];
};

const StyledRoot = styled.div`
  min-width: 0;
  width: 100%;
`;

const StyledSvg = styled.svg`
  display: block;
  touch-action: pan-y;
`;

type AnalyticsSparklineProps = {
  // One line that says what the line shows, for screen readers.
  ariaLabel: string;
  // Null leaves a gap and never falls to 0.
  values: (number | null)[];
  marks?: AnalyticsSparklineMark[];
  height?: number;
  color?: string;
};

export const AnalyticsSparkline = ({
  ariaLabel,
  values,
  marks,
  height = 32,
  color = ANALYTICS_CHART_COLOR.accent,
}: AnalyticsSparklineProps) => {
  const { widthRef, width } = useAnalyticsChartWidth();
  const { tooltip, showTooltip, moveTooltip, hideTooltip } =
    useAnalyticsChartTooltip();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const knownValues = values.filter(isDefined);

  if (knownValues.length === 0) {
    return <StyledRoot ref={widthRef} style={{ height }} />;
  }

  const lowest = Math.min(...knownValues);
  const highest = Math.max(...knownValues);
  const range = highest - lowest;
  const drawableWidth = Math.max(width - EDGE_ROOM_IN_PX * 2, 1);
  const drawableHeight = height - EDGE_ROOM_IN_PX * 2;

  const toSvgX = (index: number) =>
    values.length === 1
      ? width / 2
      : EDGE_ROOM_IN_PX + (index / (values.length - 1)) * drawableWidth;

  // A flat line sits in the middle rather than on the floor, where it would read as zero.
  const toSvgY = (value: number) =>
    range === 0
      ? height / 2
      : EDGE_ROOM_IN_PX + (1 - (value - lowest) / range) * drawableHeight;

  const points = values.map((value, index) =>
    isDefined(value) ? { x: toSvgX(index), y: toSvgY(value) } : null,
  );
  const lastPoint = points.filter(isDefined).at(-1);

  const isLighterAt = (index: number) => marks?.[index]?.isLighter === true;
  const { solid, lighter } = buildAnalyticsSplitLinePaths(points, isLighterAt);

  const handlePointerMove = (event: PointerEvent<SVGRectElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const position =
      box.width > 0 ? (event.clientX - box.left) / box.width : 0;
    const nextIndex = Math.max(
      Math.min(Math.round(position * (values.length - 1)), values.length - 1),
      0,
    );

    if (nextIndex === hoveredIndex) {
      moveTooltip(event);

      return;
    }

    const content = marks?.[nextIndex]?.tooltip;

    setHoveredIndex(nextIndex);

    if (isDefined(content)) {
      showTooltip(content, event);
    }
  };

  const handlePointerLeave = () => {
    setHoveredIndex(null);
    hideTooltip();
  };

  const hoveredPoint = isDefined(hoveredIndex) ? points[hoveredIndex] : null;

  return (
    <StyledRoot ref={widthRef} role="img" aria-label={ariaLabel}>
      <StyledSvg width={width} height={height} aria-hidden="true">
        <path
          d={solid}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {lighter.length > 0 && (
          <path
            d={lighter}
            fill="none"
            stroke={color}
            strokeOpacity={LIGHTER_OPACITY}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {getAnalyticsIsolatedPoints(points).map((point) => (
          <circle
            key={point.x}
            cx={point.x}
            cy={point.y}
            r={2}
            fill={color}
            fillOpacity={
              isLighterAt(points.indexOf(point)) ? LIGHTER_OPACITY : 1
            }
          />
        ))}
        {isDefined(lastPoint) && (
          <circle
            cx={lastPoint.x}
            cy={lastPoint.y}
            r={END_DOT_RADIUS}
            fill={color}
            fillOpacity={
              isLighterAt(points.indexOf(lastPoint)) ? LIGHTER_OPACITY : 1
            }
            stroke={themeCssVariables.background.primary}
            strokeWidth={1}
          />
        )}
        {isDefined(hoveredIndex) && (
          <g pointerEvents="none">
            <line
              x1={toSvgX(hoveredIndex)}
              x2={toSvgX(hoveredIndex)}
              y1={0}
              y2={height}
              stroke={themeCssVariables.border.color.strong}
            />
            {isDefined(hoveredPoint) && (
              <circle
                cx={hoveredPoint.x}
                cy={hoveredPoint.y}
                r={END_DOT_RADIUS}
                fill={color}
              />
            )}
          </g>
        )}
        <rect
          x={0}
          y={0}
          width={width}
          height={height}
          fill="transparent"
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
        />
      </StyledSvg>
      {tooltip}
    </StyledRoot>
  );
};
