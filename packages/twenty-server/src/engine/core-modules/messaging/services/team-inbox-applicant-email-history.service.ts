import { Injectable } from '@nestjs/common';

import { isNonEmptyString } from '@sniptt/guards';
import chunk from 'lodash.chunk';
import { FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED } from 'twenty-shared/constants';
import { MessageParticipantRole } from 'twenty-shared/types';
import {
  escapeForIlike,
  isDefined,
  isNonEmptyArray,
  isValidUuid,
} from 'twenty-shared/utils';
import { ILike, In } from 'typeorm';

import {
  APPLICANT_EMAIL_HISTORY_MAX_CANDIDATES,
  APPLICANT_EMAIL_HISTORY_MAX_MESSAGES,
} from 'src/engine/core-modules/messaging/constants/applicant-email-history.constants';
import { type ApplicantEmailHistoryDTO } from 'src/engine/core-modules/messaging/dtos/applicant-email-history.dto';
import { TeamInboxManualReviewHistoryService } from 'src/engine/core-modules/messaging/services/team-inbox-manual-review-history.service';
import {
  type ApplicantMatcher,
  type HistoryParticipant,
  isApplicantParticipant,
  toApplicantEmailHistoryMessage,
} from 'src/engine/core-modules/messaging/utils/to-applicant-email-history-message.util';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { ApplyMessagesVisibilityRestrictionsService } from 'src/modules/messaging/common/query-hooks/message/apply-messages-visibility-restrictions.service';
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

const isRestricted = (value: string | null) =>
  value === FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED;

// Every email to or from one applicant across all threads, for the Needs
// review "All emails" view. Same visibility as the inbox thread list and the
// thread view: a message is returned only when its body would be shown there.
@Injectable()
export class TeamInboxApplicantEmailHistoryService {
  constructor(
    private readonly workspaceOrmManager: WorkspaceOrmManager,
    private readonly teamInboxManualReviewHistoryService: TeamInboxManualReviewHistoryService,
    private readonly applyMessagesVisibilityRestrictionsService: ApplyMessagesVisibilityRestrictionsService,
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
    };

    if (!isDefined(applicant.handle) && !isDefined(applicant.personId)) {
      return EMPTY_HISTORY;
    }

    const candidates = await this.workspaceOrmManager.executeInWorkspaceContext(
      () => this.getCandidates(applicant),
      buildSystemAuthContext(workspaceId),
    );

    const visibleThreadIds =
      await this.teamInboxManualReviewHistoryService.getFullyVisibleThreadIds(
        [...new Set(candidates.map((candidate) => candidate.messageThreadId))],
        workspaceMemberId,
        workspaceId,
      );

    const visibleMessages: MessageWorkspaceEntity[] = [];

    // Newest first, so the cap keeps the latest emails.
    for (const candidateChunk of chunk(
      candidates.filter((candidate) =>
        visibleThreadIds.has(candidate.messageThreadId),
      ),
      APPLICANT_EMAIL_HISTORY_MAX_MESSAGES + 1,
    )) {
      visibleMessages.push(
        ...(await this.getFullyVisibleMessages(
          candidateChunk,
          workspaceId,
          userId,
        )),
      );

      if (visibleMessages.length > APPLICANT_EMAIL_HISTORY_MAX_MESSAGES) {
        break;
      }
    }

    const messages = visibleMessages.slice(
      0,
      APPLICANT_EMAIL_HISTORY_MAX_MESSAGES,
    );

    if (!isNonEmptyArray(messages)) {
      return EMPTY_HISTORY;
    }

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
          ownHandles,
        }),
      ),
      isTruncated:
        visibleMessages.length > APPLICANT_EMAIL_HISTORY_MAX_MESSAGES,
    };
  }

  // Must run inside a workspace context. Newest first, drafts left out.
  private async getCandidates(
    applicant: ApplicantMatcher,
  ): Promise<Candidate[]> {
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
        select: { messageId: true, handle: true, personId: true },
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

    return candidates.sort(
      (first, second) =>
        second.sortAt - first.sortAt || second.id.localeCompare(first.id),
    );
  }

  // The thread view's per-message rule, so this view never shows a body the
  // thread would hide. Keeps the candidates' order.
  private async getFullyVisibleMessages(
    candidates: Candidate[],
    workspaceId: string,
    userId: string,
  ): Promise<MessageWorkspaceEntity[]> {
    const found = await this.workspaceOrmManager.executeInWorkspaceContext(
      () =>
        this.workspaceOrmManager
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
          }),
      buildSystemAuthContext(workspaceId),
    );

    const orderById = new Map(candidates.map(({ id }, index) => [id, index]));
    const ordered = found
      .filter((message) => orderById.has(message.id))
      .sort(
        (first, second) =>
          (orderById.get(first.id) ?? 0) - (orderById.get(second.id) ?? 0),
      );

    const visible =
      await this.applyMessagesVisibilityRestrictionsService.applyMessagesVisibilityRestrictions(
        ordered,
        workspaceId,
        userId,
      );

    return visible.filter(
      (message) =>
        !isRestricted(message.text) && !isRestricted(message.subject),
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
