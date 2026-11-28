import { MessageChannelVisibility } from 'twenty-shared/types';

type MessageChannelLink = { messageId: string; messageChannelId: string };

type VisibilityChannel = {
  id: string;
  visibility: MessageChannelVisibility;
  connectedAccountId: string;
};

// The keep rule of ApplyMessagesVisibilityRestrictionsService: a body shows
// only when one of the message's channels shares everything or belongs to the
// member's own account. Anything else is masked or removed there, dropped here.
export const getFullyVisibleMessageIds = ({
  associations,
  channels,
  ownedConnectedAccountIds,
}: {
  associations: MessageChannelLink[];
  // Already limited to the workspace.
  channels: VisibilityChannel[];
  ownedConnectedAccountIds: Set<string>;
}): Set<string> => {
  const fullyVisibleChannelIds = new Set(
    channels
      .filter(
        (channel) =>
          channel.visibility === MessageChannelVisibility.SHARE_EVERYTHING ||
          ownedConnectedAccountIds.has(channel.connectedAccountId),
      )
      .map((channel) => channel.id),
  );

  return new Set(
    associations
      .filter((association) =>
        fullyVisibleChannelIds.has(association.messageChannelId),
      )
      .map((association) => association.messageId),
  );
};
