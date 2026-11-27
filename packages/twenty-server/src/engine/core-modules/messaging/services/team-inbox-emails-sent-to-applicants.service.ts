import { Injectable } from '@nestjs/common';

import { isNonEmptyString } from '@sniptt/guards';
import chunk from 'lodash.chunk';
import { MessageParticipantRole } from 'twenty-shared/types';
import { isDefined, isNonEmptyArray, isValidUuid } from 'twenty-shared/utils';
import { In, IsNull, MoreThan, MoreThanOrEqual } from 'typeorm';

import { MAX_EMAILS_SENT_TO_APPLICANTS_ITEMS } from 'src/engine/core-modules/messaging/constants/emails-sent-to-applicants.constants';
import { type EmailSentToApplicantDTO } from 'src/engine/core-modules/messaging/dtos/email-sent-to-applicant.dto';
import { TeamInboxManualReviewHistoryService } from 'src/engine/core-modules/messaging/services/team-inbox-manual-review-history.service';
import { getEmailSentExcerpt } from 'src/engine/core-modules/messaging/utils/get-email-sent-excerpt.util';
import {
  getSender,
  pickEmailSentToApplicant,
  type SentEmailCandidate,
} from 'src/engine/core-modules/messaging/utils/pick-email-sent-to-applicant.util';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { type MessageParticipantWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message-participant.workspace-entity';
import { type MessageWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message.workspace-entity';

const PAGE_SIZE = 1_000;

type ReviewItem = { messageThreadId: string; applicantEmail: string };

type CandidateMessage = SentEmailCandidate & {
  messageThreadId: string;
  subject: string | null;
};

// For each open Needs review card, the newest email our mailboxes sent the
// applicant after the card arrived, so the team can see who was already
// answered outside the card. Drafts, campaigns and mailboxes this member
// cannot read are left out.
@Injectable()
export class TeamInboxEmailsSentToApplicantsService {
  constructor(
    private readonly workspaceOrmManager: WorkspaceOrmManager,
    private readonly teamInboxManualReviewHistoryService: TeamInboxManualReviewHistoryService,
  ) {}

  async getEmailsSentToApplicants({
    workspaceId,
    workspaceMemberId,
    items,
  }: {
    workspaceId: string;
    workspaceMemberId: string;
    items: ReviewItem[];
  }): Promise<EmailSentToApplicantDTO[]> {
    const ownHandles =
      await this.teamInboxManualReviewHistoryService.getWorkspaceMailboxHandles(
        workspaceId,
      );

    const reviewItems = items
      .slice(0, MAX_EMAILS_SENT_TO_APPLICANTS_ITEMS)
      .map((item) => ({
        messageThreadId: item.messageThreadId,
        applicantEmail: item.applicantEmail.trim().toLowerCase(),
      }))
      .filter(
        (item) =>
          isValidUuid(item.messageThreadId) &&
          isNonEmptyString(item.applicantEmail) &&
          !ownHandles.has(item.applicantEmail),
      );

    if (!isNonEmptyArray(reviewItems)) {
      return [];
    }

    const candidates = await this.workspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const reviewReceivedAtByThreadId =
          await this.teamInboxManualReviewHistoryService.getReviewReceivedAtByThreadId(
            reviewItems.map((item) => item.messageThreadId),
          );
        const receivedAts = [...reviewReceivedAtByThreadId.values()];

        if (!isNonEmptyArray(receivedAts)) {
          return { reviewReceivedAtByThreadId, messages: [] };
        }

        const messages = await this.getCandidateMessages(
          [...new Set(reviewItems.map((item) => item.applicantEmail))],
          new Date(Math.min(...receivedAts.map((date) => date.getTime()))),
        );

        return { reviewReceivedAtByThreadId, messages };
      },
      buildSystemAuthContext(workspaceId),
    );

    const visibleThreadIds =
      await this.teamInboxManualReviewHistoryService.getFullyVisibleThreadIds(
        [
          ...new Set(
            candidates.messages.map((message) => message.messageThreadId),
          ),
        ],
        workspaceMemberId,
        workspaceId,
      );
    const visibleMessages = candidates.messages.filter((message) =>
      visibleThreadIds.has(message.messageThreadId),
    );

    const picked = reviewItems.flatMap((item) => {
      const after = candidates.reviewReceivedAtByThreadId.get(
        item.messageThreadId,
      );
      const message = isDefined(after)
        ? pickEmailSentToApplicant({
            candidates: visibleMessages,
            applicantEmail: item.applicantEmail,
            ownHandles,
            after,
          })
        : null;

      return isDefined(message) ? [{ item, message }] : [];
    });

    if (!isNonEmptyArray(picked)) {
      return [];
    }

    const textById = await this.workspaceOrmManager.executeInWorkspaceContext(
      () =>
        this.getMessageTexts([
          ...new Set(picked.map(({ message }) => message.id)),
        ]),
      buildSystemAuthContext(workspaceId),
    );

    return picked.map(({ item, message }) => {
      const sender = getSender(message);

      return {
        messageThreadId: item.messageThreadId,
        sentAt: message.receivedAt,
        subject: message.subject,
        excerpt: getEmailSentExcerpt(textById.get(message.id) ?? null),
        senderName: isNonEmptyString(sender?.displayName)
          ? sender.displayName
          : null,
        senderEmail: sender?.handle ?? null,
      };
    });
  }

  // Must run inside a workspace context. Every email to these applicants
  // synced since the oldest card; paged so none is silently dropped.
  private async getCandidateMessages(
    applicantEmails: string[],
    since: Date,
  ): Promise<CandidateMessage[]> {
    const participantRepository =
      this.workspaceOrmManager.getRepository<MessageParticipantWorkspaceEntity>(
        'messageParticipant',
        { shouldBypassPermissionChecks: true },
      );
    const messageRepository =
      this.workspaceOrmManager.getRepository<MessageWorkspaceEntity>(
        'message',
        { shouldBypassPermissionChecks: true },
      );

    const messageIds = new Set<string>();
    let cursor: string | undefined;

    for (;;) {
      // A participant row is created when its email syncs, never before the
      // email arrived, so createdAt bounds the search safely.
      const page = await participantRepository.find({
        where: {
          handle: In(applicantEmails),
          role: In([MessageParticipantRole.TO, MessageParticipantRole.CC]),
          createdAt: MoreThanOrEqual(since),
          ...(isDefined(cursor) ? { id: MoreThan(cursor) } : {}),
        },
        order: { id: 'ASC' },
        take: PAGE_SIZE,
        select: { id: true, messageId: true },
      });

      if (!isNonEmptyArray(page)) {
        break;
      }

      cursor = page[page.length - 1].id;
      page.forEach((participant) => messageIds.add(participant.messageId));
    }

    const messages: CandidateMessage[] = [];

    for (const messageIdChunk of chunk([...messageIds], PAGE_SIZE)) {
      const found = await messageRepository.find({
        where: {
          id: In(messageIdChunk),
          receivedAt: MoreThan(since),
          isDraft: false,
          messageCampaignId: IsNull(),
        },
        select: {
          id: true,
          receivedAt: true,
          messageThreadId: true,
          subject: true,
        },
      });

      if (!isNonEmptyArray(found)) {
        continue;
      }

      const participants = await participantRepository.find({
        where: { messageId: In(found.map((message) => message.id)) },
        select: {
          messageId: true,
          role: true,
          handle: true,
          displayName: true,
        },
      });

      const participantsByMessageId = new Map<
        string,
        CandidateMessage['participants']
      >();

      for (const { messageId, role, handle, displayName } of participants) {
        participantsByMessageId.set(messageId, [
          ...(participantsByMessageId.get(messageId) ?? []),
          { role, handle, displayName },
        ]);
      }

      for (const message of found) {
        if (
          !isDefined(message.receivedAt) ||
          !isDefined(message.messageThreadId)
        ) {
          continue;
        }

        messages.push({
          id: message.id,
          receivedAt: new Date(message.receivedAt),
          messageThreadId: message.messageThreadId,
          subject: message.subject,
          participants: participantsByMessageId.get(message.id) ?? [],
        });
      }
    }

    return messages;
  }

  private async getMessageTexts(
    messageIds: string[],
  ): Promise<Map<string, string>> {
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
