import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { type PointerEvent, useState } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { themeCssVariables } from 'twenty-ui/theme';

import { AnalyticsChartAxisText } from '@/crm-analytics/charts/AnalyticsChartAxisText';
import { ANALYTICS_CHART_CATEGORICAL_COLORS } from '@/crm-analytics/charts/AnalyticsChartCategoricalColors';
import { ANALYTICS_CHART_COLOR } from '@/crm-analytics/charts/AnalyticsChartColor';
import { AnalyticsChartLegend } from '@/crm-analytics/charts/AnalyticsChartLegend';
import { AnalyticsChartNoData } from '@/crm-analytics/charts/AnalyticsChartNoData';
import { type AnalyticsChartTooltipContent } from '@/crm-analytics/charts/AnalyticsChartTooltip';
import {
  buildAnalyticsAreaPath,
  buildAnalyticsLinePath,
  buildAnalyticsSplitLinePaths,
  getAnalyticsIsolatedPoints,
} from '@/crm-analytics/charts/buildAnalyticsLinePath';
import { getAnalyticsNiceTicks } from '@/crm-analytics/charts/getAnalyticsNiceTicks';
import { useAnalyticsChartTooltip } from '@/crm-analytics/charts/useAnalyticsChartTooltip';
import { useAnalyticsChartWidth } from '@/crm-analytics/charts/useAnalyticsChartWidth';
import { useNumberFormat } from '@/localization/hooks/useNumberFormat';

const SIZE_SETTINGS = {
  default: {
    height: 240,
    top: 12,
    right: 16,
    bottom: 24,
    left: 44,
    tickCount: 4,
    xLabelWidth: 72,
    endDotRadius: 4,
  },
  compact: {
    height: 96,
    top: 6,
    right: 8,
    bottom: 18,
    left: 36,
    tickCount: 2,
    xLabelWidth: 96,
    endDotRadius: 3,
  },
} as const;

const DIRECT_LABEL_MAX_SERIES = 5;
const DIRECT_VALUE_ROOM_IN_PX = 48;
const DIRECT_NAME_ROOM_IN_PX = 128;
const DIRECT_NAME_MAX_CHARACTERS = 14;
const DIRECT_LABEL_MIN_SPACING_IN_PX = 14;
const AREA_OPACITY = 0.1;
const LIGHTER_OPACITY = 0.45;

export type AnalyticsLineChartBucket = {
  key: string;
  // Short label for the axis.
  label: string;
  // Longer label for the tooltip, such as "Week of Nov 3".
  tooltipLabel?: string;
  // Still in progress: its segment draws lighter and the tooltip says "so far".
  isPartial?: boolean;
};

export type AnalyticsLineChartSeries = {
  key: string;
  label: string;
  // One per bucket, in the same order. Null leaves a gap and never falls to 0.
  values: (number | null)[];
  color?: string;
  // How many people or stays are behind each value. Under the minimum, a value draws lighter.
  sizes?: (number | null)[];
  minimumSample?: number;
  // Added after the value in the tooltip, such as "of 4 people".
  formatSize?: (size: number) => string;
};

const StyledRoot = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  min-width: 0;
`;

const StyledSvg = styled.svg`
  display: block;
  overflow: visible;
  touch-action: pan-y;
`;

const StyledDirectLabel = styled.text`
  fill: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.xs};
  font-variant-numeric: tabular-nums;
`;

const getLastKnownIndex = (values: (number | null)[]) =>
  values.reduce<number | null>(
    (lastIndex, value, index) => (isDefined(value) ? index : lastIndex),
    null,
  );

const isUnderMinimumAt = (
  { sizes, minimumSample }: AnalyticsLineChartSeries,
  index: number,
) => {
  const size = sizes?.[index];

  return isDefined(size) && isDefined(minimumSample) && size < minimumSample;
};

const shortenDirectLabel = (label: string) =>
  label.length > DIRECT_NAME_MAX_CHARACTERS
    ? `${label.slice(0, DIRECT_NAME_MAX_CHARACTERS - 1)}…`
    : label;

type AnalyticsLineChartProps = {
  // One line that says what the chart shows, for screen readers.
  ariaLabel: string;
  buckets: AnalyticsLineChartBucket[];
  series: AnalyticsLineChartSeries[];
  // The same buckets one period earlier, drawn in gray behind the main line.
  previousValues?: (number | null)[];
  previousLabel?: string;
  // Fills under the line. Only drawn when there is one series.
  hasArea?: boolean;
  size?: 'default' | 'compact';
  // Top of the axis, such as 1 for a rate. Defaults to a clean value above the data.
  maxValue?: number;
  formatValue?: (value: number) => string;
  isRate?: boolean;
  // Makes each legend entry a button.
  onSeriesClick?: (seriesKey: string) => void;
};

export const AnalyticsLineChart = ({
  ariaLabel,
  buckets,
  series,
  previousValues,
  previousLabel,
  hasArea = false,
  size = 'default',
  maxValue,
  formatValue,
  isRate = false,
  onSeriesClick,
}: AnalyticsLineChartProps) => {
  const { formatNumber } = useNumberFormat();
  const { widthRef, width } = useAnalyticsChartWidth();
  const { tooltip, showTooltip, moveTooltip, hideTooltip } =
    useAnalyticsChartTooltip();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const knownValues = [
    ...series.flatMap(({ values }) => values),
    ...(previousValues ?? []),
  ].filter(isDefined);

  if (buckets.length === 0 || knownValues.length === 0) {
    return <AnalyticsChartNoData />;
  }

  const settings = SIZE_SETTINGS[size];
  const formatLineValue =
    formatValue ?? ((value: number) => formatNumber(value));

  // Past the validated colors a series goes gray, because a new hue could not be told apart.
  const coloredSeries = series.map((line, index) => ({
    ...line,
    color:
      line.color ??
      ANALYTICS_CHART_CATEGORICAL_COLORS[index] ??
      ANALYTICS_CHART_COLOR.neutral,
  }));

  const hasDirectLabels =
    size === 'default' && series.length <= DIRECT_LABEL_MAX_SERIES;
  const directLabelRoom = !hasDirectLabels
    ? 0
    : series.length === 1
      ? DIRECT_VALUE_ROOM_IN_PX
      : DIRECT_NAME_ROOM_IN_PX;

  const ticks = getAnalyticsNiceTicks({
    maxValue: maxValue ?? Math.max(...knownValues),
    targetCount: settings.tickCount,
    hasOnlyWholeValues: knownValues.every(Number.isInteger),
    isRate,
  });
  const yTop = maxValue ?? ticks[ticks.length - 1];

  const plotRight = Math.max(
    width - Math.max(settings.right, directLabelRoom),
    settings.left + 1,
  );
  const plotWidth = plotRight - settings.left;
  const plotBottom = settings.height - settings.bottom;
  const plotHeight = plotBottom - settings.top;

  const toSvgX = (index: number) =>
    buckets.length === 1
      ? settings.left + plotWidth / 2
      : settings.left + (index / (buckets.length - 1)) * plotWidth;
  const toSvgY = (value: number) =>
    plotBottom - (Math.min(value, yTop) / yTop) * plotHeight;

  const toPoints = (values: (number | null)[]) =>
    buckets.map((_, index) => {
      const value = values[index];

      return isDefined(value) ? { x: toSvgX(index), y: toSvgY(value) } : null;
    });

  const lastBucketIndex = buckets.length - 1;

  const xLabelStride = Math.max(
    Math.ceil((buckets.length * settings.xLabelWidth) / plotWidth),
    1,
  );
  const shownXLabelIndexes = buckets
    .map((_, index) => index)
    .filter((index) => index % xLabelStride === 0);

  const handlePointerMove = (event: PointerEvent<SVGRectElement>) => {
    const plotBox = event.currentTarget.getBoundingClientRect();
    const position =
      plotBox.width > 0 ? (event.clientX - plotBox.left) / plotBox.width : 0;
    const nextIndex = Math.max(
      Math.min(Math.round(position * lastBucketIndex), lastBucketIndex),
      0,
    );

    if (nextIndex === hoveredIndex) {
      moveTooltip(event);

      return;
    }

    const bucket = buckets[nextIndex];

    const formatPointValue = (value: number | null | undefined) =>
      isDefined(value) ? formatLineValue(value) : t`Not enough data`;

    const formatSeriesValue = ({
      values,
      sizes,
      formatSize,
    }: AnalyticsLineChartSeries) => {
      const value = values[nextIndex];
      const size = sizes?.[nextIndex];

      if (!isDefined(value) || !isDefined(size) || !isDefined(formatSize)) {
        return formatPointValue(value);
      }

      const formattedValue = formatLineValue(value);
      const formattedSize = formatSize(size);

      return t`${formattedValue} ${formattedSize}`;
    };

    const hasKnownSmallSample = series.some(
      (line) =>
        isDefined(line.values[nextIndex]) && isUnderMinimumAt(line, nextIndex),
    );

    const content: AnalyticsChartTooltipContent = {
      title: bucket.tooltipLabel ?? bucket.label,
      rows: [
        ...coloredSeries.map((line) => ({
          label: line.label,
          color: line.color,
          value: formatSeriesValue(line),
        })),
        ...(isDefined(previousValues)
          ? [
              {
                label: previousLabel ?? t`Previous period`,
                color: ANALYTICS_CHART_COLOR.neutral,
                value: formatPointValue(previousValues[nextIndex]),
              },
            ]
          : []),
      ],
      note:
        [
          bucket.isPartial === true ? t`So far, still in progress.` : null,
          hasKnownSmallSample
            ? t`A small group, so read this with care.`
            : null,
        ]
          .filter(isDefined)
          .join(' ') || null,
    };

    setHoveredIndex(nextIndex);
    showTooltip(content, event);
  };

  const handlePointerLeave = () => {
    setHoveredIndex(null);
    hideTooltip();
  };

  const directLabelYs: number[] = [];
  const directLabels = !hasDirectLabels
    ? []
    : coloredSeries
        .flatMap(({ key, label, values }) => {
          const lastIndex = getLastKnownIndex(values);
          const lastValue = isDefined(lastIndex) ? values[lastIndex] : null;

          return isDefined(lastIndex) && isDefined(lastValue)
            ? [{ key, label, lastIndex, lastValue, y: toSvgY(lastValue) }]
            : [];
        })
        .sort((first, second) => first.y - second.y)
        .filter(({ y }) => {
          // Labels that would touch are dropped, not nudged, because a moved label loses its line.
          const isClear = directLabelYs.every(
            (placedY) =>
              Math.abs(placedY - y) >= DIRECT_LABEL_MIN_SPACING_IN_PX,
          );

          if (isClear) {
            directLabelYs.push(y);
          }

          return isClear;
        });

  const legendItems = [
    ...coloredSeries.map(({ key, label, color }) => ({
      key,
      label,
      color,
      onClick: isDefined(onSeriesClick) ? () => onSeriesClick(key) : undefined,
    })),
    ...(isDefined(previousValues)
      ? [
          {
            key: 'previous',
            label: previousLabel ?? t`Previous period`,
            color: ANALYTICS_CHART_COLOR.neutral,
          },
        ]
      : []),
  ];

  return (
    <StyledRoot ref={widthRef}>
      {legendItems.length > 1 && size === 'default' && (
        <AnalyticsChartLegend items={legendItems} keyShape="line" />
      )}
      <StyledSvg
        width={width}
        height={settings.height}
        role="img"
        aria-label={ariaLabel}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={settings.left}
              x2={plotRight}
              y1={toSvgY(tick)}
              y2={toSvgY(tick)}
              stroke={themeCssVariables.border.color.medium}
            />
            <AnalyticsChartAxisText
              x={settings.left - 6}
              y={toSvgY(tick)}
              textAnchor="end"
              dominantBaseline="middle"
            >
              {formatLineValue(tick)}
            </AnalyticsChartAxisText>
          </g>
        ))}
        {shownXLabelIndexes.map((index) => (
          <AnalyticsChartAxisText
            key={buckets[index].key}
            x={toSvgX(index)}
            y={plotBottom + 14}
            textAnchor={
              index === 0 && buckets.length > 1
                ? 'start'
                : index === lastBucketIndex && buckets.length > 1
                  ? 'end'
                  : 'middle'
            }
          >
            {buckets[index].label}
          </AnalyticsChartAxisText>
        ))}
        {isDefined(previousValues) && (
          <>
            <path
              d={buildAnalyticsLinePath(toPoints(previousValues))}
              fill="none"
              stroke={ANALYTICS_CHART_COLOR.neutral}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {getAnalyticsIsolatedPoints(toPoints(previousValues)).map(
              ({ x, y }) => (
                <circle
                  key={x}
                  cx={x}
                  cy={y}
                  r={3}
                  fill={ANALYTICS_CHART_COLOR.neutral}
                />
              ),
            )}
          </>
        )}
        {coloredSeries.map((line) => {
          const { key, values, color } = line;
          const points = toPoints(values);
          const isLighterAt = (index: number) =>
            buckets[index]?.isPartial === true || isUnderMinimumAt(line, index);
          const { solid, lighter } = buildAnalyticsSplitLinePaths(
            points,
            isLighterAt,
          );
          const lastIndex = getLastKnownIndex(values);
          const lastValue = isDefined(lastIndex) ? values[lastIndex] : null;

          return (
            <g key={key}>
              {hasArea && coloredSeries.length === 1 && (
                <path
                  d={buildAnalyticsAreaPath(points, plotBottom)}
                  fill={color}
                  fillOpacity={AREA_OPACITY}
                  stroke="none"
                />
              )}
              <path
                d={solid}
                fill="none"
                stroke={color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {lighter.length > 0 && (
                <path
                  d={lighter}
                  fill="none"
                  stroke={color}
                  strokeOpacity={LIGHTER_OPACITY}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              {getAnalyticsIsolatedPoints(points).map((point) => (
                <circle
                  key={point.x}
                  cx={point.x}
                  cy={point.y}
                  r={3}
                  fill={color}
                  fillOpacity={
                    isLighterAt(points.indexOf(point)) ? LIGHTER_OPACITY : 1
                  }
                />
              ))}
              {isDefined(lastIndex) && isDefined(lastValue) && (
                <circle
                  cx={toSvgX(lastIndex)}
                  cy={toSvgY(lastValue)}
                  r={settings.endDotRadius}
                  fill={color}
                  fillOpacity={isLighterAt(lastIndex) ? LIGHTER_OPACITY : 1}
                  stroke={themeCssVariables.background.primary}
                  strokeWidth={2}
                />
              )}
            </g>
          );
        })}
        {directLabels.map(({ key, label, lastIndex, lastValue, y }) => (
          <StyledDirectLabel
            key={key}
            x={toSvgX(lastIndex) + 8}
            y={y}
            dominantBaseline="middle"
          >
            {series.length === 1
              ? formatLineValue(lastValue)
              : `${shortenDirectLabel(label)} ${formatLineValue(lastValue)}`}
          </StyledDirectLabel>
        ))}
        {isDefined(hoveredIndex) && (
          <g pointerEvents="none">
            <line
              x1={toSvgX(hoveredIndex)}
              x2={toSvgX(hoveredIndex)}
              y1={settings.top}
              y2={plotBottom}
              stroke={themeCssVariables.border.color.strong}
            />
            {coloredSeries.map(({ key, values, color }) => {
              const value = values[hoveredIndex];

              return isDefined(value) ? (
                <circle
                  key={key}
                  cx={toSvgX(hoveredIndex)}
                  cy={toSvgY(value)}
                  r={settings.endDotRadius}
                  fill={color}
                  stroke={themeCssVariables.background.primary}
                  strokeWidth={2}
                />
              ) : null;
            })}
          </g>
        )}
        <rect
          x={settings.left}
          y={settings.top}
          width={plotWidth}
          height={plotHeight}
          fill="transparent"
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
        />
      </StyledSvg>
      {tooltip}
    </StyledRoot>
  );
};
