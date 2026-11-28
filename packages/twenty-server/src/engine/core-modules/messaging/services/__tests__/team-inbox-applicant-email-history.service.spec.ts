import { Test } from '@nestjs/testing';

import { FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED } from 'twenty-shared/constants';
import { MessageParticipantRole } from 'twenty-shared/types';
import { type FindOperator } from 'typeorm';

import { TeamInboxApplicantEmailHistoryService } from 'src/engine/core-modules/messaging/services/team-inbox-applicant-email-history.service';
import { TeamInboxManualReviewHistoryService } from 'src/engine/core-modules/messaging/services/team-inbox-manual-review-history.service';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { ApplyMessagesVisibilityRestrictionsService } from 'src/modules/messaging/common/query-hooks/message/apply-messages-visibility-restrictions.service';

const PERSON_ID = '22222222-2222-4222-8222-222222222222';

type StoredMessage = {
  id: string;
  messageThreadId: string;
  subject: string;
  text: string;
  receivedAt: Date;
  createdAt: Date;
  headerMessageId: string;
  isDraft: boolean;
};

type StoredParticipant = {
  messageId: string;
  role: MessageParticipantRole;
  handle: string;
  displayName: string | null;
  personId: string | null;
  workspaceMemberId: string | null;
};

const at = (day: number) =>
  new Date(`2026-11-${String(day).padStart(2, '0')}T10:00:00Z`);

const operatorValue = <TValue>(operator: unknown) =>
  (operator as FindOperator<TValue>).value;

describe('TeamInboxApplicantEmailHistoryService', () => {
  let storedMessages: StoredMessage[];
  let storedParticipants: StoredParticipant[];
  let hiddenThreadIds: Set<string>;
  let restrictedMessageIds: Set<string>;

  const participantRepository = {
    // Matches loosely on purpose, so exactness must come from the service.
    find: jest.fn(async ({ where }: { where: unknown }) => {
      if (Array.isArray(where)) {
        return storedParticipants.filter((participant) =>
          where.some((condition: Record<string, unknown>) =>
            'handle' in condition
              ? participant.handle
                  .toLowerCase()
                  .includes(
                    operatorValue<string>(condition.handle)
                      .replace(/\\/g, '')
                      .toLowerCase(),
                  )
              : participant.personId === condition.personId,
          ),
        );
      }

      const messageIds = operatorValue<string[]>(
        (where as { messageId: unknown }).messageId,
      );

      return storedParticipants.filter((participant) =>
        messageIds.includes(participant.messageId),
      );
    }),
  };
  const messageRepository = {
    find: jest.fn(
      async ({ where }: { where: { id: unknown; isDraft?: boolean } }) => {
        const ids = operatorValue<string[]>(where.id);

        return storedMessages
          .filter((message) => ids.includes(message.id))
          .filter(
            (message) => where.isDraft !== false || message.isDraft === false,
          )
          .map((message) => ({ ...message }));
      },
    ),
  };
  const repositories: Record<string, unknown> = {
    messageParticipant: participantRepository,
    message: messageRepository,
  };
  const workspaceOrmManager = {
    executeInWorkspaceContext: jest.fn((callback: () => unknown) => callback()),
    getRepository: jest.fn((name: string) => repositories[name]),
  };
  const historyService = {
    getWorkspaceMailboxHandles: jest.fn(
      async () => new Set(['hr@flolabs.test']),
    ),
    getFullyVisibleThreadIds: jest.fn(
      async (threadIds: string[]) =>
        new Set(threadIds.filter((threadId) => !hiddenThreadIds.has(threadId))),
    ),
  };
  const visibilityService = {
    applyMessagesVisibilityRestrictions: jest.fn(
      async (messages: StoredMessage[]) =>
        messages.map((message) =>
          restrictedMessageIds.has(message.id)
            ? {
                ...message,
                text: FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED,
              }
            : message,
        ),
    ),
  };

  let service: TeamInboxApplicantEmailHistoryService;

  const addMessage = ({
    id,
    threadId = 'thread-a',
    day,
    from,
    to,
    subject = 'Internship',
    isDraft = false,
    personId = null,
  }: {
    id: string;
    threadId?: string;
    day: number;
    from: string;
    to: string;
    subject?: string;
    isDraft?: boolean;
    personId?: string | null;
  }) => {
    storedMessages.push({
      id,
      messageThreadId: threadId,
      subject,
      text: `Body of ${id}`,
      receivedAt: at(day),
      createdAt: at(day),
      headerMessageId: `<${id}@mail>`,
      isDraft,
    });
    storedParticipants.push(
      {
        messageId: id,
        role: MessageParticipantRole.FROM,
        handle: from,
        displayName: from === 'hr@flolabs.test' ? 'FloLabs HR' : 'Ada',
        personId: from === 'hr@flolabs.test' ? null : personId,
        workspaceMemberId: null,
      },
      {
        messageId: id,
        role: MessageParticipantRole.TO,
        handle: to,
        displayName: null,
        personId: to === 'hr@flolabs.test' ? null : personId,
        workspaceMemberId: null,
      },
    );
  };

  const run = (applicantEmail: string, personId: string | null = null) =>
    service.getApplicantEmailHistory({
      workspaceId: 'workspace-id',
      workspaceMemberId: 'member-id',
      userId: 'user-id',
      applicantEmail,
      personId,
    });

  beforeEach(async () => {
    jest.clearAllMocks();
    storedMessages = [];
    storedParticipants = [];
    hiddenThreadIds = new Set();
    restrictedMessageIds = new Set();

    const module = await Test.createTestingModule({
      providers: [
        TeamInboxApplicantEmailHistoryService,
        { provide: WorkspaceOrmManager, useValue: workspaceOrmManager },
        {
          provide: TeamInboxManualReviewHistoryService,
          useValue: historyService,
        },
        {
          provide: ApplyMessagesVisibilityRestrictionsService,
          useValue: visibilityService,
        },
      ],
    }).compile();

    service = module.get(TeamInboxApplicantEmailHistoryService);
  });

  it('matches the address exactly, never as a substring', async () => {
    addMessage({ id: 'ada', day: 1, from: 'ada@x.com', to: 'hr@flolabs.test' });
    addMessage({
      id: 'nada',
      day: 2,
      from: 'nada@x.com',
      to: 'hr@flolabs.test',
    });

    const history = await run('ada@x.com');

    expect(history.messages.map(({ id }) => id)).toEqual(['ada']);
    expect(
      operatorValue<string>(
        (
          participantRepository.find.mock.calls[0][0].where as {
            handle: unknown;
          }[]
        )[0].handle,
      ),
    ).toBe('ada@x.com');
  });

  it('escapes LIKE wildcards in the address', async () => {
    addMessage({
      id: 'underscore',
      day: 1,
      from: 'a_da@x.com',
      to: 'hr@flolabs.test',
    });
    addMessage({
      id: 'other',
      day: 2,
      from: 'abda@x.com',
      to: 'hr@flolabs.test',
    });

    const history = await run('a_da@x.com');

    expect(history.messages.map(({ id }) => id)).toEqual(['underscore']);
    expect(
      operatorValue<string>(
        (
          participantRepository.find.mock.calls[0][0].where as {
            handle: unknown;
          }[]
        )[0].handle,
      ),
    ).toBe('a\\_da@x.com');
  });

  it('matches whatever the case of the address', async () => {
    addMessage({ id: 'in', day: 1, from: 'ADA@X.com', to: 'hr@flolabs.test' });
    addMessage({ id: 'out', day: 2, from: 'hr@flolabs.test', to: 'Ada@x.COM' });

    const history = await run('  Ada@x.com ');

    expect(history.messages.map(({ id }) => id)).toEqual(['in', 'out']);
  });

  it('returns every thread oldest first, with direction, sender and recipients, without drafts', async () => {
    addMessage({
      id: 'reminder',
      threadId: 'thread-b',
      day: 5,
      from: 'hr@flolabs.test',
      to: 'ada@x.com',
      subject: 'Reminder: Form 1',
    });
    addMessage({
      id: 'first',
      threadId: 'thread-a',
      day: 1,
      from: 'hr@flolabs.test',
      to: 'ada@x.com',
    });
    addMessage({
      id: 'question',
      threadId: 'thread-a',
      day: 3,
      from: 'ada@x.com',
      to: 'hr@flolabs.test',
      subject: 'Re: Internship',
    });
    addMessage({
      id: 'draft',
      threadId: 'thread-a',
      day: 6,
      from: 'hr@flolabs.test',
      to: 'ada@x.com',
      isDraft: true,
    });

    const history = await run('ada@x.com');

    expect(history.isTruncated).toBe(false);
    expect(history.messages.map(({ id }) => id)).toEqual([
      'first',
      'question',
      'reminder',
    ]);
    expect(history.messages[1]).toEqual({
      id: 'question',
      messageThreadId: 'thread-a',
      subject: 'Re: Internship',
      text: 'Body of question',
      receivedAt: at(3),
      headerMessageId: '<question@mail>',
      direction: 'INCOMING',
      isFromApplicant: true,
      sender: {
        role: MessageParticipantRole.FROM,
        handle: 'ada@x.com',
        displayName: 'Ada',
      },
      recipients: [
        {
          role: MessageParticipantRole.TO,
          handle: 'hr@flolabs.test',
          displayName: null,
        },
      ],
    });
    expect(history.messages[2]).toMatchObject({
      direction: 'OUTGOING',
      isFromApplicant: false,
    });
  });

  it('leaves out threads and messages this member cannot read', async () => {
    addMessage({
      id: 'shared',
      day: 1,
      from: 'ada@x.com',
      to: 'hr@flolabs.test',
    });
    addMessage({
      id: 'private-thread',
      threadId: 'thread-private',
      day: 2,
      from: 'ada@x.com',
      to: 'boss@flolabs.test',
    });
    addMessage({
      id: 'metadata-only',
      threadId: 'thread-a',
      day: 3,
      from: 'ada@x.com',
      to: 'hr@flolabs.test',
    });
    hiddenThreadIds.add('thread-private');
    restrictedMessageIds.add('metadata-only');

    const history = await run('ada@x.com');

    expect(history.messages.map(({ id }) => id)).toEqual(['shared']);
    expect(historyService.getFullyVisibleThreadIds).toHaveBeenCalledWith(
      expect.arrayContaining(['thread-a', 'thread-private']),
      'member-id',
      'workspace-id',
    );
    expect(
      visibilityService.applyMessagesVisibilityRestrictions,
    ).toHaveBeenCalledWith(expect.any(Array), 'workspace-id', 'user-id');
  });

  it('keeps the latest 200 emails and says the list was cut', async () => {
    for (let index = 0; index < 205; index++) {
      storedMessages.push({
        id: `m-${String(index).padStart(3, '0')}`,
        messageThreadId: `thread-${index % 3}`,
        subject: 'Internship',
        text: 'Hello',
        receivedAt: new Date(at(1).getTime() + index * 60_000),
        createdAt: at(1),
        headerMessageId: `<${index}@mail>`,
        isDraft: false,
      });
      storedParticipants.push({
        messageId: `m-${String(index).padStart(3, '0')}`,
        role: MessageParticipantRole.FROM,
        handle: 'ada@x.com',
        displayName: null,
        personId: null,
        workspaceMemberId: null,
      });
    }

    const history = await run('ada@x.com');

    expect(history.isTruncated).toBe(true);
    expect(history.messages).toHaveLength(200);
    expect(history.messages[0].id).toBe('m-005');
    expect(history.messages[199].id).toBe('m-204');
  });

  it('also matches the linked person, and never lists a team mailbox', async () => {
    addMessage({
      id: 'other-address',
      day: 1,
      from: 'ada.work@y.com',
      to: 'hr@flolabs.test',
      personId: PERSON_ID,
    });

    expect(
      (await run('ada@x.com', PERSON_ID)).messages.map(({ id }) => id),
    ).toEqual(['other-address']);

    participantRepository.find.mockClear();

    expect(await run('HR@flolabs.test')).toEqual({
      messages: [],
      isTruncated: false,
    });
    expect(await run('hr@flolabs.test', 'not-a-uuid')).toEqual({
      messages: [],
      isTruncated: false,
    });
    expect(participantRepository.find).not.toHaveBeenCalled();
  });
});
