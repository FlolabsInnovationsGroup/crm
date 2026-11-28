import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { isNonEmptyString } from '@sniptt/guards';
import chunk from 'lodash.chunk';
import { MessageParticipantRole } from 'twenty-shared/types';
import {
  escapeForIlike,
  isDefined,
  isNonEmptyArray,
  isValidUuid,
} from 'twenty-shared/utils';
import { ILike, In, type Repository } from 'typeorm';

import {
  APPLICANT_EMAIL_HISTORY_MAX_CANDIDATES,
  APPLICANT_EMAIL_HISTORY_MAX_MESSAGES,
} from 'src/engine/core-modules/messaging/constants/applicant-email-history.constants';
import { type ApplicantEmailHistoryDTO } from 'src/engine/core-modules/messaging/dtos/applicant-email-history.dto';
import { TeamInboxManualReviewHistoryService } from 'src/engine/core-modules/messaging/services/team-inbox-manual-review-history.service';
import { getFullyVisibleMessageIds } from 'src/engine/core-modules/messaging/utils/get-fully-visible-message-ids.util';
import {
  type ApplicantMatcher,
  type HistoryParticipant,
  isApplicantParticipant,
  toApplicantEmailHistoryMessage,
} from 'src/engine/core-modules/messaging/utils/to-applicant-email-history-message.util';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { MessageChannelEntity } from 'src/engine/metadata-modules/message-channel/entities/message-channel.entity';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { type MessageChannelMessageAssociationWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message-channel-message-association.workspace-entity';
import { type MessageParticipantWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message-participant.workspace-entity';
import { type MessageWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message.workspace-entity';

const PARTICIPANT_ROLES = [
  MessageParticipantRole.FROM,
  MessageParticipantRole.TO,
  MessageParticipantRole.CC,
  MessageParticipantRole.BCC,
];

const LOOKUP_CHUNK_SIZE = 1_000;

type Candidate = {
  id: string;
  messageThreadId: string;
  sortAt: number;
};

const EMPTY_HISTORY: ApplicantEmailHistoryDTO = {
  messages: [],
  isTruncated: false,
};

// Every email to or from one applicant across all threads, for the Needs
// review "All emails" view. Same visibility as the inbox thread list and the
// thread view: a message is returned only when its body would be shown there.
@Injectable()
export class TeamInboxApplicantEmailHistoryService {
  constructor(
    private readonly workspaceOrmManager: WorkspaceOrmManager,
    private readonly teamInboxManualReviewHistoryService: TeamInboxManualReviewHistoryService,
    @InjectRepository(MessageChannelEntity)
    private readonly messageChannelRepository: Repository<MessageChannelEntity>,
    @InjectRepository(ConnectedAccountEntity)
    private readonly connectedAccountRepository: Repository<ConnectedAccountEntity>,
    @InjectRepository(UserWorkspaceEntity)
    private readonly userWorkspaceRepository: Repository<UserWorkspaceEntity>,
  ) {}

  async getApplicantEmailHistory({
    workspaceId,
    workspaceMemberId,
    userId,
    applicantEmail,
    personId,
  }: {
    workspaceId: string;
    workspaceMemberId: string;
    userId: string;
    applicantEmail: string;
    personId: string | null;
  }): Promise<ApplicantEmailHistoryDTO> {
    const ownHandles =
      await this.teamInboxManualReviewHistoryService.getWorkspaceMailboxHandles(
        workspaceId,
      );
    const handle = applicantEmail.trim().toLowerCase();
    // A team mailbox as the applicant would list the whole mailbox.
    const applicant: ApplicantMatcher = {
      handle:
        isNonEmptyString(handle) && !ownHandles.has(handle) ? handle : null,
      personId: isDefined(personId) && isValidUuid(personId) ? personId : null,
      ownHandles,
    };

    if (!isDefined(applicant.handle) && !isDefined(applicant.personId)) {
      return EMPTY_HISTORY;
    }

    const { candidates, isCandidateLimitHit } =
      await this.workspaceOrmManager.executeInWorkspaceContext(
        () => this.getCandidates(applicant),
        buildSystemAuthContext(workspaceId),
      );

    const visibleThreadIds =
      await this.teamInboxManualReviewHistoryService.getFullyVisibleThreadIds(
        [...new Set(candidates.map((candidate) => candidate.messageThreadId))],
        workspaceMemberId,
        workspaceId,
      );

    const ownedConnectedAccountIds = await this.getOwnedConnectedAccountIds(
      userId,
      workspaceId,
    );
    const visibleCandidates: Candidate[] = [];

    // Newest first, so the cap keeps the latest emails.
    for (const candidateChunk of chunk(
      candidates.filter((candidate) =>
        visibleThreadIds.has(candidate.messageThreadId),
      ),
      LOOKUP_CHUNK_SIZE,
    )) {
      const fullyVisibleIds = await this.getFullyVisibleMessageIds(
        candidateChunk.map(({ id }) => id),
        ownedConnectedAccountIds,
        workspaceId,
      );

      visibleCandidates.push(
        ...candidateChunk.filter(({ id }) => fullyVisibleIds.has(id)),
      );

      if (visibleCandidates.length > APPLICANT_EMAIL_HISTORY_MAX_MESSAGES) {
        break;
      }
    }

    const keptCandidates = visibleCandidates.slice(
      0,
      APPLICANT_EMAIL_HISTORY_MAX_MESSAGES,
    );

    if (!isNonEmptyArray(keptCandidates)) {
      return EMPTY_HISTORY;
    }

    const messages = await this.workspaceOrmManager.executeInWorkspaceContext(
      () => this.getMessages(keptCandidates),
      buildSystemAuthContext(workspaceId),
    );

    const participantsByMessageId =
      await this.workspaceOrmManager.executeInWorkspaceContext(
        () => this.getParticipantsByMessageId(messages.map(({ id }) => id)),
        buildSystemAuthContext(workspaceId),
      );

    return {
      messages: messages.reverse().map((message) =>
        toApplicantEmailHistoryMessage({
          message: {
            id: message.id,
            messageThreadId: message.messageThreadId ?? '',
            subject: message.subject,
            text: message.text,
            receivedAt: message.receivedAt,
            headerMessageId: message.headerMessageId,
          },
          participants: participantsByMessageId.get(message.id) ?? [],
          applicant,
        }),
      ),
      // A hit participant limit may have left out older emails.
      isTruncated:
        isCandidateLimitHit ||
        visibleCandidates.length > APPLICANT_EMAIL_HISTORY_MAX_MESSAGES,
    };
  }

  // Must run inside a workspace context. Newest first, drafts left out.
  private async getCandidates(
    applicant: ApplicantMatcher,
  ): Promise<{ candidates: Candidate[]; isCandidateLimitHit: boolean }> {
    const participants = await this.workspaceOrmManager
      .getRepository<MessageParticipantWorkspaceEntity>('messageParticipant', {
        shouldBypassPermissionChecks: true,
      })
      .find({
        where: [
          ...(isDefined(applicant.handle)
            ? [
                {
                  handle: ILike(escapeForIlike(applicant.handle)),
                  role: In(PARTICIPANT_ROLES),
                },
              ]
            : []),
          ...(isDefined(applicant.personId)
            ? [{ personId: applicant.personId, role: In(PARTICIPANT_ROLES) }]
            : []),
        ],
        select: {
          messageId: true,
          handle: true,
          personId: true,
          workspaceMemberId: true,
        },
        order: { createdAt: 'DESC' },
        take: APPLICANT_EMAIL_HISTORY_MAX_CANDIDATES,
      });

    const messageIds = [
      ...new Set(
        participants
          .filter((participant) =>
            isApplicantParticipant(participant, applicant),
          )
          .map((participant) => participant.messageId),
      ),
    ];

    const candidates: Candidate[] = [];

    for (const messageIdChunk of chunk(messageIds, LOOKUP_CHUNK_SIZE)) {
      const messages = await this.workspaceOrmManager
        .getRepository<MessageWorkspaceEntity>('message', {
          shouldBypassPermissionChecks: true,
        })
        .find({
          where: { id: In(messageIdChunk), isDraft: false },
          select: {
            id: true,
            messageThreadId: true,
            receivedAt: true,
            createdAt: true,
          },
        });

      for (const message of messages) {
        if (!isDefined(message.messageThreadId)) {
          continue;
        }

        candidates.push({
          id: message.id,
          messageThreadId: message.messageThreadId,
          sortAt: new Date(message.receivedAt ?? message.createdAt).getTime(),
        });
      }
    }

    return {
      candidates: candidates.sort(
        (first, second) =>
          second.sortAt - first.sortAt || second.id.localeCompare(first.id),
      ),
      isCandidateLimitHit:
        participants.length >= APPLICANT_EMAIL_HISTORY_MAX_CANDIDATES,
    };
  }

  private async getOwnedConnectedAccountIds(
    userId: string,
    workspaceId: string,
  ): Promise<Set<string>> {
    const userWorkspace = await this.userWorkspaceRepository.findOne({
      where: { userId, workspaceId },
      select: { id: true },
    });

    if (!isDefined(userWorkspace)) {
      return new Set();
    }

    const connectedAccounts = await this.connectedAccountRepository.find({
      where: { userWorkspaceId: userWorkspace.id, workspaceId },
      select: { id: true },
    });

    return new Set(connectedAccounts.map(({ id }) => id));
  }

  // The thread view's per-message rule, batched: see
  // getFullyVisibleMessageIds.
  private async getFullyVisibleMessageIds(
    messageIds: string[],
    ownedConnectedAccountIds: Set<string>,
    workspaceId: string,
  ): Promise<Set<string>> {
    const associations =
      await this.workspaceOrmManager.executeInWorkspaceContext(
        () =>
          this.workspaceOrmManager
            .getRepository<MessageChannelMessageAssociationWorkspaceEntity>(
              'messageChannelMessageAssociation',
              { shouldBypassPermissionChecks: true },
            )
            .find({
              where: { messageId: In(messageIds) },
              select: { messageId: true, messageChannelId: true },
            }),
        buildSystemAuthContext(workspaceId),
      );
    const messageChannelIds = [
      ...new Set(associations.map(({ messageChannelId }) => messageChannelId)),
    ];

    if (!isNonEmptyArray(messageChannelIds)) {
      return new Set();
    }

    const channels = await this.messageChannelRepository.find({
      where: { id: In(messageChannelIds), workspaceId },
      select: { id: true, visibility: true, connectedAccountId: true },
    });

    return getFullyVisibleMessageIds({
      associations,
      channels,
      ownedConnectedAccountIds,
    });
  }

  // Must run inside a workspace context. Keeps the candidates' order.
  private async getMessages(
    candidates: Candidate[],
  ): Promise<MessageWorkspaceEntity[]> {
    const found = await this.workspaceOrmManager
      .getRepository<MessageWorkspaceEntity>('message', {
        shouldBypassPermissionChecks: true,
      })
      .find({
        where: { id: In(candidates.map(({ id }) => id)) },
        select: {
          id: true,
          messageThreadId: true,
          subject: true,
          text: true,
          receivedAt: true,
          headerMessageId: true,
        },
      });
    const orderById = new Map(candidates.map(({ id }, index) => [id, index]));

    return found
      .filter((message) => orderById.has(message.id))
      .sort(
        (first, second) =>
          (orderById.get(first.id) ?? 0) - (orderById.get(second.id) ?? 0),
      );
  }

  // Must run inside a workspace context.
  private async getParticipantsByMessageId(
    messageIds: string[],
  ): Promise<Map<string, HistoryParticipant[]>> {
    const participants = await this.workspaceOrmManager
      .getRepository<MessageParticipantWorkspaceEntity>('messageParticipant', {
        shouldBypassPermissionChecks: true,
      })
      .find({
        where: { messageId: In(messageIds) },
        select: {
          messageId: true,
          role: true,
          handle: true,
          displayName: true,
          personId: true,
          workspaceMemberId: true,
        },
      });

    const participantsByMessageId = new Map<string, HistoryParticipant[]>();

    for (const { messageId, ...participant } of participants) {
      participantsByMessageId.set(messageId, [
        ...(participantsByMessageId.get(messageId) ?? []),
        participant,
      ]);
    }

    return participantsByMessageId;
  }
}
