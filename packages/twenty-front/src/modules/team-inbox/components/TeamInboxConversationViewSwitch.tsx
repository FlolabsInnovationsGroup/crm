import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';

import { type TeamInboxConversationView } from '@/team-inbox/types/TeamInboxConversationView';

const StyledSwitch = styled.div`
  align-self: flex-start;
  background: var(--fl-chip);
  border-radius: 10px;
  display: inline-flex;
  flex-shrink: 0;
  gap: 2px;
  padding: 3px;
`;

const StyledOption = styled.button<{ isActive: boolean }>`
  background: ${({ isActive }) =>
    isActive ? 'var(--fl-surface)' : 'transparent'};
  border: none;
  border-radius: 8px;
  box-shadow: ${({ isActive }) =>
    isActive ? 'var(--fl-shadow-card)' : 'none'};
  color: ${({ isActive }) =>
    isActive ? 'var(--fl-ink)' : 'var(--fl-ink-soft)'};
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  font-weight: ${({ isActive }) => (isActive ? 600 : 500)};
  padding: 6px 12px;
  white-space: nowrap;

  &:disabled {
    cursor: default;
    opacity: 0.6;
  }
`;

type TeamInboxConversationViewSwitchProps = {
  view: TeamInboxConversationView;
  applicantFirstName: string;
  // A reply being written belongs to the view it was opened in.
  isDisabled: boolean;
  onChange: (view: TeamInboxConversationView) => void;
};

export const TeamInboxConversationViewSwitch = ({
  view,
  applicantFirstName,
  isDisabled,
  onChange,
}: TeamInboxConversationViewSwitchProps) => {
  const options: { id: TeamInboxConversationView; label: string }[] = [
    { id: 'THREAD', label: t`This conversation` },
    { id: 'ALL_EMAILS', label: t`All emails with ${applicantFirstName}` },
  ];

  return (
    <StyledSwitch
      role="group"
      aria-label={t`Emails to show`}
      title={isDisabled ? t`Close the reply to switch` : undefined}
    >
      {options.map((option) => (
        <StyledOption
          key={option.id}
          type="button"
          dir="auto"
          isActive={option.id === view}
          aria-pressed={option.id === view}
          disabled={isDisabled}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </StyledOption>
      ))}
    </StyledSwitch>
  );
};
