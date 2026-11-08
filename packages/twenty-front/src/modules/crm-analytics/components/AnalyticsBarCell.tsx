import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme';

import { useNumberFormat } from '@/localization/hooks/useNumberFormat';

type AnalyticsBarTone = 'default' | 'accent' | 'muted';

const BAR_COLOR_BY_TONE: Record<AnalyticsBarTone, string> = {
  default: themeCssVariables.color.gray8,
  accent: themeCssVariables.color.blue,
  muted: themeCssVariables.color.gray6,
};

const StyledRoot = styled.span`
  align-items: center;
  display: grid;
  gap: ${themeCssVariables.spacing[2]};
  grid-template-columns: minmax(48px, 1fr) 7ch;
  width: 100%;
`;

const StyledBarArea = styled.span`
  display: block;
  height: 10px;
`;

const StyledBar = styled.span<{ tone: AnalyticsBarTone }>`
  background: ${({ tone }) => BAR_COLOR_BY_TONE[tone]};
  border-end-end-radius: ${themeCssVariables.border.radius.xs};
  border-start-end-radius: ${themeCssVariables.border.radius.xs};
  display: block;
  height: 100%;
  min-width: 2px;
`;

const StyledValue = styled.span<{ tone: AnalyticsBarTone }>`
  color: ${({ tone }) =>
    tone === 'muted'
      ? themeCssVariables.font.color.secondary
      : themeCssVariables.font.color.primary};
  font-variant-numeric: tabular-nums;
  text-align: end;
  white-space: nowrap;
`;

type AnalyticsBarCellProps = {
  value: number;
  maxValue: number;
  tone?: AnalyticsBarTone;
};

export const AnalyticsBarCell = ({
  value,
  maxValue,
  tone = 'default',
}: AnalyticsBarCellProps) => {
  const { formatNumber } = useNumberFormat();
  const widthPercent = maxValue > 0 ? (value / maxValue) * 100 : 0;

  return (
    <StyledRoot>
      <StyledBarArea aria-hidden="true">
        {widthPercent > 0 && (
          <StyledBar tone={tone} style={{ width: `${widthPercent}%` }} />
        )}
      </StyledBarArea>
      <StyledValue tone={tone}>{formatNumber(value)}</StyledValue>
    </StyledRoot>
  );
};
