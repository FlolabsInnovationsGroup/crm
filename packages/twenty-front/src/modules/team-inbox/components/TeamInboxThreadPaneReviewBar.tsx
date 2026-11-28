import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { useState } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { IconArrowLeft, IconCheck } from 'twenty-ui/icon';

const StyledBar = styled.div`
  align-items: center;
  background: var(--fl-warn-soft);
  border-radius: 12px;
  color: var(--fl-warn-ink);
  display: flex;
  flex-shrink: 0;
  flex-wrap: wrap;
  font-size: 13px;
  gap: 8px;
  padding: 8px 10px;
`;

const StyledLabel = styled.span`
  flex: 1;
  font-weight: 600;
  min-width: 120px;
`;

const StyledButton = styled.button<{ tone?: 'accent' }>`
  align-items: center;
  background: ${({ tone }) =>
    tone === 'accent' ? 'var(--fl-accent)' : 'var(--fl-surface)'};
  border: none;
  border-radius: 9px;
  color: ${({ tone }) =>
    tone === 'accent' ? 'var(--fl-on-accent)' : 'var(--fl-ink-soft)'};
  cursor: pointer;
  display: inline-flex;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  gap: 6px;
  padding: 7px 12px;
  white-space: nowrap;

  &:disabled {
    cursor: default;
    opacity: 0.6;
  }
`;

type TeamInboxThreadPaneReviewBarProps = {
  // Unset when the card is not in the loaded Needs review list.
  onDone: (() => Promise<void>) | null;
  onBack: () => void;
};

export const TeamInboxThreadPaneReviewBar = ({
  onDone,
  onBack,
}: TeamInboxThreadPaneReviewBarProps) => {
  const [isSaving, setIsSaving] = useState(false);

  const handleDone = async () => {
    if (!isDefined(onDone)) {
      return;
    }

    setIsSaving(true);

    try {
      await onDone();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <StyledBar>
      <StyledButton type="button" onClick={onBack}>
        <IconArrowLeft size={14} />
        {t`Back to Needs review`}
      </StyledButton>
      <StyledLabel>{t`Opened from a Needs review card`}</StyledLabel>
      {isDefined(onDone) && (
        <StyledButton
          type="button"
          tone="accent"
          disabled={isSaving}
          onClick={handleDone}
        >
          <IconCheck size={14} />
          {t`Done`}
        </StyledButton>
      )}
    </StyledBar>
  );
};
