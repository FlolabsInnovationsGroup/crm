import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { isNonEmptyString } from '@sniptt/guards';
import { isDefined, isNonEmptyArray } from 'twenty-shared/utils';
import { In, IsNull, LessThanOrEqual, type Repository } from 'typeorm';

import { type QuotedThreadHistory } from 'src/engine/core-modules/tool/tools/email-tool/types/quoted-thread-history.type';
import { buildQuotedThreadHistory } from 'src/engine/core-modules/tool/tools/email-tool/utils/build-quoted-thread-history.util';
import { normalizeEmailHandle } from 'src/engine/core-modules/tool/tools/email-tool/utils/normalize-email-handle.util';
import { selectQuotableThreadMessages } from 'src/engine/core-modules/tool/tools/email-tool/utils/select-quotable-thread-messages.util';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { type MessageChannelMessageAssociationWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message-channel-message-association.workspace-entity';
import { type MessageParticipantWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message-participant.workspace-entity';
import { type MessageWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message.workspace-entity';

// Enough to find 20 quotable messages in a thread that also holds internal
// mail, without reading whole long threads on every reply.
const MAX_SCANNED_THREAD_MESSAGES = 60;
const MAX_THREAD_MESSAGE_REFERENCES = 500;

@Injectable()
export class EmailQuotedHistoryService {
  private readonly logger = new Logger(EmailQuotedHistoryService.name);

  constructor(
    private readonly workspaceOrmManager: WorkspaceOrmManager,
    @InjectRepository(ConnectedAccountEntity)
    private readonly connectedAccountRepository: Repository<ConnectedAccountEntity>,
  ) {}

  // A failure here only drops the quote; the reply itself still goes out.
  async getQuotedHistory(parameters: {
    workspaceId: string;
    messageChannelId: string;
    inReplyTo: string;
    recipientHandles: string[];
  }): Promise<QuotedThreadHistory | undefined> {
    try {
      return await this.buildQuotedHistory(parameters);
    } catch (error) {
      this.logger.warn(`Sending reply without quoted history: ${error}`);

      return undefined;
    }
  }

  private async getWorkspaceMailboxHandles(
    workspaceId: string,
  ): Promise<Set<string>> {
    const connectedAccounts = await this.connectedAccountRepository.find({
      where: { workspaceId, archivedAt: IsNull() },
      relations: { messageChannels: true },
    });

    return new Set(
      connectedAccounts
        .flatMap((connectedAccount) => [
          connectedAccount.handle,
          ...(connectedAccount.handleAliases ?? []),
          ...connectedAccount.messageChannels.map((channel) => channel.handle),
        ])
        .filter(isNonEmptyString)
        .map(normalizeEmailHandle),
    );
  }

  private async buildQuotedHistory({
    workspaceId,
    messageChannelId,
    inReplyTo,
    recipientHandles,
  }: {
    workspaceId: string;
    messageChannelId: string;
    inReplyTo: string;
    recipientHandles: string[];
  }): Promise<QuotedThreadHistory | undefined> {
    const mailboxHandles = await this.getWorkspaceMailboxHandles(workspaceId);

    const externalRecipientHandles = recipientHandles.filter(
      (handle) => !mailboxHandles.has(normalizeEmailHandle(handle)),
    );

    if (!isNonEmptyArray(externalRecipientHandles)) {
      return undefined;
    }

    return this.workspaceOrmManager.executeInWorkspaceContext(async () => {
      const messageRepository =
        this.workspaceOrmManager.getRepository<MessageWorkspaceEntity>(
          'message',
          { shouldBypassPermissionChecks: true },
        );
      const associationRepository =
        this.workspaceOrmManager.getRepository<MessageChannelMessageAssociationWorkspaceEntity>(
          'messageChannelMessageAssociation',
          { shouldBypassPermissionChecks: true },
        );

      // Only mail synced into the sending mailbox is read, so a reply never
      // quotes a colleague's mailbox the sender cannot see.
      const getIdsInSendingChannel = async (messageIds: string[]) =>
        new Set(
          isNonEmptyArray(messageIds)
            ? (
                await associationRepository.find({
                  where: { messageChannelId, messageId: In(messageIds) },
                  select: { messageId: true },
                })
              ).map((association) => association.messageId)
            : [],
        );

      const parentCandidates = await messageRepository.find({
        where: { headerMessageId: inReplyTo },
        select: { id: true, messageThreadId: true, receivedAt: true },
      });
      const parentIdsInChannel = await getIdsInSendingChannel(
        parentCandidates.map((message) => message.id),
      );
      const parentMessage = parentCandidates.find((message) =>
        parentIdsInChannel.has(message.id),
      );

      if (
        !isDefined(parentMessage) ||
        !isDefined(parentMessage.messageThreadId) ||
        !isDefined(parentMessage.receivedAt)
      ) {
        return undefined;
      }

      const threadMessageRefs = await messageRepository.find({
        where: {
          messageThreadId: parentMessage.messageThreadId,
          receivedAt: LessThanOrEqual(parentMessage.receivedAt),
          isDraft: false,
        },
        select: { id: true },
        order: { receivedAt: 'DESC' },
        take: MAX_THREAD_MESSAGE_REFERENCES,
      });
      const threadIdsInChannel = await getIdsInSendingChannel(
        threadMessageRefs.map((message) => message.id),
      );
      const scannedMessageIds = threadMessageRefs
        .map((message) => message.id)
        .filter((messageId) => threadIdsInChannel.has(messageId))
        .slice(0, MAX_SCANNED_THREAD_MESSAGES);

      if (!isNonEmptyArray(scannedMessageIds)) {
        return undefined;
      }

      const [threadMessages, participants] = await Promise.all([
        messageRepository.find({
          where: { id: In(scannedMessageIds) },
          select: { id: true, text: true, receivedAt: true, isDraft: true },
        }),
        this.workspaceOrmManager
          .getRepository<MessageParticipantWorkspaceEntity>(
            'messageParticipant',
            { shouldBypassPermissionChecks: true },
          )
          .find({
            where: { messageId: In(scannedMessageIds) },
            select: {
              messageId: true,
              role: true,
              handle: true,
              displayName: true,
            },
          }),
      ]);

      return buildQuotedThreadHistory(
        selectQuotableThreadMessages({
          messages: threadMessages,
          participants,
          externalRecipientHandles,
        }),
      );
    }, buildSystemAuthContext(workspaceId));
  }
}
