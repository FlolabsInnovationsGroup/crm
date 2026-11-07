import { styled } from '@linaria/react';
import { arc, pie, type PieArcDatum } from 'd3-shape';
import { isDefined } from 'twenty-shared/utils';
import { themeCssVariables } from 'twenty-ui/theme';

import { ANALYTICS_CHART_COLOR } from '@/crm-analytics/charts/AnalyticsChartColor';
import { AnalyticsChartNoData } from '@/crm-analytics/charts/AnalyticsChartNoData';
import { type AnalyticsChartTooltipContent } from '@/crm-analytics/charts/AnalyticsChartTooltip';
import { useAnalyticsChartTooltip } from '@/crm-analytics/charts/useAnalyticsChartTooltip';
import { formatAnalyticsRate } from '@/crm-analytics/utils/formatAnalyticsRate';
import { useNumberFormat } from '@/localization/hooks/useNumberFormat';

const MAXIMUM_SLICES = 4;
const SIZE_IN_PX = 168;
const OUTER_RADIUS = SIZE_IN_PX / 2;
const INNER_RADIUS = OUTER_RADIUS - 22;
const SLICE_GAP_IN_RADIANS = 0.03;

const DEFAULT_COLORS = [
  ANALYTICS_CHART_COLOR.accent,
  ANALYTICS_CHART_COLOR.accentStrong,
  ANALYTICS_CHART_COLOR.neutralStrong,
  ANALYTICS_CHART_COLOR.neutralSoft,
];

export type AnalyticsDonutSlice = {
  key: string;
  label: string;
  value: number;
  color?: string;
  tooltip?: AnalyticsChartTooltipContent;
};

const StyledRoot = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[4]};
  justify-content: center;
  min-width: 0;
`;

const StyledRing = styled.div`
  flex-shrink: 0;
  position: relative;
`;

const StyledSlice = styled.path`
  &:hover {
    filter: brightness(1.08);
  }
`;

const StyledCenter = styled.div`
  align-items: center;
  bottom: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  left: 0;
  pointer-events: none;
  position: absolute;
  right: 0;
  top: 0;
`;

const StyledTotal = styled.span`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.xl};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  letter-spacing: -0.01em;
`;

const StyledTotalLabel = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
`;

const StyledLabels = styled.ul`
  display: flex;
  flex: 1 1 160px;
  flex-direction: column;
  font-size: ${themeCssVariables.font.size.sm};
  gap: ${themeCssVariables.spacing[2]};
  list-style: none;
  margin: 0;
  min-width: 0;
  padding: 0;
`;

const StyledLabelRow = styled.li`
  align-items: center;
  display: grid;
  gap: ${themeCssVariables.spacing[2]};
  grid-template-columns: 10px minmax(0, 1fr) auto;
`;

const StyledSwatch = styled.span`
  border-radius: ${themeCssVariables.border.radius.xs};
  height: 10px;
  width: 10px;
`;

const StyledSliceName = styled.span`
  color: ${themeCssVariables.font.color.primary};
  overflow-wrap: anywhere;
`;

const StyledSliceValue = styled.span`
  color: ${themeCssVariables.font.color.secondary};
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
`;

type AnalyticsDonutChartProps = {
  // One line that says what the chart shows, for screen readers.
  ariaLabel: string;
  // Up to 4, in the order they should go around the ring.
  slices: AnalyticsDonutSlice[];
  // What the total in the center counts, such as "people".
  totalLabel?: string;
  formatValue?: (value: number) => string;
};

export const AnalyticsDonutChart = ({
  ariaLabel,
  slices,
  totalLabel,
  formatValue,
}: AnalyticsDonutChartProps) => {
  const { formatNumber } = useNumberFormat();
  const { tooltip, showTooltip, moveTooltip, hideTooltip } =
    useAnalyticsChartTooltip();

  const shownSlices = slices
    .slice(0, MAXIMUM_SLICES)
    .map((slice, index) => ({
      ...slice,
      color: slice.color ?? DEFAULT_COLORS[index],
    }));

  const total = shownSlices.reduce((sum, { value }) => sum + value, 0);

  if (shownSlices.length === 0 || total <= 0) {
    return <AnalyticsChartNoData />;
  }

  const formatSliceValue =
    formatValue ?? ((value: number) => formatNumber(value));

  const drawnSlices = shownSlices.filter(({ value }) => value > 0);

  const buildArcs = pie<(typeof drawnSlices)[number]>()
    .value(({ value }) => value)
    .sort(null)
    .padAngle(drawnSlices.length > 1 ? SLICE_GAP_IN_RADIANS : 0);

  const buildArcPath = arc<PieArcDatum<(typeof drawnSlices)[number]>>()
    .innerRadius(INNER_RADIUS)
    .outerRadius(OUTER_RADIUS)
    // A full gap would erase a very small slice, leaving nothing to see or hover.
    .padAngle((sliceArc) =>
      Math.min(
        sliceArc.padAngle,
        (sliceArc.endAngle - sliceArc.startAngle) / 2,
      ),
    );

  return (
    <StyledRoot>
      <StyledRing style={{ height: SIZE_IN_PX, width: SIZE_IN_PX }}>
        <svg
          width={SIZE_IN_PX}
          height={SIZE_IN_PX}
          viewBox={`${-OUTER_RADIUS} ${-OUTER_RADIUS} ${SIZE_IN_PX} ${SIZE_IN_PX}`}
          role="img"
          aria-label={ariaLabel}
        >
          {buildArcs(drawnSlices).map((sliceArc) => {
            const slice = sliceArc.data;
            const share = formatAnalyticsRate(slice.value / total) ?? '';
            const content: AnalyticsChartTooltipContent = slice.tooltip ?? {
              title: slice.label,
              rows: [
                {
                  label: share,
                  value: formatSliceValue(slice.value),
                  color: slice.color,
                },
              ],
            };

            return (
              <StyledSlice
                key={slice.key}
                d={buildArcPath(sliceArc) ?? undefined}
                fill={slice.color}
                onPointerEnter={(event) => showTooltip(content, event)}
                onPointerMove={moveTooltip}
                onPointerLeave={hideTooltip}
              />
            );
          })}
        </svg>
        <StyledCenter>
          <StyledTotal>{formatSliceValue(total)}</StyledTotal>
          {isDefined(totalLabel) && (
            <StyledTotalLabel>{totalLabel}</StyledTotalLabel>
          )}
        </StyledCenter>
      </StyledRing>
      <StyledLabels>
        {shownSlices.map((slice) => (
          <StyledLabelRow key={slice.key}>
            <StyledSwatch style={{ background: slice.color }} />
            <StyledSliceName>{slice.label}</StyledSliceName>
            <StyledSliceValue>
              {formatSliceValue(slice.value)}
              {' · '}
              {formatAnalyticsRate(slice.value / total)}
            </StyledSliceValue>
          </StyledLabelRow>
        ))}
      </StyledLabels>
      {tooltip}
    </StyledRoot>
  );
};
