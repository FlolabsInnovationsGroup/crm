import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { isNonEmptyString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';

import { TeamInboxAvatar } from '@/team-inbox/components/TeamInboxAvatar';
import { TeamInboxStageChip } from '@/team-inbox/components/TeamInboxStageChip';
import { type InboxContactSummary } from '@/team-inbox/hooks/useInboxContactPeople';
import { type InboxThread } from '@/team-inbox/types/InboxThread';
import { getThreadContactName } from '@/team-inbox/utils/getThreadContactName';
import { MessageChannelVisibility } from '~/generated/graphql';
import { beautifyPastDateRelativeToNowShort } from '~/utils/date-utils';

const StyledItem = styled.button<{ isSelected: boolean }>`
  align-items: flex-start;
  background: ${({ isSelected }) =>
    isSelected ? 'var(--fl-accent-tint)' : 'transparent'};
  border: none;
  border-radius: 14px;
  box-shadow: ${({ isSelected }) =>
    isSelected ? 'inset 0 0 0 1.5px var(--fl-accent)' : 'none'};
  color: var(--fl-ink);
  cursor: pointer;
  display: flex;
  flex-shrink: 0;
  font-family: inherit;
  gap: 12px;
  padding: 14px 12px;
  text-align: start;
  width: 100%;

  &:hover {
    background: ${({ isSelected }) =>
      isSelected ? 'var(--fl-accent-tint)' : 'var(--fl-surface-sunken)'};
  }
`;

const StyledText = styled.span`
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
`;

const StyledTopLine = styled.span`
  align-items: center;
  display: flex;
  gap: 8px;
`;

const StyledName = styled.span<{ isUnread: boolean }>`
  color: ${({ isUnread }) =>
    isUnread ? 'var(--fl-ink-strong)' : 'var(--fl-ink-soft)'};
  flex: 1;
  font-size: 15px;
  font-weight: ${({ isUnread }) => (isUnread ? 700 : 500)};
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledTime = styled.span`
  color: var(--fl-faint);
  flex-shrink: 0;
  font-size: 12px;
`;

const StyledUnreadDot = styled.span`
  background: var(--fl-accent);
  border-radius: 50%;
  flex-shrink: 0;
  height: 9px;
  width: 9px;
`;

const StyledSubject = styled.span<{ isUnread: boolean }>`
  color: ${({ isUnread }) =>
    isUnread ? 'var(--fl-ink)' : 'var(--fl-ink-quiet)'};
  font-size: 14px;
  font-weight: ${({ isUnread }) => (isUnread ? 600 : 400)};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledPreview = styled.span`
  color: var(--fl-faint);
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledMeta = styled.span`
  align-items: center;
  display: flex;
  gap: 6px;
  margin-top: 4px;
  min-width: 0;
`;

const StyledPosition = styled.span`
  color: var(--fl-faint);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

type TeamInboxThreadListItemProps = {
  thread: InboxThread;
  contactSummary: InboxContactSummary | undefined;
  isSelected: boolean;
  ownHandles: string[];
  onSelect: () => void;
};

export const TeamInboxThreadListItem = ({
  thread,
  contactSummary,
  isSelected,
  ownHandles,
  onSelect,
}: TeamInboxThreadListItemProps) => {
  const isUnread = !thread.read;
  const name =
    thread.contactDisplayName ?? getThreadContactName(thread, ownHandles);
  const isBodyVisible =
    thread.visibility === MessageChannelVisibility.SHARE_EVERYTHING;

  return (
    <StyledItem
      type="button"
      isSelected={isSelected}
      aria-current={isSelected}
      onClick={onSelect}
    >
      <TeamInboxAvatar
        name={name}
        colorSeed={thread.contactPersonId ?? name}
        size={42}
      />
      <StyledText>
        <StyledTopLine>
          <StyledName isUnread={isUnread} dir="auto">
            {name}
          </StyledName>
          <StyledTime>
            {beautifyPastDateRelativeToNowShort(thread.lastMessageReceivedAt)}
          </StyledTime>
          {isUnread && <StyledUnreadDot aria-label={t`Unread`} />}
        </StyledTopLine>
        <StyledSubject isUnread={isUnread} dir="auto">
          {isNonEmptyString(thread.subject) ? thread.subject : t`(no subject)`}
        </StyledSubject>
        {isBodyVisible && isNonEmptyString(thread.lastMessageBody) && (
          <StyledPreview dir="auto">{thread.lastMessageBody}</StyledPreview>
        )}
        {isDefined(contactSummary) &&
          (isNonEmptyString(contactSummary.stageLabel) ||
            isNonEmptyString(contactSummary.position)) && (
            <StyledMeta>
              {isNonEmptyString(contactSummary.stageLabel) && (
                <TeamInboxStageChip color={contactSummary.stageColor}>
                  {contactSummary.stageLabel}
                </TeamInboxStageChip>
              )}
              <StyledPosition>{contactSummary.position}</StyledPosition>
            </StyledMeta>
          )}
      </StyledText>
    </StyledItem>
  );
};
