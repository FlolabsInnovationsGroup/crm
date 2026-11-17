import { isNonEmptyString } from '@sniptt/guards';
import { escapeForIlike, isDefined } from 'twenty-shared/utils';
import { ILike, In, IsNull, Not, type Repository } from 'typeorm';

import { type ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { type WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { type MessageChannelMessageAssociationWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message-channel-message-association.workspace-entity';
import { type MessageParticipantWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message-participant.workspace-entity';
import { type MessageWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message.workspace-entity';
import { type WorkflowSendEmailActionInput } from 'src/modules/workflow/workflow-executor/workflow-actions/mail-sender/types/workflow-send-email-action-input.type';

const REPLY_PREFIXES_REGEX = /^(\s*(re|fwd?|aw|sv)\s*:\s*)+/i;

// Gmail splits a conversation when the subject changes, so a reply must keep it.
export const buildReplySubject = (conversationSubject: string) =>
  `Re: ${conversationSubject.replace(REPLY_PREFIXES_REGEX, '').trim()}`;

export const getFirstRecipientHandle = (to: string | undefined) =>
  (to ?? '')
    .split(/[,;]/)
    .map((handle) => handle.trim().toLowerCase())
    .find(isNonEmptyString);

const findLatestConversationMessage = async ({
  workspaceOrmManager,
  workspaceId,
  messageChannelIds,
  recipientHandle,
}: {
  workspaceOrmManager: WorkspaceOrmManager;
  workspaceId: string;
  messageChannelIds: string[];
  recipientHandle: string;
}) =>
  workspaceOrmManager.executeInWorkspaceContext(async () => {
    const participantRepository =
      workspaceOrmManager.getRepository<MessageParticipantWorkspaceEntity>(
        'messageParticipant',
        { shouldBypassPermissionChecks: true },
      );
    const associationRepository =
      workspaceOrmManager.getRepository<MessageChannelMessageAssociationWorkspaceEntity>(
        'messageChannelMessageAssociation',
        { shouldBypassPermissionChecks: true },
      );
    const messageRepository =
      workspaceOrmManager.getRepository<MessageWorkspaceEntity>('message', {
        shouldBypassPermissionChecks: true,
      });

    const participants = await participantRepository.find({
      where: {
        handle: ILike(escapeForIlike(recipientHandle)),
      },
      select: { messageId: true },
    });
    const participantMessageIds = [
      ...new Set(participants.map(({ messageId }) => messageId)),
    ];

    if (participantMessageIds.length === 0) {
      return null;
    }

    const associations = await associationRepository.find({
      where: {
        messageId: In(participantMessageIds),
        messageChannelId: In(messageChannelIds),
      },
      select: { messageId: true },
    });

    if (associations.length === 0) {
      return null;
    }

    return messageRepository.findOne({
      where: {
        id: In(associations.map(({ messageId }) => messageId)),
        headerMessageId: Not(IsNull()),
      },
      select: { headerMessageId: true, subject: true },
      order: { receivedAt: 'DESC' },
    });
  }, buildSystemAuthContext(workspaceId));

// Reminder workflows have no way to know the last email's Message-ID, so
// this looks it up and sends the email as a reply in that conversation.
export const applyLatestConversationReply = async ({
  input,
  workspaceId,
  workspaceOrmManager,
  connectedAccountRepository,
}: {
  input: WorkflowSendEmailActionInput;
  workspaceId: string;
  workspaceOrmManager: WorkspaceOrmManager;
  connectedAccountRepository: Repository<ConnectedAccountEntity>;
}): Promise<WorkflowSendEmailActionInput> => {
  const { replyToLatestConversation, ...inputWithoutOption } = input;
  const recipientHandle = getFirstRecipientHandle(input.recipients?.to);

  if (
    replyToLatestConversation !== true ||
    isNonEmptyString(input.inReplyTo) ||
    !isNonEmptyString(input.connectedAccountId) ||
    !isDefined(recipientHandle)
  ) {
    return inputWithoutOption;
  }

  const connectedAccount = await connectedAccountRepository.findOne({
    where: { id: input.connectedAccountId, workspaceId },
    relations: { messageChannels: true },
  });
  const messageChannelIds =
    connectedAccount?.messageChannels.map(({ id }) => id) ?? [];

  if (messageChannelIds.length === 0) {
    return inputWithoutOption;
  }

  const latestMessage = await findLatestConversationMessage({
    workspaceOrmManager,
    workspaceId,
    messageChannelIds,
    recipientHandle,
  });

  if (!isNonEmptyString(latestMessage?.headerMessageId)) {
    return inputWithoutOption;
  }

  return {
    ...inputWithoutOption,
    inReplyTo: latestMessage.headerMessageId,
    subject: isNonEmptyString(latestMessage.subject)
      ? buildReplySubject(latestMessage.subject)
      : inputWithoutOption.subject,
  };
};
