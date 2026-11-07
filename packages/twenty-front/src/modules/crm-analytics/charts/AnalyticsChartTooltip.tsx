import { styled } from '@linaria/react';
import { type RefObject } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { themeCssVariables } from 'twenty-ui/theme';

export type AnalyticsChartTooltipRow = {
  label: string;
  value: string;
  color?: string;
};

export type AnalyticsChartTooltipContent = {
  title: string;
  rows: AnalyticsChartTooltipRow[];
  note?: string | null;
};

const StyledTooltip = styled.div`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  box-shadow: ${themeCssVariables.boxShadow.strong};
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing[1]};
  left: 0;
  max-width: 280px;
  min-width: 120px;
  padding: ${themeCssVariables.spacing[2]};
  pointer-events: none;
  position: absolute;
  top: 0;
  width: max-content;
  z-index: 10;
`;

const StyledTitle = styled.div`
  color: ${themeCssVariables.font.color.primary};
  font-weight: ${themeCssVariables.font.weight.medium};
`;

const StyledRow = styled.div`
  align-items: baseline;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: space-between;
`;

const StyledRowLabel = styled.span`
  align-items: center;
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  gap: ${themeCssVariables.spacing[1]};
  min-width: 0;
`;

const StyledLineKey = styled.span`
  border-radius: 1px;
  flex-shrink: 0;
  height: 2px;
  width: 12px;
`;

const StyledRowValue = styled.span`
  color: ${themeCssVariables.font.color.primary};
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
  font-weight: ${themeCssVariables.font.weight.semiBold};
`;

const StyledNote = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  line-height: ${themeCssVariables.text.lineHeight.lg};
`;

type AnalyticsChartTooltipProps = {
  content: AnalyticsChartTooltipContent;
  elementRef: RefObject<HTMLDivElement | null>;
};

// The position is written straight to the element, so moving the mouse never renders the chart again.
export const AnalyticsChartTooltip = ({
  content,
  elementRef,
}: AnalyticsChartTooltipProps) => (
  <StyledTooltip ref={elementRef} role="tooltip">
    <StyledTitle>{content.title}</StyledTitle>
    {content.rows.map((row) => (
      <StyledRow key={row.label}>
        <StyledRowLabel>
          {isDefined(row.color) && (
            <StyledLineKey style={{ background: row.color }} />
          )}
          {row.label}
        </StyledRowLabel>
        <StyledRowValue>{row.value}</StyledRowValue>
      </StyledRow>
    ))}
    {isDefined(content.note) && <StyledNote>{content.note}</StyledNote>}
  </StyledTooltip>
);
