import { isDefined } from 'twenty-shared/utils';

import { type MessageWithParticipants } from 'src/modules/messaging/message-import-manager/types/message.type';
import { isMessageSenderMatchingHandles } from 'src/modules/messaging/message-import-manager/utils/is-message-sender-matching-handles.util';
import { isManualReviewMessage } from 'src/modules/messaging/message-import-manager/utils/is-manual-review-message.util';
import { isTeamInboxSystemMessage } from 'src/modules/messaging/message-import-manager/utils/is-team-inbox-system-message.util';
import { getDomainFromEmailOrThrow } from 'src/utils/get-domain-from-email-or-throw';

export const filterOutInternals = (
  primaryHandle: string,
  messages: MessageWithParticipants[],
) => {
  return messages.filter((message) => {
    if (!message.participants) {
      return true;
    }

    // These n8n emails go hr@ to hr@, so they always look internal.
    if (
      isManualReviewMessage(message) ||
      (isTeamInboxSystemMessage(message) &&
        isMessageSenderMatchingHandles(message, [primaryHandle]))
    ) {
      return true;
    }

    const primaryHandleDomain = getDomainFromEmailOrThrow(primaryHandle);

    try {
      const isAllHandlesFromSameDomain = message.participants
        .filter((participant) => isDefined(participant.handle))
        .every(
          (participant) =>
            isDefined(participant.handle) &&
            getDomainFromEmailOrThrow(participant.handle) ===
              primaryHandleDomain,
        );

      if (isAllHandlesFromSameDomain) {
        return false;
      }
    } catch {
      return true;
    }

    return true;
  });
};
