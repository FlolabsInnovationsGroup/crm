import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { type ReactNode } from 'react';
import { IconArrowDown, IconArrowUp, IconTrash } from 'twenty-ui/icon';
import { Button } from 'twenty-ui/primitives/input';
import { themeCssVariables } from 'twenty-ui/theme';

const StyledCard = styled.div`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  padding: ${themeCssVariables.spacing[3]};
`;

const StyledHeader = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledTitle = styled.span`
  color: ${themeCssVariables.font.color.primary};
  flex: 1;
  font-weight: ${themeCssVariables.font.weight.semiBold};
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

type FormBuilderLogicCardProps = {
  title: string;
  children: ReactNode;
  onRemove: () => void;
  onMove?: (direction: -1 | 1) => void;
  isFirst?: boolean;
  isLast?: boolean;
};

export const FormBuilderLogicCard = ({
  title,
  children,
  onRemove,
  onMove,
  isFirst = true,
  isLast = true,
}: FormBuilderLogicCardProps) => (
  <StyledCard>
    <StyledHeader>
      <StyledTitle dir="auto">{title}</StyledTitle>
      {onMove && (
        <>
          <Button
            variant="ghost"
            size="sm"
            aria-label={t`Move up`}
            disabled={isFirst}
            startIcon={<IconArrowUp size={14} />}
            onClick={() => onMove(-1)}
          />
          <Button
            variant="ghost"
            size="sm"
            aria-label={t`Move down`}
            disabled={isLast}
            startIcon={<IconArrowDown size={14} />}
            onClick={() => onMove(1)}
          />
        </>
      )}
      <Button
        variant="ghost"
        size="sm"
        color="danger"
        aria-label={t`Delete`}
        startIcon={<IconTrash size={14} />}
        onClick={onRemove}
      />
    </StyledHeader>
    {children}
  </StyledCard>
);
