import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { isNonEmptyString } from '@sniptt/guards';
import { MessageParticipantRole } from 'twenty-shared/types';
import { isDefined, isNonEmptyArray, isValidUuid } from 'twenty-shared/utils';
import { In, MoreThanOrEqual, type Repository } from 'typeorm';

import { type ManualReviewHistoryEntryDTO } from 'src/engine/core-modules/messaging/dtos/manual-review-history-entry.dto';
import {
  type CandidateReplyMessage,
  getManualReviewDoneState,
  pickManualReviewReply,
} from 'src/engine/core-modules/messaging/utils/team-inbox-manual-review-history.util';
import { UserVarsService } from 'src/engine/core-modules/user/user-vars/services/user-vars.service';
import { MessageChannelEntity } from 'src/engine/metadata-modules/message-channel/entities/message-channel.entity';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { type MessageParticipantWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message-participant.workspace-entity';
import { type MessageWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message.workspace-entity';
import { type WorkspaceMemberWorkspaceEntity } from 'src/modules/workspace-member/standard-objects/workspace-member.workspace-entity';

export const MAX_MANUAL_REVIEW_HISTORY_ITEMS = 200;

type ManualReviewHistoryItem = {
  messageThreadId: string;
  applicantEmail?: string | null;
};

// Details for the Needs review history and its CSV export: when and by whom
// each item was marked done, and the first answer our mailboxes sent.
@Injectable()
export class TeamInboxManualReviewHistoryService {
  constructor(
    private readonly workspaceOrmManager: WorkspaceOrmManager,
    private readonly userVarsService: UserVarsService<
      Record<string, true | string>
    >,
    @InjectRepository(MessageChannelEntity)
    private readonly messageChannelRepository: Repository<MessageChannelEntity>,
  ) {}

  async getHistory({
    workspaceId,
    items,
  }: {
    workspaceId: string;
    items: ManualReviewHistoryItem[];
  }): Promise<ManualReviewHistoryEntryDTO[]> {
    const validItems = items
      .filter((item) => isValidUuid(item.messageThreadId))
      .slice(0, MAX_MANUAL_REVIEW_HISTORY_ITEMS)
      .map((item) => ({
        messageThreadId: item.messageThreadId,
        applicantEmail: isNonEmptyString(item.applicantEmail?.trim())
          ? item.applicantEmail.trim()
          : null,
      }));

    if (!isNonEmptyArray(validItems)) {
      return [];
    }

    const [workspaceVars, ownHandles] = await Promise.all([
      this.userVarsService.getAll({ workspaceId }),
      this.messageChannelRepository
        .find({ where: { workspaceId }, select: { handle: true } })
        .then((channels) => channels.map((channel) => channel.handle)),
    ]);

    const doneStates = new Map(
      validItems.map((item) => [
        item.messageThreadId,
        getManualReviewDoneState(workspaceVars, item.messageThreadId),
      ]),
    );

    return this.workspaceOrmManager.executeInWorkspaceContext(async () => {
      const [reviewReceivedAtByThreadId, doneByNameById] = await Promise.all([
        this.getReviewReceivedAtByThreadId(
          validItems.map((item) => item.messageThreadId),
        ),
        this.getWorkspaceMemberNames(
          [...doneStates.values()]
            .map((state) => state.doneByWorkspaceMemberId)
            .filter(isDefined),
        ),
      ]);

      // Handles are stored as received, so both spellings are looked up.
      const applicantEmails = [
        ...new Set(
          validItems
            .map((item) => item.applicantEmail)
            .filter(isDefined)
            .flatMap((email) => [email, email.toLowerCase()]),
        ),
      ];
      const receivedTimes = [...reviewReceivedAtByThreadId.values()];
      const candidateReplies =
        isNonEmptyArray(applicantEmails) && isNonEmptyArray(receivedTimes)
          ? await this.getCandidateReplies(
              applicantEmails,
              new Date(
                Math.min(...receivedTimes.map((date) => date.getTime())),
              ),
            )
          : [];

      return validItems.map((item) => {
        const doneState = doneStates.get(item.messageThreadId);
        const reviewReceivedAt = reviewReceivedAtByThreadId.get(
          item.messageThreadId,
        );
        const reply =
          isDefined(item.applicantEmail) && isDefined(reviewReceivedAt)
            ? pickManualReviewReply({
                messages: candidateReplies,
                applicantEmail: item.applicantEmail,
                ownHandles,
                reviewReceivedAt,
              })
            : null;

        return {
          messageThreadId: item.messageThreadId,
          doneAt: doneState?.doneAt ?? null,
          doneByName: isDefined(doneState?.doneByWorkspaceMemberId)
            ? (doneByNameById.get(doneState.doneByWorkspaceMemberId) ?? null)
            : null,
          replyText: reply?.text ?? null,
          replySentAt: reply?.receivedAt ?? null,
        };
      });
    }, buildSystemAuthContext(workspaceId));
  }

  private async getReviewReceivedAtByThreadId(
    messageThreadIds: string[],
  ): Promise<Map<string, Date>> {
    const messages = await this.workspaceOrmManager
      .getRepository<MessageWorkspaceEntity>('message', {
        shouldBypassPermissionChecks: true,
      })
      .find({
        where: { messageThreadId: In(messageThreadIds) },
        select: { messageThreadId: true, receivedAt: true },
      });

    const receivedAtByThreadId = new Map<string, Date>();

    for (const message of messages) {
      if (
        !isDefined(message.messageThreadId) ||
        !isDefined(message.receivedAt)
      ) {
        continue;
      }

      const current = receivedAtByThreadId.get(message.messageThreadId);

      if (!isDefined(current) || message.receivedAt > current) {
        receivedAtByThreadId.set(message.messageThreadId, message.receivedAt);
      }
    }

    return receivedAtByThreadId;
  }

  private async getWorkspaceMemberNames(
    workspaceMemberIds: string[],
  ): Promise<Map<string, string>> {
    if (!isNonEmptyArray(workspaceMemberIds)) {
      return new Map();
    }

    const workspaceMembers = await this.workspaceOrmManager
      .getRepository<WorkspaceMemberWorkspaceEntity>('workspaceMember', {
        shouldBypassPermissionChecks: true,
      })
      .find({
        where: { id: In([...new Set(workspaceMemberIds)]) },
        select: { id: true, name: true },
      });

    return new Map(
      workspaceMembers.map((workspaceMember) => [
        workspaceMember.id,
        [workspaceMember.name?.firstName, workspaceMember.name?.lastName]
          .filter(isNonEmptyString)
          .join(' '),
      ]),
    );
  }

  private async getCandidateReplies(
    applicantEmails: string[],
    since: Date,
  ): Promise<CandidateReplyMessage[]> {
    const participantRepository =
      this.workspaceOrmManager.getRepository<MessageParticipantWorkspaceEntity>(
        'messageParticipant',
        { shouldBypassPermissionChecks: true },
      );

    const applicantParticipants = await participantRepository.find({
      where: {
        handle: In(applicantEmails),
        role: In([MessageParticipantRole.TO, MessageParticipantRole.CC]),
      },
      select: { messageId: true },
    });

    const messageIds = [
      ...new Set(
        applicantParticipants.map((participant) => participant.messageId),
      ),
    ];

    if (!isNonEmptyArray(messageIds)) {
      return [];
    }

    const [messages, participants] = await Promise.all([
      this.workspaceOrmManager
        .getRepository<MessageWorkspaceEntity>('message', {
          shouldBypassPermissionChecks: true,
        })
        .find({
          where: {
            id: In(messageIds),
            receivedAt: MoreThanOrEqual(since),
            isDraft: false,
          },
          select: { id: true, text: true, receivedAt: true },
        }),
      participantRepository.find({
        where: { messageId: In(messageIds) },
        select: { messageId: true, role: true, handle: true },
      }),
    ]);

    return messages.map((message) => ({
      id: message.id,
      text: message.text,
      receivedAt: message.receivedAt,
      participants: participants.filter(
        (participant) => participant.messageId === message.id,
      ),
    }));
  }
}
