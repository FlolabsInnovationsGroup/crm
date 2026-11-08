import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { IconX } from 'twenty-ui/icon';
import { Button } from 'twenty-ui/primitives/input';
import { themeCssVariables } from 'twenty-ui/theme';

import { type AnalyticsFilter } from '@/crm-analytics/types/AnalyticsApi';
import { type AnalyticsFilterChip } from '@/crm-analytics/utils/getAnalyticsFilterChips';

const StyledChips = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledChip = styled.span`
  align-items: center;
  background: ${themeCssVariables.background.transparent.light};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  display: inline-flex;
  font-size: ${themeCssVariables.font.size.sm};
  gap: ${themeCssVariables.spacing[1]};
  max-width: 320px;
  min-width: 0;
  padding: 0 2px 0 ${themeCssVariables.spacing[2]};
`;

const StyledChipLabel = styled.span`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledRemoveButton = styled.button`
  align-items: center;
  background: none;
  border: none;
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.tertiary};
  cursor: pointer;
  display: inline-flex;
  flex-shrink: 0;
  padding: 2px;

  &:focus-visible {
    outline: 2px solid ${themeCssVariables.color.blue};
  }

  &:hover {
    background: ${themeCssVariables.background.transparent.medium};
    color: ${themeCssVariables.font.color.primary};
  }
`;

type AnalyticsFilterChipsProps = {
  chips: AnalyticsFilterChip[];
  onChange: (filter: AnalyticsFilter) => void;
  onClearAll: () => void;
};

export const AnalyticsFilterChips = ({
  chips,
  onChange,
  onClearAll,
}: AnalyticsFilterChipsProps) => (
  <StyledChips role="group" aria-label={t`Active filters`}>
    {chips.map(({ key, label, filterWithoutChip }) => (
      <StyledChip key={key}>
        <StyledChipLabel title={label}>{label}</StyledChipLabel>
        <StyledRemoveButton
          type="button"
          aria-label={t`Remove filter ${label}`}
          onClick={() => onChange(filterWithoutChip)}
        >
          <IconX size={12} aria-hidden="true" />
        </StyledRemoveButton>
      </StyledChip>
    ))}
    <Button variant="link" size="sm" onClick={() => onClearAll()}>
      {t`Clear all`}
    </Button>
  </StyledChips>
);
