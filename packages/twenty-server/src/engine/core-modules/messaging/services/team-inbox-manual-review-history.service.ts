import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { isNonEmptyString } from '@sniptt/guards';
import {
  MessageChannelVisibility,
  MessageParticipantRole,
} from 'twenty-shared/types';
import { isDefined, isNonEmptyArray, isValidUuid } from 'twenty-shared/utils';
import { Between, In, IsNull, type Repository } from 'typeorm';

import { MAX_MANUAL_REVIEW_HISTORY_ITEMS } from 'src/engine/core-modules/messaging/constants/manual-review-history.constants';
import { type ManualReviewHistoryEntryDTO } from 'src/engine/core-modules/messaging/dtos/manual-review-history-entry.dto';
import { TimelineMessagingService } from 'src/engine/core-modules/messaging/services/timeline-messaging.service';
import {
  type CandidateReplyMessage,
  getManualReviewDoneState,
  MANUAL_REVIEW_REPLY_GRACE_MS,
  pickManualReviewReply,
} from 'src/engine/core-modules/messaging/utils/team-inbox-manual-review-history.util';
import { getManualReviewDoneKey } from 'src/engine/core-modules/messaging/utils/team-inbox-manual-review.util';
import { UserVarsService } from 'src/engine/core-modules/user/user-vars/services/user-vars.service';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { type MessageParticipantWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message-participant.workspace-entity';
import { type MessageWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message.workspace-entity';
import { type WorkspaceMemberWorkspaceEntity } from 'src/modules/workspace-member/standard-objects/workspace-member.workspace-entity';

// Keeps the participant lookup within Postgres' bind-parameter limit when an
// address has received a great deal of mail.
const MAX_CANDIDATE_MESSAGES = 10_000;

type ManualReviewHistoryItem = {
  messageThreadId: string;
  applicantEmail?: string | null;
};

type DoneItem = {
  messageThreadId: string;
  applicantEmail: string | null;
  doneAt: Date | null;
  doneByWorkspaceMemberId: string | null;
};

@Injectable()
export class TeamInboxManualReviewHistoryService {
  constructor(
    private readonly workspaceOrmManager: WorkspaceOrmManager,
    private readonly timelineMessagingService: TimelineMessagingService,
    private readonly userVarsService: UserVarsService<
      Record<string, true | string>
    >,
    @InjectRepository(ConnectedAccountEntity)
    private readonly connectedAccountRepository: Repository<ConnectedAccountEntity>,
  ) {}

  async getHistory({
    workspaceId,
    workspaceMemberId,
    items,
  }: {
    workspaceId: string;
    workspaceMemberId: string;
    items: ManualReviewHistoryItem[];
  }): Promise<ManualReviewHistoryEntryDTO[]> {
    const [workspaceVars, ownHandles] = await Promise.all([
      this.userVarsService.getAll({ workspaceId }),
      this.getWorkspaceMailboxHandles(workspaceId),
    ]);

    // Only items someone marked done are answered; anything else returns nothing.
    const doneItems: DoneItem[] = items
      .filter((item) => isValidUuid(item.messageThreadId))
      .slice(0, MAX_MANUAL_REVIEW_HISTORY_ITEMS)
      .map((item) => {
        const applicantEmail = item.applicantEmail?.trim().toLowerCase();

        return {
          messageThreadId: item.messageThreadId,
          applicantEmail:
            isNonEmptyString(applicantEmail) && !ownHandles.has(applicantEmail)
              ? applicantEmail
              : null,
          ...getManualReviewDoneState(workspaceVars, item.messageThreadId),
        };
      })
      .filter((item) =>
        workspaceVars.has(getManualReviewDoneKey(item.messageThreadId)),
      );

    if (!isNonEmptyArray(doneItems)) {
      return [];
    }

    const visibleReviewThreadIds = await this.getFullyVisibleThreadIds(
      doneItems.map((item) => item.messageThreadId),
      workspaceMemberId,
      workspaceId,
    );
    const visibleItems = doneItems.filter((item) =>
      visibleReviewThreadIds.has(item.messageThreadId),
    );

    if (!isNonEmptyArray(visibleItems)) {
      return [];
    }

    return this.workspaceOrmManager.executeInWorkspaceContext(async () => {
      const [reviewReceivedAtByThreadId, doneByNameById] = await Promise.all([
        this.getReviewReceivedAtByThreadId(
          visibleItems.map((item) => item.messageThreadId),
        ),
        this.getWorkspaceMemberNames(
          visibleItems
            .map((item) => item.doneByWorkspaceMemberId)
            .filter(isDefined),
        ),
      ]);

      const windows = visibleItems.flatMap((item) => {
        const reviewReceivedAt = reviewReceivedAtByThreadId.get(
          item.messageThreadId,
        );

        return isDefined(item.applicantEmail) &&
          isDefined(item.doneAt) &&
          isDefined(reviewReceivedAt)
          ? [
              {
                item,
                applicantEmail: item.applicantEmail,
                doneAt: item.doneAt,
                reviewReceivedAt,
              },
            ]
          : [];
      });

      const candidateReplies = isNonEmptyArray(windows)
        ? await this.getVisibleCandidateReplies({
            applicantEmails: [
              ...new Set(windows.map((window) => window.applicantEmail)),
            ],
            from: new Date(
              Math.min(
                ...windows.map((window) => window.reviewReceivedAt.getTime()),
              ),
            ),
            until: new Date(
              Math.max(...windows.map((window) => window.doneAt.getTime())) +
                MANUAL_REVIEW_REPLY_GRACE_MS,
            ),
            workspaceMemberId,
            workspaceId,
          })
        : [];

      const replyByThreadId = new Map(
        windows.map((window) => [
          window.item.messageThreadId,
          pickManualReviewReply({
            messages: candidateReplies,
            applicantEmail: window.applicantEmail,
            ownHandles: [...ownHandles],
            reviewReceivedAt: window.reviewReceivedAt,
            doneAt: window.doneAt,
          }),
        ]),
      );

      const replyTextById = await this.getMessageTexts(
        [...replyByThreadId.values()]
          .filter(isDefined)
          .map((reply) => reply.id),
      );

      return visibleItems.map((item) => {
        const reply = replyByThreadId.get(item.messageThreadId) ?? null;

        return {
          messageThreadId: item.messageThreadId,
          doneAt: item.doneAt,
          doneByName: isDefined(item.doneByWorkspaceMemberId)
            ? (doneByNameById.get(item.doneByWorkspaceMemberId) ?? null)
            : null,
          replyText: isDefined(reply)
            ? (replyTextById.get(reply.id) ?? null)
            : null,
          replySentAt: reply?.receivedAt ?? null,
        };
      });
    }, buildSystemAuthContext(workspaceId));
  }

  private async getWorkspaceMailboxHandles(
    workspaceId: string,
  ): Promise<Set<string>> {
    const connectedAccounts = await this.connectedAccountRepository.find({
      where: { workspaceId, archivedAt: IsNull() },
      select: {
        handle: true,
        handleAliases: true,
        messageChannels: { handle: true },
      },
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
        .map((handle) => handle.trim().toLowerCase()),
    );
  }

  // Same rule as the inbox: message text only from mailboxes this member
  // owns or that share everything.
  private async getFullyVisibleThreadIds(
    messageThreadIds: string[],
    workspaceMemberId: string,
    workspaceId: string,
  ): Promise<Set<string>> {
    if (!isNonEmptyArray(messageThreadIds)) {
      return new Set();
    }

    const visibilityByThreadId =
      await this.timelineMessagingService.getThreadVisibilityByThreadId(
        messageThreadIds,
        workspaceMemberId,
        workspaceId,
      );

    return new Set(
      Object.entries(visibilityByThreadId)
        .filter(
          ([, visibility]) =>
            visibility === MessageChannelVisibility.SHARE_EVERYTHING,
        )
        .map(([messageThreadId]) => messageThreadId),
    );
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

    // The first email of the review thread starts the window, so a later
    // email in the same thread cannot push it past the real answer.
    const receivedAtByThreadId = new Map<string, Date>();

    for (const message of messages) {
      if (
        !isDefined(message.messageThreadId) ||
        !isDefined(message.receivedAt)
      ) {
        continue;
      }

      const current = receivedAtByThreadId.get(message.messageThreadId);

      if (!isDefined(current) || message.receivedAt < current) {
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

  private async getVisibleCandidateReplies({
    applicantEmails,
    from,
    until,
    workspaceMemberId,
    workspaceId,
  }: {
    applicantEmails: string[];
    from: Date;
    until: Date;
    workspaceMemberId: string;
    workspaceId: string;
  }): Promise<(CandidateReplyMessage & { messageThreadId: string })[]> {
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
      take: MAX_CANDIDATE_MESSAGES,
    });

    const candidateIds = [
      ...new Set(
        applicantParticipants.map((participant) => participant.messageId),
      ),
    ];

    if (!isNonEmptyArray(candidateIds)) {
      return [];
    }

    const messages = await this.workspaceOrmManager
      .getRepository<MessageWorkspaceEntity>('message', {
        shouldBypassPermissionChecks: true,
      })
      .find({
        where: {
          id: In(candidateIds),
          receivedAt: Between(from, until),
          isDraft: false,
        },
        select: { id: true, receivedAt: true, messageThreadId: true },
      });

    const visibleThreadIds = await this.getFullyVisibleThreadIds(
      [...new Set(messages.map((message) => message.messageThreadId))].filter(
        isDefined,
      ),
      workspaceMemberId,
      workspaceId,
    );
    const visibleMessages = messages.filter(
      (message) =>
        isDefined(message.messageThreadId) &&
        isDefined(message.receivedAt) &&
        visibleThreadIds.has(message.messageThreadId),
    );

    if (!isNonEmptyArray(visibleMessages)) {
      return [];
    }

    const participants = await participantRepository.find({
      where: { messageId: In(visibleMessages.map((message) => message.id)) },
      select: { messageId: true, role: true, handle: true },
    });

    const participantsByMessageId = new Map<
      string,
      CandidateReplyMessage['participants']
    >();

    for (const participant of participants) {
      participantsByMessageId.set(participant.messageId, [
        ...(participantsByMessageId.get(participant.messageId) ?? []),
        { role: participant.role, handle: participant.handle },
      ]);
    }

    return visibleMessages.flatMap((message) =>
      isDefined(message.receivedAt) && isDefined(message.messageThreadId)
        ? [
            {
              id: message.id,
              messageThreadId: message.messageThreadId,
              receivedAt: message.receivedAt,
              participants: participantsByMessageId.get(message.id) ?? [],
            },
          ]
        : [],
    );
  }

  private async getMessageTexts(
    messageIds: string[],
  ): Promise<Map<string, string>> {
    if (!isNonEmptyArray(messageIds)) {
      return new Map();
    }

    const messages = await this.workspaceOrmManager
      .getRepository<MessageWorkspaceEntity>('message', {
        shouldBypassPermissionChecks: true,
      })
      .find({
        where: { id: In(messageIds) },
        select: { id: true, text: true },
      });

    return new Map(
      messages.flatMap((message) =>
        isNonEmptyString(message.text) ? [[message.id, message.text]] : [],
      ),
    );
  }
}
