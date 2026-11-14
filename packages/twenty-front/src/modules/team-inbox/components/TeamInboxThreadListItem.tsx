import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { isNonEmptyString } from '@sniptt/guards';
import { Tag } from 'twenty-ui/primitives/data-display';
import { themeCssVariables } from 'twenty-ui/theme';

import { getThreadContactName } from '@/team-inbox/utils/getThreadContactName';
import { parseManualReviewSubject } from '@/team-inbox/utils/parseManualReviewSubject';
import {
  MessageChannelVisibility,
  type TimelineThread,
} from '~/generated/graphql';
import { beautifyPastDateRelativeToNowShort } from '~/utils/date-utils';

const StyledItem = styled.button<{ isSelected: boolean }>`
  background: ${({ isSelected }) =>
    isSelected ? themeCssVariables.background.transparent.medium : 'none'};
  border: none;
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  display: flex;
  flex-direction: column;
  font-family: inherit;
  font-size: ${themeCssVariables.font.size.md};
  gap: ${themeCssVariables.spacing[1]};
  padding: ${themeCssVariables.spacing[3]} ${themeCssVariables.spacing[4]};
  text-align: start;
  width: 100%;

  &:hover {
    background: ${themeCssVariables.background.transparent.light};
  }
`;

const StyledTopLine = styled.span`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledUnreadDot = styled.span<{ isUnread: boolean }>`
  background: ${({ isUnread }) =>
    isUnread ? themeCssVariables.color.blue : 'transparent'};
  border-radius: 50%;
  flex-shrink: 0;
  height: 8px;
  width: 8px;
`;

const StyledName = styled.span<{ isUnread: boolean }>`
  flex: 1;
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
  padding-left: ${themeCssVariables.spacing[4]};
  text-overflow: ellipsis;
  white-space: nowrap;
`;

type TeamInboxThreadListItemProps = {
  thread: TimelineThread & { contactDisplayName?: string | null };
  isSelected: boolean;
  isManualReview: boolean;
  ownHandles: string[];
  onSelect: () => void;
};

export const TeamInboxThreadListItem = ({
  thread,
  isSelected,
  isManualReview,
  ownHandles,
  onSelect,
}: TeamInboxThreadListItemProps) => {
  const isUnread = !thread.read;
  const manualReview = isManualReview
    ? parseManualReviewSubject(thread.subject)
    : null;
  const isBodyVisible =
    thread.visibility === MessageChannelVisibility.SHARE_EVERYTHING;
  const subject = isNonEmptyString(thread.subject)
    ? thread.subject
    : t`(no subject)`;

  return (
    <StyledItem
      type="button"
      isSelected={isSelected}
      aria-current={isSelected}
      onClick={onSelect}
    >
      <StyledTopLine>
        <StyledUnreadDot isUnread={isUnread} />
        {isNonEmptyString(manualReview?.reason) && (
          <Tag
            color={manualReview.reason === 'not interested' ? 'gray' : 'orange'}
          >
            {manualReview.reason}
          </Tag>
        )}
        <StyledName isUnread={isUnread} dir="auto">
          {manualReview?.applicantEmail ??
            thread.contactDisplayName ??
            getThreadContactName(thread, ownHandles)}
        </StyledName>
        {thread.numberOfMessagesInThread > 1 && (
          <StyledTime>{thread.numberOfMessagesInThread}</StyledTime>
        )}
        <StyledTime>
          {beautifyPastDateRelativeToNowShort(thread.lastMessageReceivedAt)}
        </StyledTime>
      </StyledTopLine>
      <StyledLine isUnread={isUnread} dir="auto">
        {manualReview?.originalSubject ?? subject}
      </StyledLine>
      {isBodyVisible && isNonEmptyString(thread.lastMessageBody) && (
        <StyledLine isMuted dir="auto">
          {thread.lastMessageBody}
        </StyledLine>
      )}
    </StyledItem>
  );
};
