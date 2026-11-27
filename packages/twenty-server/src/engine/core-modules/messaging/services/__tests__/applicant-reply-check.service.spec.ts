import { Test } from '@nestjs/testing';

import { MessageParticipantRole } from 'twenty-shared/types';

import { ApplicantReplyCheckService } from 'src/engine/core-modules/messaging/services/applicant-reply-check.service';
import { TeamInboxManualReviewHistoryService } from 'src/engine/core-modules/messaging/services/team-inbox-manual-review-history.service';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';

const HR = 'hr@flolabs.test';
const ADA = 'ada@gmail.com';

const ada = {
  id: 'ada-id',
  name: { firstName: 'Ada', lastName: 'Lovelace' },
  emails: { primaryEmail: 'Ada@Gmail.com', additionalEmails: [] },
  stage: 'SECOND_REMINDER_CONTACTED',
  deletedAt: null,
};

type QueryBuilderMock = Record<string, jest.Mock>;

const queryBuilder = (rows: unknown[]) => {
  const builder: QueryBuilderMock = {
    where: jest.fn(() => builder),
    andWhere: jest.fn(() => builder),
    orWhere: jest.fn(() => builder),
    withDeleted: jest.fn(() => builder),
    orderBy: jest.fn(() => builder),
    limit: jest.fn(() => builder),
    getMany: jest.fn(async () => rows),
  };

  return builder;
};

// Ada replied on the 2nd; our earlier email was on the 1st and the reminder
// went out on the 5th.
const CONVERSATION = {
  messages: [
    { id: 'first', receivedAt: new Date('2026-11-01T10:00:00Z') },
    { id: 'reply', receivedAt: new Date('2026-11-02T10:00:00Z') },
    { id: 'reminder', receivedAt: new Date('2026-11-05T10:00:00Z') },
  ],
  participants: [
    { messageId: 'first', role: MessageParticipantRole.FROM, handle: HR },
    { messageId: 'first', role: MessageParticipantRole.TO, handle: ADA },
    { messageId: 'reply', role: MessageParticipantRole.FROM, handle: ADA },
    { messageId: 'reply', role: MessageParticipantRole.TO, handle: HR },
    { messageId: 'reminder', role: MessageParticipantRole.FROM, handle: HR },
    { messageId: 'reminder', role: MessageParticipantRole.TO, handle: ADA },
  ],
};

describe('ApplicantReplyCheckService', () => {
  const participantRepository = { find: jest.fn() };
  const messageRepository = { find: jest.fn() };
  const personRepository = { find: jest.fn(), createQueryBuilder: jest.fn() };
  const timelineRepository = { createQueryBuilder: jest.fn() };
  const repositories: Record<string, unknown> = {
    messageParticipant: participantRepository,
    message: messageRepository,
    person: personRepository,
    timelineActivity: timelineRepository,
  };
  const workspaceOrmManager = {
    executeInWorkspaceContext: jest.fn((callback: () => unknown) => callback()),
    getRepository: jest.fn((name: string) => repositories[name]),
  };
  const historyService = {
    getWorkspaceMailboxHandles: jest.fn(async () => new Set([HR])),
  };

  let service: ApplicantReplyCheckService;

  beforeEach(async () => {
    jest.clearAllMocks();
    participantRepository.find.mockImplementation(
      async ({ where }: { where: { handle?: unknown } }) =>
        'handle' in where
          ? CONVERSATION.participants.filter(
              (participant) => participant.handle === ADA,
            )
          : CONVERSATION.participants,
    );
    messageRepository.find.mockResolvedValue(CONVERSATION.messages);

    const module = await Test.createTestingModule({
      providers: [
        ApplicantReplyCheckService,
        { provide: WorkspaceOrmManager, useValue: workspaceOrmManager },
        {
          provide: TeamInboxManualReviewHistoryService,
          useValue: historyService,
        },
      ],
    }).compile();

    service = module.get(ApplicantReplyCheckService);
  });

  it('tells n8n the applicant is not waiting once we wrote after their reply', async () => {
    personRepository.createQueryBuilder.mockReturnValue(queryBuilder([ada]));

    expect(
      await service.getReplyState({
        workspaceId: 'workspace-id',
        email: ' ADA@gmail.com',
        since: new Date('2026-11-01T12:00:00Z'),
      }),
    ).toEqual({
      email: ADA,
      personId: 'ada-id',
      stage: 'SECOND_REMINDER_CONTACTED',
      lastApplicantMessageAt: new Date('2026-11-02T10:00:00Z'),
      lastSentToApplicantAt: new Date('2026-11-05T10:00:00Z'),
      isAwaitingOurReply: false,
      hasRepliedSince: true,
    });
    expect(messageRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isDraft: false }),
      }),
    );
  });

  it('lists a reminder sent while the applicant was waiting for us', async () => {
    timelineRepository.createQueryBuilder.mockReturnValue(
      queryBuilder([
        {
          id: 'change',
          happensAt: '2026-11-05T10:02:00Z',
          targetPersonId: 'ada-id',
          properties: {
            diff: { stage: { after: 'SECOND_REMINDER_CONTACTED' } },
          },
        },
      ]),
    );
    personRepository.find.mockResolvedValue([ada]);

    expect(
      await service.findRemindedAfterReply({
        workspaceId: 'workspace-id',
        days: 30,
      }),
    ).toEqual([
      {
        personId: 'ada-id',
        name: 'Ada Lovelace',
        email: ADA,
        currentStage: 'SECOND_REMINDER_CONTACTED',
        reminderStage: 'SECOND_REMINDER_CONTACTED',
        remindedAt: new Date('2026-11-05T10:02:00Z'),
        applicantMessageAt: new Date('2026-11-02T10:00:00Z'),
        lastSentBeforeReminderAt: new Date('2026-11-01T10:00:00Z'),
      },
    ]);
  });

  it('leaves out a reminder sent after we had answered', async () => {
    timelineRepository.createQueryBuilder.mockReturnValue(
      queryBuilder([
        {
          id: 'change',
          happensAt: '2026-11-06T10:00:00Z',
          targetPersonId: 'ada-id',
          properties: {
            diff: { stage: { after: 'REMINDER_AFTER_CONTACTED' } },
          },
        },
      ]),
    );
    personRepository.find.mockResolvedValue([ada]);

    expect(
      await service.findRemindedAfterReply({
        workspaceId: 'workspace-id',
        days: 30,
      }),
    ).toEqual([]);
  });
});
