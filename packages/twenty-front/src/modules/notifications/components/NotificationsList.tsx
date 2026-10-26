import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { useState } from 'react';
import { CoreObjectNameSingular } from 'twenty-shared/types';
import {
  type IconComponent,
  IconCheckbox,
  IconForms,
  IconMail,
} from 'twenty-ui/icon';
import { Button } from 'twenty-ui/primitives/input';
import { themeCssVariables } from 'twenty-ui/theme';

import { useNotificationFeed } from '@/notifications/hooks/useNotificationFeed';
import { notificationsSeenState } from '@/notifications/states/notificationsSeenState';
import {
  type NotificationItem,
  type NotificationKind,
} from '@/notifications/types/NotificationItem';
import { isNotificationUnread } from '@/notifications/utils/buildNotificationItems';
import { useOpenRecordInSidePanel } from '@/side-panel/hooks/useOpenRecordInSidePanel';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { beautifyPastDateRelativeToNow } from '~/utils/date-utils';

const KIND_ICONS: Record<NotificationKind, IconComponent> = {
  email: IconMail,
  formSubmission: IconForms,
  task: IconCheckbox,
};

const OBJECT_BY_KIND: Record<NotificationKind, string> = {
  email: CoreObjectNameSingular.MessageThread,
  formSubmission: 'formSubmission',
  task: CoreObjectNameSingular.Task,
};

const StyledContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
`;

const StyledToolbar = styled.div`
  align-items: center;
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  gap: ${themeCssVariables.spacing[3]};
  justify-content: space-between;
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[4]};
`;

const StyledHint = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
`;

const StyledList = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[4]};
`;

const StyledRow = styled.button<{ isUnread: boolean }>`
  align-items: center;
  background: ${({ isUnread }) =>
    isUnread ? themeCssVariables.background.transparent.blue : 'none'};
  border: none;
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  display: flex;
  font-family: inherit;
  gap: ${themeCssVariables.spacing[3]};
  padding: ${themeCssVariables.spacing[3]};
  text-align: start;
  width: 100%;

  &:hover {
    background: ${themeCssVariables.background.transparent.light};
  }
`;

const StyledIcon = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  display: flex;
  flex: none;
`;

const StyledText = styled.span`
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
`;

const StyledTitle = styled.span`
  font-weight: ${themeCssVariables.font.weight.medium};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledSubtitle = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledTime = styled.span`
  color: ${themeCssVariables.font.color.light};
  flex: none;
  font-size: ${themeCssVariables.font.size.sm};
`;

const StyledEmpty = styled.p`
  color: ${themeCssVariables.font.color.tertiary};
  margin: ${themeCssVariables.spacing[8]} 0;
  text-align: center;
`;

const getDesktopPermission = () =>
  'Notification' in window ? Notification.permission : 'denied';

export const NotificationsList = () => {
  const items = useNotificationFeed();
  const notificationsSeen = useAtomStateValue(notificationsSeenState);
  const { openRecordInSidePanel } = useOpenRecordInSidePanel();
  const [desktopPermission, setDesktopPermission] =
    useState(getDesktopPermission);

  const now = new Date();

  const handleOpen = (item: NotificationItem) =>
    openRecordInSidePanel({
      recordId: item.recordId,
      objectNameSingular: OBJECT_BY_KIND[item.kind],
    });

  const handleEnableDesktopAlerts = async () => {
    setDesktopPermission(await Notification.requestPermission());
  };

  return (
    <StyledContainer>
      <StyledToolbar>
        <StyledHint>
          {t`Replies to your mailboxes, new form submissions and tasks assigned to you. Updates every minute.`}
        </StyledHint>
        {desktopPermission === 'default' && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleEnableDesktopAlerts}
          >
            {t`Enable desktop alerts`}
          </Button>
        )}
      </StyledToolbar>
      <StyledList>
        {items.length === 0 ? (
          <StyledEmpty>{t`Nothing yet.`}</StyledEmpty>
        ) : (
          items.map((item) => {
            const KindIcon = KIND_ICONS[item.kind];

            return (
              <StyledRow
                key={item.id}
                type="button"
                isUnread={isNotificationUnread(
                  item,
                  notificationsSeen.previousSeenAt,
                  now,
                )}
                onClick={() => handleOpen(item)}
              >
                <StyledIcon>
                  <KindIcon size={18} />
                </StyledIcon>
                <StyledText>
                  <StyledTitle dir="auto">{item.title}</StyledTitle>
                  <StyledSubtitle dir="auto">{item.subtitle}</StyledSubtitle>
                </StyledText>
                <StyledTime>
                  {beautifyPastDateRelativeToNow(item.happenedAt)}
                </StyledTime>
              </StyledRow>
            );
          })
        )}
      </StyledList>
    </StyledContainer>
  );
};
