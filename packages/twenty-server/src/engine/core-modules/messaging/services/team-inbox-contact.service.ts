import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { isDefined } from 'twenty-shared/utils';
import { Repository } from 'typeorm';

import {
  type InboxContact,
  pickInboxContact,
} from 'src/engine/core-modules/messaging/utils/pick-inbox-contact.util';
import { MessageChannelEntity } from 'src/engine/metadata-modules/message-channel/entities/message-channel.entity';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { type MessageParticipantWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message-participant.workspace-entity';

// Thread summaries only list senders, so a thread nobody has answered yet
// would be named after our own mailbox. This reads every role instead.
@Injectable()
export class TeamInboxContactService {
  constructor(
    private readonly workspaceOrmManager: WorkspaceOrmManager,
    @InjectRepository(MessageChannelEntity)
    private readonly messageChannelRepository: Repository<MessageChannelEntity>,
  ) {}

  async getContactByThreadId(
    messageThreadIds: string[],
    workspaceId: string,
  ): Promise<Record<string, InboxContact>> {
    if (messageThreadIds.length === 0) {
      return {};
    }

    const ownHandles = (
      await this.messageChannelRepository.find({
        where: { workspaceId },
        select: { handle: true },
      })
    ).map((messageChannel) => messageChannel.handle);

    const participants =
      await this.workspaceOrmManager.executeInWorkspaceContext(
        () =>
          this.workspaceOrmManager
            .getRepository<MessageParticipantWorkspaceEntity>(
              'messageParticipant',
              { shouldBypassPermissionChecks: true },
            )
            .createQueryBuilder()
            .select('messageParticipant')
            .addSelect('message.messageThreadId')
            .addSelect('message.receivedAt')
            .leftJoin('messageParticipant.message', 'message')
            .where('message.messageThreadId = ANY(:messageThreadIds)', {
              messageThreadIds,
            })
            .andWhere('messageParticipant.workspaceMemberId IS NULL')
            .getMany<MessageParticipantWorkspaceEntity>(),
        buildSystemAuthContext(workspaceId),
      );

    return Object.fromEntries(
      messageThreadIds.flatMap((messageThreadId) => {
        const contact = pickInboxContact(
          participants
            .filter(
              (participant) =>
                participant.message.messageThreadId === messageThreadId,
            )
            .map((participant) => ({
              handle: participant.handle,
              displayName: participant.displayName,
              role: participant.role,
              receivedAt: participant.message.receivedAt ?? null,
              personId: participant.personId ?? null,
            })),
          ownHandles,
        );

        return isDefined(contact) ? [[messageThreadId, contact]] : [];
      }),
    );
  }
}
