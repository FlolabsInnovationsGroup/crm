import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { IconCopy } from 'twenty-ui/icon';

import { useCopyToClipboard } from '~/hooks/useCopyToClipboard';

const StyledEmailRow = styled.div`
  align-items: center;
  color: var(--fl-muted);
  display: flex;
  font-size: 12px;
  gap: 4px;
  min-width: 0;
`;

const StyledEmail = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  user-select: all;
  white-space: nowrap;
`;

const StyledCopyButton = styled.button`
  align-items: center;
  background: none;
  border: none;
  border-radius: 6px;
  color: var(--fl-faint);
  cursor: pointer;
  display: inline-flex;
  flex-shrink: 0;
  padding: 3px;

  &:hover {
    background: var(--fl-chip);
    color: var(--fl-ink-soft);
  }
`;

type TeamInboxCopyEmailProps = {
  email: string;
};

export const TeamInboxCopyEmail = ({ email }: TeamInboxCopyEmailProps) => {
  const { copyToClipboard } = useCopyToClipboard();

  return (
    <StyledEmailRow>
      <StyledEmail title={email}>{email}</StyledEmail>
      <StyledCopyButton
        type="button"
        aria-label={t`Copy email address`}
        title={t`Copy email address`}
        onClick={() => copyToClipboard(email, t`Email address copied`)}
      >
        <IconCopy size={13} />
      </StyledCopyButton>
    </StyledEmailRow>
  );
};
