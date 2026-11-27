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
import { findPersonByPrimaryOrAdditionalEmail } from 'src/modules/match-participant/utils/find-person-by-primary-or-additional-email';
import { getPersonEmails } from 'src/modules/match-participant/utils/get-person-emails.util';
import { type MessageParticipantWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message-participant.workspace-entity';
import { type MessageWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message.workspace-entity';
import { type PersonWorkspaceEntity } from 'src/modules/person/standard-objects/person.workspace-entity';

const PAGE_SIZE = 1_000;

const RECIPIENT_ROLES = [
  MessageParticipantRole.TO,
  MessageParticipantRole.CC,
  MessageParticipantRole.BCC,
];

type ApplicantPerson = PersonWorkspaceEntity & { stage?: string | null };

type StageChange = {
  id: string;
  happensAt: string | Date;
  targetPersonId: string;
  properties: { diff?: { stage?: { after?: string } } } | null;
};

// A conversation is keyed by the person's id, or by the bare email when no
// person matches.
type ApplicantKey = { personId: string } | { handle: string };

const normalize = (email: string) => email.trim().toLowerCase();

const toMapKey = (key: ApplicantKey) =>
  'personId' in key ? key.personId : key.handle;

const getParticipantKeys = ({
  personId,
  handle,
}: {
  personId: string | null;
  handle: string | null;
}) =>
  [personId, isNonEmptyString(handle) ? normalize(handle) : null].filter(
    isDefined,
  );

// Answers "has this applicant written to us since our last email?" from the
// messages the CRM has synced. Returns times only, never message content.
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
      const key: ApplicantKey = isDefined(person)
        ? { personId: person.id }
        : { handle: normalizedEmail };
      const conversations = await this.getConversations([key], ownHandles);
      const state = getApplicantReplyState({
        messages: conversations.get(toMapKey(key)) ?? [],
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
      const personIds = [
        ...new Set(reminders.map((reminder) => reminder.targetPersonId)),
      ];

      if (!isNonEmptyArray(personIds)) {
        return [];
      }

      const personRepository =
        this.workspaceOrmManager.getRepository<ApplicantPerson>('person', {
          shouldBypassPermissionChecks: true,
        });
      const people: ApplicantPerson[] = [];

      for (const personIdChunk of chunk(personIds, PAGE_SIZE)) {
        people.push(
          ...(await personRepository.find({
            where: { id: In(personIdChunk) },
          })),
        );
      }

      const peopleById = new Map(people.map((person) => [person.id, person]));
      const conversations = await this.getConversations(
        people.map((person) => ({ personId: person.id })),
        ownHandles,
      );

      return reminders.flatMap((reminder) => {
        const person = peopleById.get(reminder.targetPersonId);

        if (!isDefined(person)) {
          return [];
        }

        const remindedAt = new Date(reminder.happensAt);
        const messages = conversations.get(person.id) ?? [];
        // A stage change with no email from us next to it was set by hand or
        // by an import, not by a reminder going out.
        const hasReminderEmail = messages.some(
          (message) =>
            message.isSentToApplicant &&
            Math.abs(message.receivedAt.getTime() - remindedAt.getTime()) <=
              REMINDER_SEND_WINDOW_MS,
        );
        const state = getApplicantReplyState({
          messages,
          before: new Date(remindedAt.getTime() - REMINDER_SEND_WINDOW_MS),
        });

        if (
          !hasReminderEmail ||
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
            email: getPersonEmails(person.emails)[0] ?? null,
            currentStage: person.stage ?? null,
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
  private async findPersonByEmail(
    email: string,
  ): Promise<ApplicantPerson | null> {
    const matchingPeople = (await addPersonEmailFiltersToQueryBuilder({
      queryBuilder: this.workspaceOrmManager
        .getRepository('person', { shouldBypassPermissionChecks: true })
        .createQueryBuilder('person'),
      emails: [email],
    }).getMany()) as ApplicantPerson[];

    return (
      findPersonByPrimaryOrAdditionalEmail({
        people: matchingPeople.filter((person) => !isDefined(person.deletedAt)),
        email,
      }) ?? null
    );
  }

  // Must run inside a workspace context. Linked rows (another record's own
  // update shown on the person) also carry a stage diff, so they are skipped.
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
        .andWhere('"timelineActivity"."linkedRecordId" IS NULL')
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
  // marked as written by them or sent to them (To, Cc or Bcc) by one of our
  // mailboxes. People are found by the indexed personId; only a bare email
  // falls back to the participant handle.
  private async getConversations(
    keys: ApplicantKey[],
    ownHandles: Set<string>,
  ): Promise<Map<string, ConversationMessage[]>> {
    const conversations = new Map<string, ConversationMessage[]>();
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

    const personIds = keys.flatMap((key) =>
      'personId' in key ? [key.personId] : [],
    );
    const handles = keys.flatMap((key) =>
      'handle' in key ? [key.handle] : [],
    );
    const wanted = new Set([...personIds, ...handles]);
    const messageIds = new Set<string>();

    for (const personIdChunk of chunk(personIds, PAGE_SIZE)) {
      const found = await participantRepository.find({
        where: { personId: In(personIdChunk) },
        select: { messageId: true },
      });

      found.forEach(({ messageId }) => messageIds.add(messageId));
    }

    if (isNonEmptyArray(handles)) {
      const found = await participantRepository.find({
        where: { handle: In(handles) },
        select: { messageId: true },
      });

      found.forEach(({ messageId }) => messageIds.add(messageId));
    }

    for (const messageIdChunk of chunk([...messageIds], PAGE_SIZE)) {
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
          select: { messageId: true, role: true, handle: true, personId: true },
        }),
      ]);

      const participantsByMessageId = new Map<string, typeof participants>();

      for (const participant of participants) {
        const list = participantsByMessageId.get(participant.messageId) ?? [];

        list.push(participant);
        participantsByMessageId.set(participant.messageId, list);
      }

      for (const message of messages) {
        if (!isDefined(message.receivedAt)) {
          continue;
        }

        const messageParticipants =
          participantsByMessageId.get(message.id) ?? [];
        const sender = messageParticipants.find(
          ({ role }) => role === MessageParticipantRole.FROM,
        );
        const senderKeys = isDefined(sender) ? getParticipantKeys(sender) : [];
        const isFromUs =
          isNonEmptyString(sender?.handle) &&
          ownHandles.has(normalize(sender.handle));
        const recipientKeys = messageParticipants
          .filter(({ role }) => RECIPIENT_ROLES.includes(role))
          .flatMap(getParticipantKeys);
        const applicantKeys = new Set(
          [...senderKeys, ...recipientKeys].filter((key) => wanted.has(key)),
        );

        for (const key of applicantKeys) {
          const isFromApplicant = senderKeys.includes(key);
          const isSentToApplicant = isFromUs && recipientKeys.includes(key);

          if (!isFromApplicant && !isSentToApplicant) {
            continue;
          }

          const conversation = conversations.get(key) ?? [];

          conversation.push({
            receivedAt: new Date(message.receivedAt),
            isFromApplicant,
            isSentToApplicant,
          });
          conversations.set(key, conversation);
        }
      }
    }

    return conversations;
  }
}
