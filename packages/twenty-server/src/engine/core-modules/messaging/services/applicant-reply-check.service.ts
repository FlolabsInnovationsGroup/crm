import { Injectable } from '@nestjs/common';

import { isNonEmptyString } from '@sniptt/guards';
import chunk from 'lodash.chunk';
import { MessageParticipantRole } from 'twenty-shared/types';
import { isDefined, isNonEmptyArray } from 'twenty-shared/utils';
import { In, IsNull } from 'typeorm';

import {
  REMINDER_SEND_WINDOW_MS,
  REMINDER_STAGES,
} from 'src/engine/core-modules/messaging/constants/applicant-reply-check.constants';
import { type ApplicantRemindedAfterReplyDTO } from 'src/engine/core-modules/messaging/dtos/applicant-reminded-after-reply.dto';
import { type ApplicantReplyStateDTO } from 'src/engine/core-modules/messaging/dtos/applicant-reply-state.dto';
import { TeamInboxManualReviewHistoryService } from 'src/engine/core-modules/messaging/services/team-inbox-manual-review-history.service';
import {
  type ConversationMessage,
  getApplicantReplyState,
  isAwaitingOurReply,
} from 'src/engine/core-modules/messaging/utils/get-applicant-reply-state.util';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { addPersonEmailFiltersToQueryBuilder } from 'src/modules/match-participant/utils/add-person-email-filters-to-query-builder';
import { type MessageParticipantWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message-participant.workspace-entity';
import { type MessageWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message.workspace-entity';

const PAGE_SIZE = 1_000;

type PersonRecord = {
  id: string;
  name: { firstName?: string | null; lastName?: string | null } | null;
  emails: {
    primaryEmail?: string | null;
    additionalEmails?: string[] | null;
  } | null;
  stage: string | null;
  deletedAt?: string | Date | null;
};

type StageChange = {
  id: string;
  happensAt: string | Date;
  targetPersonId: string;
  properties: { diff?: { stage?: { after?: string } } } | null;
};

const normalize = (email: string) => email.trim().toLowerCase();

const getPersonEmails = (person: PersonRecord) =>
  [person.emails?.primaryEmail, ...(person.emails?.additionalEmails ?? [])]
    .filter(isNonEmptyString)
    .map(normalize);

// Answers "has this applicant written to us since our last email?" from the
// messages the CRM has synced. Returns times only, never message content, so
// it is safe for the n8n API key that has no mailbox of its own.
@Injectable()
export class ApplicantReplyCheckService {
  constructor(
    private readonly workspaceOrmManager: WorkspaceOrmManager,
    private readonly teamInboxManualReviewHistoryService: TeamInboxManualReviewHistoryService,
  ) {}

  async getReplyState({
    workspaceId,
    email,
    since,
  }: {
    workspaceId: string;
    email: string;
    since: Date | null;
  }): Promise<ApplicantReplyStateDTO> {
    const normalizedEmail = normalize(email);
    const ownHandles =
      await this.teamInboxManualReviewHistoryService.getWorkspaceMailboxHandles(
        workspaceId,
      );

    return this.workspaceOrmManager.executeInWorkspaceContext(async () => {
      const person = await this.findPersonByEmail(normalizedEmail);
      const handles = [
        ...new Set([
          normalizedEmail,
          ...(isDefined(person) ? getPersonEmails(person) : []),
        ]),
      ].filter((handle) => !ownHandles.has(handle));

      const messagesByHandle = await this.getConversations(handles, ownHandles);
      const state = getApplicantReplyState({
        messages: handles.flatMap(
          (handle) => messagesByHandle.get(handle) ?? [],
        ),
      });

      return {
        email: normalizedEmail,
        personId: person?.id ?? null,
        stage: person?.stage ?? null,
        ...state,
        isAwaitingOurReply: isAwaitingOurReply(state),
        hasRepliedSince:
          isDefined(since) &&
          isDefined(state.lastApplicantMessageAt) &&
          state.lastApplicantMessageAt.getTime() > since.getTime(),
      };
    }, buildSystemAuthContext(workspaceId));
  }

  // Every reminder stage change in the period where, just before it, the
  // applicant had written last.
  async findRemindedAfterReply({
    workspaceId,
    days,
  }: {
    workspaceId: string;
    days: number;
  }): Promise<ApplicantRemindedAfterReplyDTO[]> {
    const ownHandles =
      await this.teamInboxManualReviewHistoryService.getWorkspaceMailboxHandles(
        workspaceId,
      );
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    return this.workspaceOrmManager.executeInWorkspaceContext(async () => {
      const reminders = await this.getReminderStageChanges(since);

      if (!isNonEmptyArray(reminders)) {
        return [];
      }

      const people = await this.workspaceOrmManager
        .getRepository<PersonRecord>('person', {
          shouldBypassPermissionChecks: true,
        })
        .find({
          where: {
            id: In([
              ...new Set(reminders.map((reminder) => reminder.targetPersonId)),
            ]),
          },
        });
      const peopleById = new Map(people.map((person) => [person.id, person]));
      const messagesByHandle = await this.getConversations(
        [...new Set(people.flatMap(getPersonEmails))].filter(
          (handle) => !ownHandles.has(handle),
        ),
        ownHandles,
      );

      return reminders.flatMap((reminder) => {
        const person = peopleById.get(reminder.targetPersonId);

        if (!isDefined(person)) {
          return [];
        }

        const remindedAt = new Date(reminder.happensAt);
        const emails = getPersonEmails(person);
        const state = getApplicantReplyState({
          messages: emails.flatMap(
            (email) => messagesByHandle.get(email) ?? [],
          ),
          before: new Date(remindedAt.getTime() - REMINDER_SEND_WINDOW_MS),
        });

        if (
          !isAwaitingOurReply(state) ||
          !isDefined(state.lastApplicantMessageAt)
        ) {
          return [];
        }

        return [
          {
            personId: person.id,
            name:
              [person.name?.firstName, person.name?.lastName]
                .filter(isNonEmptyString)
                .join(' ') || null,
            email: emails[0] ?? null,
            currentStage: person.stage,
            reminderStage: reminder.properties?.diff?.stage?.after ?? '',
            remindedAt,
            applicantMessageAt: state.lastApplicantMessageAt,
            lastSentBeforeReminderAt: state.lastSentToApplicantAt,
          },
        ];
      });
    }, buildSystemAuthContext(workspaceId));
  }

  // Must run inside a workspace context.
  private async findPersonByEmail(email: string): Promise<PersonRecord | null> {
    const matchingPeople = (await addPersonEmailFiltersToQueryBuilder({
      queryBuilder: this.workspaceOrmManager
        .getRepository('person', { shouldBypassPermissionChecks: true })
        .createQueryBuilder('person'),
      emails: [email],
    })
      .orderBy('person.createdAt', 'ASC')
      .getMany()) as PersonRecord[];

    return (
      matchingPeople.find((person) => !isDefined(person.deletedAt)) ?? null
    );
  }

  // Must run inside a workspace context.
  private async getReminderStageChanges(since: Date): Promise<StageChange[]> {
    const repository = this.workspaceOrmManager.getRepository(
      'timelineActivity',
      { shouldBypassPermissionChecks: true },
    );
    const changes: StageChange[] = [];
    let cursor: string | undefined;

    for (;;) {
      let queryBuilder = repository
        .createQueryBuilder('timelineActivity')
        .where('"timelineActivity"."happensAt" >= :since', { since })
        .andWhere('"timelineActivity"."targetPersonId" IS NOT NULL')
        .andWhere(
          `"timelineActivity"."properties"->'diff'->'stage'->>'after' IN (:...stages)`,
          { stages: REMINDER_STAGES },
        );

      if (isDefined(cursor)) {
        queryBuilder = queryBuilder.andWhere(
          '"timelineActivity"."id" > :cursor',
          { cursor },
        );
      }

      const page = (await queryBuilder
        .orderBy('timelineActivity.id', 'ASC')
        .limit(PAGE_SIZE)
        .getMany()) as StageChange[];

      changes.push(...page);

      if (page.length < PAGE_SIZE) {
        return changes;
      }

      cursor = page[page.length - 1].id;
    }
  }

  // Must run inside a workspace context. Each applicant's synced emails,
  // marked as written by them or sent to them by one of our mailboxes.
  private async getConversations(
    applicantHandles: string[],
    ownHandles: Set<string>,
  ): Promise<Map<string, ConversationMessage[]>> {
    const messagesByHandle = new Map<string, ConversationMessage[]>();

    if (!isNonEmptyArray(applicantHandles)) {
      return messagesByHandle;
    }

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

    for (const handleChunk of chunk(applicantHandles, PAGE_SIZE)) {
      const applicantHandleSet = new Set(handleChunk);
      const applicantParticipants = await participantRepository.find({
        where: { handle: In(handleChunk) },
        select: { messageId: true },
      });
      const messageIds = [
        ...new Set(
          applicantParticipants.map((participant) => participant.messageId),
        ),
      ];

      for (const messageIdChunk of chunk(messageIds, PAGE_SIZE)) {
        const [messages, participants] = await Promise.all([
          messageRepository.find({
            where: {
              id: In(messageIdChunk),
              isDraft: false,
              messageCampaignId: IsNull(),
            },
            select: { id: true, receivedAt: true },
          }),
          participantRepository.find({
            where: { messageId: In(messageIdChunk) },
            select: { messageId: true, role: true, handle: true },
          }),
        ]);

        const participantsByMessageId = new Map<
          string,
          { role: MessageParticipantRole; handle: string }[]
        >();

        for (const { messageId, role, handle } of participants) {
          if (isNonEmptyString(handle)) {
            participantsByMessageId.set(messageId, [
              ...(participantsByMessageId.get(messageId) ?? []),
              { role, handle: normalize(handle) },
            ]);
          }
        }

        for (const message of messages) {
          if (!isDefined(message.receivedAt)) {
            continue;
          }

          const messageParticipants =
            participantsByMessageId.get(message.id) ?? [];
          const sender = messageParticipants.find(
            ({ role }) => role === MessageParticipantRole.FROM,
          )?.handle;
          const recipients = messageParticipants
            .filter(
              ({ role }) =>
                role === MessageParticipantRole.TO ||
                role === MessageParticipantRole.CC,
            )
            .map(({ handle }) => handle);

          const isFromUs = isDefined(sender) && ownHandles.has(sender);
          const applicantsOnMessage = [
            ...new Set([sender, ...recipients].filter(isDefined)),
          ].filter((handle) => applicantHandleSet.has(handle));

          for (const handle of applicantsOnMessage) {
            const isFromApplicant = sender === handle;
            const isSentToApplicant = isFromUs && recipients.includes(handle);

            if (isFromApplicant || isSentToApplicant) {
              messagesByHandle.set(handle, [
                ...(messagesByHandle.get(handle) ?? []),
                {
                  receivedAt: new Date(message.receivedAt),
                  isFromApplicant,
                  isSentToApplicant,
                },
              ]);
            }
          }
        }
      }
    }

    return messagesByHandle;
  }
}
