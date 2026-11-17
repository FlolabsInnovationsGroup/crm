import { Logger } from '@nestjs/common';

import { isNonEmptyString, isString } from '@sniptt/guards';
import { ConnectedAccountProvider } from 'twenty-shared/types';
import { escapeForIlike, isDefined } from 'twenty-shared/utils';
import { ILike, In, IsNull, Not, type Repository } from 'typeorm';

import { parseCommaSeparatedEmails } from 'src/engine/core-modules/tool/tools/email-tool/utils/parse-comma-separated-emails.util';
import { type ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { type WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { MessageDirection } from 'src/modules/messaging/common/enums/message-direction.enum';
import { type MessageChannelMessageAssociationWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message-channel-message-association.workspace-entity';
import { type MessageParticipantWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message-participant.workspace-entity';
import { type MessageWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message.workspace-entity';
import { type WorkflowSendEmailActionInput } from 'src/modules/workflow/workflow-executor/workflow-actions/mail-sender/types/workflow-send-email-action-input.type';

const REPLY_PREFIXES_REGEX = /^(\s*(re|fwd?|aw|sv)\s*:\s*)+/i;

// Keeps the In() lists well under Postgres' bind-parameter limit.
const MAX_CANDIDATE_MESSAGES = 500;

const logger = new Logger('ApplyLatestConversationReply');

// Gmail splits a conversation when the subject changes, so a reply must keep it.
export const buildReplySubject = (conversationSubject: string) =>
  `Re: ${conversationSubject.replace(REPLY_PREFIXES_REGEX, '').trim()}`;

// Same channel the email composer threads on, so the anchor is found again.
const getSendingChannelId = (connectedAccount: ConnectedAccountEntity) =>
  connectedAccount.provider === ConnectedAccountProvider.EMAIL_GROUP
    ? connectedAccount.messageChannels[0]?.id
    : connectedAccount.messageChannels.find(
        (channel) => channel.handle === connectedAccount.handle,
      )?.id;

// The anchor is the latest email this mailbox sent the recipient, so a reminder
// follows our own earlier email rather than whatever the applicant wrote about.
const findLatestSentMessage = async ({
  workspaceOrmManager,
  workspaceId,
  messageChannelId,
  recipientHandle,
}: {
  workspaceOrmManager: WorkspaceOrmManager;
  workspaceId: string;
  messageChannelId: string;
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
      where: { handle: ILike(escapeForIlike(recipientHandle)) },
      select: { messageId: true },
      order: { createdAt: 'DESC' },
      take: MAX_CANDIDATE_MESSAGES,
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
        messageChannelId,
        direction: MessageDirection.OUTGOING,
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
        receivedAt: Not(IsNull()),
        isDraft: false,
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

  if (
    replyToLatestConversation !== true ||
    isNonEmptyString(input.inReplyTo) ||
    !isNonEmptyString(input.connectedAccountId)
  ) {
    return inputWithoutOption;
  }

  const recipientTo = input.recipients?.to;
  const [recipientHandle] = isString(recipientTo)
    ? parseCommaSeparatedEmails(recipientTo)
    : [];

  if (!isDefined(recipientHandle)) {
    return inputWithoutOption;
  }

  try {
    const connectedAccount = await connectedAccountRepository.findOne({
      where: { id: input.connectedAccountId, workspaceId },
      relations: { messageChannels: true },
    });
    const messageChannelId = isDefined(connectedAccount)
      ? getSendingChannelId(connectedAccount)
      : undefined;

    if (!isDefined(messageChannelId)) {
      return inputWithoutOption;
    }

    const latestMessage = await findLatestSentMessage({
      workspaceOrmManager,
      workspaceId,
      messageChannelId,
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
  } catch (error) {
    logger.warn(
      `Could not find the latest conversation, sending as written: ${String(error)}`,
    );

    return inputWithoutOption;
  }
};
