import { styled } from '@linaria/react';
import { type ReactNode } from 'react';
import { type ThemeColor, themeCssVariables } from 'twenty-ui/theme';

const StyledChip = styled.span<{ color: ThemeColor }>`
  background: ${({ color }) => themeCssVariables.tag.background[color]};
  border-radius: 10px;
  color: ${({ color }) => themeCssVariables.tag.text[color]};
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
  padding: 3px 8px;
  white-space: nowrap;
`;

type TeamInboxStageChipProps = {
  color: ThemeColor;
  children: ReactNode;
};

export const TeamInboxStageChip = ({
  color,
  children,
}: TeamInboxStageChipProps) => (
  <StyledChip color={color}>{children}</StyledChip>
);
