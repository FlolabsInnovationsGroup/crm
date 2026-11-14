import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { isNonEmptyString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';
import { Avatar, Tag } from 'twenty-ui/primitives/data-display';
import { themeCssVariables } from 'twenty-ui/theme';

import { type InboxContactSummary } from '@/team-inbox/hooks/useInboxContactPeople';
import { getThreadContactName } from '@/team-inbox/utils/getThreadContactName';
import { type InboxThread } from '@/team-inbox/types/InboxThread';
import { MessageChannelVisibility } from '~/generated/graphql';
import { beautifyPastDateRelativeToNowShort } from '~/utils/date-utils';

const StyledItem = styled.button<{ isSelected: boolean }>`
  align-items: flex-start;
  background: ${({ isSelected }) =>
    isSelected ? themeCssVariables.tag.background.turquoise : 'none'};
  border: none;
  border-radius: ${themeCssVariables.border.radius.xl};
  box-shadow: ${({ isSelected }) =>
    isSelected
      ? `inset 0 0 0 1.5px ${themeCssVariables.color.turquoise}`
      : 'none'};
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  display: flex;
  font-family: inherit;
  font-size: ${themeCssVariables.font.size.md};
  gap: ${themeCssVariables.spacing[3]};
  padding: ${themeCssVariables.spacing[3]};
  text-align: start;
  width: 100%;

  &:hover {
    background: ${({ isSelected }) =>
      isSelected
        ? themeCssVariables.tag.background.turquoise
        : themeCssVariables.background.transparent.lighter};
  }
`;

const StyledText = styled.span`
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
`;

const StyledTopLine = styled.span`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledName = styled.span<{ isUnread: boolean }>`
  color: ${({ isUnread }) =>
    isUnread
      ? themeCssVariables.font.color.primary
      : themeCssVariables.font.color.secondary};
  flex: 1;
  font-size: ${themeCssVariables.font.size.lg};
  font-weight: ${({ isUnread }) =>
    isUnread
      ? themeCssVariables.font.weight.semiBold
      : themeCssVariables.font.weight.medium};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledTime = styled.span`
  color: ${themeCssVariables.font.color.light};
  flex-shrink: 0;
  font-size: ${themeCssVariables.font.size.sm};
`;

const StyledUnreadDot = styled.span`
  background: ${themeCssVariables.color.turquoise};
  border-radius: 50%;
  flex-shrink: 0;
  height: 9px;
  width: 9px;
`;

const StyledLine = styled.span<{ isMuted?: boolean; isUnread?: boolean }>`
  color: ${({ isMuted }) =>
    isMuted
      ? themeCssVariables.font.color.tertiary
      : themeCssVariables.font.color.primary};
  font-weight: ${({ isUnread }) =>
    isUnread
      ? themeCssVariables.font.weight.semiBold
      : themeCssVariables.font.weight.regular};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledMeta = styled.span`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  margin-top: ${themeCssVariables.spacing[1]};
  min-width: 0;
`;

const StyledPosition = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
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
      <Avatar name={name} colorSeed={name} shape="circle" size="lg" />
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
        <StyledLine isUnread={isUnread} dir="auto">
          {isNonEmptyString(thread.subject) ? thread.subject : t`(no subject)`}
        </StyledLine>
        {isBodyVisible && isNonEmptyString(thread.lastMessageBody) && (
          <StyledLine isMuted dir="auto">
            {thread.lastMessageBody}
          </StyledLine>
        )}
        {isDefined(contactSummary) &&
          (isNonEmptyString(contactSummary.stageLabel) ||
            isNonEmptyString(contactSummary.position)) && (
            <StyledMeta>
              {isNonEmptyString(contactSummary.stageLabel) && (
                <Tag color={contactSummary.stageColor}>
                  {contactSummary.stageLabel}
                </Tag>
              )}
              <StyledPosition>{contactSummary.position}</StyledPosition>
            </StyledMeta>
          )}
      </StyledText>
    </StyledItem>
  );
};
