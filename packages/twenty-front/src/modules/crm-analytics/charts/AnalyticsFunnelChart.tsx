import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { Fragment } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { themeCssVariables } from 'twenty-ui/theme';

import { ANALYTICS_CHART_COLOR } from '@/crm-analytics/charts/AnalyticsChartColor';
import { AnalyticsChartNoData } from '@/crm-analytics/charts/AnalyticsChartNoData';
import { type AnalyticsChartTooltipContent } from '@/crm-analytics/charts/AnalyticsChartTooltip';
import { AnalyticsChartUnknownValue } from '@/crm-analytics/charts/AnalyticsChartUnknownValue';
import { useAnalyticsChartTooltip } from '@/crm-analytics/charts/useAnalyticsChartTooltip';
import { useAnalyticsChartWidth } from '@/crm-analytics/charts/useAnalyticsChartWidth';
import { useNumberFormat } from '@/localization/hooks/useNumberFormat';

const COUNT_CHARACTER_WIDTH_IN_PX = 8;
const COUNT_PADDING_IN_PX = 16;
const CONNECTOR_OPACITY = 0.12;
const LOWEST_CONNECTOR_OPACITY = 0.32;

export type AnalyticsFunnelStep = {
  key: string;
  label: string;
  count: number;
  // Percent moving on to the next step, such as "45%" or "12% so far". Null is unknown and shows a dash.
  moveOnLabel?: string | null;
  // Small sample or still in progress: draws lighter.
  isMoveOnMuted?: boolean;
  tooltip?: AnalyticsChartTooltipContent;
  moveOnTooltip?: AnalyticsChartTooltipContent;
};

const StyledGrid = styled.div`
  align-items: center;
  column-gap: ${themeCssVariables.spacing[2]};
  display: grid;
  font-size: ${themeCssVariables.font.size.sm};
  grid-template-columns: minmax(72px, 24%) minmax(0, 1fr) minmax(72px, auto);
`;

const StyledStageLabel = styled.span`
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  color: ${themeCssVariables.font.color.primary};
  display: -webkit-box;
  grid-column: 1;
  line-height: 1.2;
  min-width: 0;
  overflow: hidden;
  overflow-wrap: anywhere;
`;

const StyledBarCell = styled.div`
  align-items: center;
  display: flex;
  grid-column: 2;
  height: 28px;
  justify-content: center;
  min-width: 0;
  position: relative;
`;

const StyledBar = styled.div`
  align-items: center;
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.onAccent};
  display: flex;
  font-variant-numeric: tabular-nums;
  font-weight: ${themeCssVariables.font.weight.medium};
  height: 100%;
  justify-content: center;
  min-width: 2px;

  &:hover {
    filter: brightness(1.08);
  }
`;

const StyledOutsideCount = styled.span`
  color: ${themeCssVariables.font.color.primary};
  font-variant-numeric: tabular-nums;
  padding-inline-start: ${themeCssVariables.spacing[1]};
  position: absolute;
`;

const StyledConnector = styled.svg`
  display: block;
  grid-column: 2;
  height: 22px;
  width: 100%;
`;

const StyledMoveOn = styled.div<{ isMuted: boolean }>`
  align-items: center;
  color: ${({ isMuted }) =>
    isMuted
      ? themeCssVariables.font.color.tertiary
      : themeCssVariables.font.color.secondary};
  display: flex;
  font-size: ${themeCssVariables.font.size.xs};
  font-variant-numeric: tabular-nums;
  gap: ${themeCssVariables.spacing[1]};
  grid-column: 3;
  white-space: nowrap;
`;

const StyledLowestMark = styled.span`
  color: ${themeCssVariables.font.color.primary};
  font-weight: ${themeCssVariables.font.weight.medium};
`;

type AnalyticsFunnelChartProps = {
  // One line that says what the chart shows, for screen readers.
  ariaLabel: string;
  steps: AnalyticsFunnelStep[];
  lowestStepKey?: string | null;
  formatValue?: (value: number) => string;
};

export const AnalyticsFunnelChart = ({
  ariaLabel,
  steps,
  lowestStepKey,
  formatValue,
}: AnalyticsFunnelChartProps) => {
  const { formatNumber } = useNumberFormat();
  const { widthRef, width: funnelWidth } = useAnalyticsChartWidth();
  const { tooltip, showTooltip, moveTooltip, hideTooltip } =
    useAnalyticsChartTooltip();

  if (steps.length === 0) {
    return <AnalyticsChartNoData />;
  }

  const formatCount = formatValue ?? ((value: number) => formatNumber(value));
  const largestCount = Math.max(...steps.map(({ count }) => count));

  const getWidthShare = (count: number) =>
    largestCount > 0 ? count / largestCount : 0;

  return (
    <div role="img" aria-label={ariaLabel}>
      <StyledGrid>
        {steps.map((step, index) => {
          const nextStep = steps[index + 1];
          const widthShare = getWidthShare(step.count);
          const formattedCount = formatCount(step.count);
          const barWidthInPx = widthShare * funnelWidth;
          const doesCountFit =
            barWidthInPx >=
            formattedCount.length * COUNT_CHARACTER_WIDTH_IN_PX +
              COUNT_PADDING_IN_PX;
          const isLowest = step.key === lowestStepKey;
          const stepLabel = step.label;
          const nextStepLabel = nextStep?.label;

          const content: AnalyticsChartTooltipContent = step.tooltip ?? {
            title: stepLabel,
            rows: [{ label: t`People`, value: formattedCount }],
          };
          const moveOnContent: AnalyticsChartTooltipContent | undefined =
            step.moveOnTooltip ??
            (isDefined(nextStep)
              ? {
                  title: t`${stepLabel} to ${nextStepLabel}`,
                  rows: [
                    {
                      label: t`Moving on`,
                      value: step.moveOnLabel ?? t`Not enough data`,
                    },
                  ],
                }
              : undefined);

          return (
            <Fragment key={step.key}>
              <StyledStageLabel>{step.label}</StyledStageLabel>
              <StyledBarCell
                ref={index === 0 ? widthRef : undefined}
                onPointerEnter={(event) => showTooltip(content, event)}
                onPointerMove={moveTooltip}
                onPointerLeave={hideTooltip}
              >
                {widthShare > 0 && (
                  <StyledBar
                    style={{
                      background: ANALYTICS_CHART_COLOR.accent,
                      width: `${widthShare * 100}%`,
                    }}
                  >
                    {doesCountFit && formattedCount}
                  </StyledBar>
                )}
                {!doesCountFit && (
                  <StyledOutsideCount
                    style={{ left: `${50 + (widthShare * 100) / 2}%` }}
                  >
                    {formattedCount}
                  </StyledOutsideCount>
                )}
              </StyledBarCell>
              {isDefined(nextStep) && isDefined(moveOnContent) && (
                <>
                  <StyledConnector
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                    onPointerEnter={(event) =>
                      showTooltip(moveOnContent, event)
                    }
                    onPointerMove={moveTooltip}
                    onPointerLeave={hideTooltip}
                  >
                    <polygon
                      points={[
                        `${50 - widthShare * 50},0`,
                        `${50 + widthShare * 50},0`,
                        `${50 + getWidthShare(nextStep.count) * 50},100`,
                        `${50 - getWidthShare(nextStep.count) * 50},100`,
                      ].join(' ')}
                      fill={ANALYTICS_CHART_COLOR.accent}
                      fillOpacity={
                        isLowest ? LOWEST_CONNECTOR_OPACITY : CONNECTOR_OPACITY
                      }
                    />
                  </StyledConnector>
                  <StyledMoveOn isMuted={step.isMoveOnMuted === true}>
                    {isDefined(step.moveOnLabel) ? (
                      step.moveOnLabel
                    ) : (
                      <AnalyticsChartUnknownValue />
                    )}
                    {isLowest && (
                      <StyledLowestMark>{t`Lowest step`}</StyledLowestMark>
                    )}
                  </StyledMoveOn>
                </>
              )}
            </Fragment>
          );
        })}
      </StyledGrid>
      {tooltip}
    </div>
  );
};
