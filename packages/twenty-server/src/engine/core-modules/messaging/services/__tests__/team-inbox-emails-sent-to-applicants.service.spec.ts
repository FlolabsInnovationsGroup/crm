import { Test } from '@nestjs/testing';

import { MessageParticipantRole } from 'twenty-shared/types';

import { TeamInboxEmailsSentToApplicantsService } from 'src/engine/core-modules/messaging/services/team-inbox-emails-sent-to-applicants.service';
import { TeamInboxManualReviewHistoryService } from 'src/engine/core-modules/messaging/services/team-inbox-manual-review-history.service';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';

const CARD_THREAD = '11111111-1111-4111-8111-111111111111';
const CARD_RECEIVED_AT = new Date('2026-11-20T10:00:00Z');

const participant = (
  messageId: string,
  role: MessageParticipantRole,
  handle: string,
  displayName: string | null = null,
) => ({ id: `${messageId}-${role}`, messageId, role, handle, displayName });

describe('TeamInboxEmailsSentToApplicantsService', () => {
  const participantRepository = { find: jest.fn() };
  const messageRepository = { find: jest.fn() };
  const repositories: Record<string, unknown> = {
    messageParticipant: participantRepository,
    message: messageRepository,
  };
  const workspaceOrmManager = {
    executeInWorkspaceContext: jest.fn((callback: () => unknown) => callback()),
    getRepository: jest.fn((name: string) => repositories[name]),
  };
  const historyService = {
    getWorkspaceMailboxHandles: jest.fn(),
    getReviewReceivedAtByThreadId: jest.fn(),
    getFullyVisibleThreadIds: jest.fn(),
  };

  let service: TeamInboxEmailsSentToApplicantsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    historyService.getWorkspaceMailboxHandles.mockResolvedValue(
      new Set(['hr@flolabs.test']),
    );
    historyService.getReviewReceivedAtByThreadId.mockResolvedValue(
      new Map([[CARD_THREAD, CARD_RECEIVED_AT]]),
    );
    historyService.getFullyVisibleThreadIds.mockImplementation(
      async (threadIds: string[]) =>
        new Set(threadIds.filter((threadId) => threadId !== 'hidden-thread')),
    );

    const module = await Test.createTestingModule({
      providers: [
        TeamInboxEmailsSentToApplicantsService,
        { provide: WorkspaceOrmManager, useValue: workspaceOrmManager },
        {
          provide: TeamInboxManualReviewHistoryService,
          useValue: historyService,
        },
      ],
    }).compile();

    service = module.get(TeamInboxEmailsSentToApplicantsService);
  });

  const run = () =>
    service.getEmailsSentToApplicants({
      workspaceId: 'workspace-id',
      workspaceMemberId: 'member-id',
      items: [
        { messageThreadId: CARD_THREAD, applicantEmail: 'Ada@Gmail.com' },
      ],
    });

  it('returns the newest visible email our mailbox sent, with its sender and new text', async () => {
    participantRepository.find
      .mockResolvedValueOnce([
        { id: 'p1', messageId: 'reply' },
        { id: 'p2', messageId: 'hidden' },
      ])
      .mockResolvedValueOnce([
        participant(
          'reply',
          MessageParticipantRole.FROM,
          'hr@flolabs.test',
          'Nago',
        ),
        participant('reply', MessageParticipantRole.TO, 'ada@gmail.com'),
        participant('hidden', MessageParticipantRole.FROM, 'hr@flolabs.test'),
        participant('hidden', MessageParticipantRole.TO, 'ada@gmail.com'),
      ]);
    messageRepository.find
      .mockResolvedValueOnce([
        {
          id: 'reply',
          receivedAt: new Date('2026-11-21T10:00:00Z'),
          messageThreadId: 'reply-thread',
          subject: 'Re: Internship',
        },
        {
          id: 'hidden',
          receivedAt: new Date('2026-11-22T10:00:00Z'),
          messageThreadId: 'hidden-thread',
          subject: 'Private',
        },
      ])
      .mockResolvedValueOnce([
        { id: 'reply', text: 'See you Monday.\n> earlier question' },
      ]);

    expect(await run()).toEqual([
      {
        messageThreadId: CARD_THREAD,
        sentAt: new Date('2026-11-21T10:00:00Z'),
        subject: 'Re: Internship',
        excerpt: 'See you Monday.',
        senderName: 'Nago',
        senderEmail: 'hr@flolabs.test',
      },
    ]);
  });

  it('searches every page, from the card on, without drafts or campaigns', async () => {
    participantRepository.find
      .mockResolvedValueOnce(
        Array.from({ length: 1_000 }, (_, index) => ({
          id: `p1-${String(index).padStart(4, '0')}`,
          messageId: 'a',
        })),
      )
      .mockResolvedValueOnce([{ id: 'p2', messageId: 'b' }])
      .mockResolvedValueOnce([]);
    messageRepository.find.mockResolvedValue([]);

    expect(await run()).toEqual([]);

    expect(participantRepository.find).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          handle: expect.objectContaining({ _value: ['ada@gmail.com'] }),
        }),
      }),
    );
    expect(participantRepository.find.mock.calls[1][0].where.id).toEqual(
      expect.objectContaining({ _value: 'p1-0999' }),
    );
    expect(messageRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: expect.objectContaining({ _value: ['a', 'b'] }),
          isDraft: false,
          messageCampaignId: expect.objectContaining({ _type: 'isNull' }),
        }),
      }),
    );
  });

  it('ignores our own mailboxes as applicants', async () => {
    expect(
      await service.getEmailsSentToApplicants({
        workspaceId: 'workspace-id',
        workspaceMemberId: 'member-id',
        items: [
          { messageThreadId: CARD_THREAD, applicantEmail: 'HR@flolabs.test' },
        ],
      }),
    ).toEqual([]);
    expect(participantRepository.find).not.toHaveBeenCalled();
  });
});
