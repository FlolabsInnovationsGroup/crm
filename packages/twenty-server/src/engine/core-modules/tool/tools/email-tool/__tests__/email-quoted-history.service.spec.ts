import { Test } from '@nestjs/testing';

import { MessageParticipantRole } from 'twenty-shared/types';

import { EmailQuotedHistoryService } from 'src/engine/core-modules/tool/tools/email-tool/email-quoted-history.service';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';

const PARENT = {
  id: 'parent-id',
  messageThreadId: 'thread-id',
  receivedAt: new Date('2026-11-25T10:00:00Z'),
};

const PARENT_PARTICIPANTS = [
  {
    messageId: PARENT.id,
    role: MessageParticipantRole.FROM,
    handle: 'jane@example.com',
    displayName: 'Jane',
  },
  {
    messageId: PARENT.id,
    role: MessageParticipantRole.TO,
    handle: 'hr@flolabs.test',
    displayName: null,
  },
];

describe('EmailQuotedHistoryService', () => {
  const messageRepository = { find: jest.fn() };
  const associationRepository = { find: jest.fn() };
  const participantRepository = { find: jest.fn() };
  const workspaceOrmManager = {
    executeInWorkspaceContext: jest.fn(),
    getRepository: jest.fn(),
  };

  let service: EmailQuotedHistoryService;

  beforeEach(async () => {
    jest.resetAllMocks();

    workspaceOrmManager.executeInWorkspaceContext.mockImplementation(
      (callback: () => unknown) => callback(),
    );
    workspaceOrmManager.getRepository.mockImplementation((name: string) =>
      name === 'message'
        ? messageRepository
        : name === 'messageChannelMessageAssociation'
          ? associationRepository
          : participantRepository,
    );

    messageRepository.find
      .mockResolvedValueOnce([PARENT])
      .mockResolvedValueOnce([{ id: PARENT.id }])
      .mockResolvedValueOnce([
        { ...PARENT, text: 'Is the internship paid?', isDraft: false },
      ]);
    associationRepository.find.mockResolvedValue([{ messageId: PARENT.id }]);
    participantRepository.find.mockResolvedValue(PARENT_PARTICIPANTS);

    const module = await Test.createTestingModule({
      providers: [
        EmailQuotedHistoryService,
        { provide: WorkspaceOrmManager, useValue: workspaceOrmManager },
      ],
    }).compile();

    service = module.get(EmailQuotedHistoryService);
  });

  const parameters = {
    workspaceId: 'workspace-id',
    messageChannelId: 'channel-id',
    inReplyTo: '<parent@mail>',
    senderHandles: ['hr@flolabs.test', 'jobs@flolabs.test'],
  };

  it('quotes the earlier message the applicant sent', async () => {
    const result = await service.getQuotedHistory({
      ...parameters,
      recipientHandles: ['Jane@Example.com', 'jobs@flolabs.test'],
    });

    expect(result?.text).toContain('> Is the internship paid?');
    expect(associationRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ messageChannelId: 'channel-id' }),
      }),
    );
  });

  it('quotes nothing when every recipient is the sending account', async () => {
    const result = await service.getQuotedHistory({
      ...parameters,
      recipientHandles: ['HR@flolabs.test', 'jobs@flolabs.test'],
    });

    expect(result).toBeUndefined();
    expect(
      workspaceOrmManager.executeInWorkspaceContext,
    ).not.toHaveBeenCalled();
  });

  it('quotes nothing when the parent is not in the sending mailbox', async () => {
    associationRepository.find.mockResolvedValue([]);

    const result = await service.getQuotedHistory({
      ...parameters,
      recipientHandles: ['jane@example.com'],
    });

    expect(result).toBeUndefined();
  });

  it('quotes nothing when a bcc recipient never received the message', async () => {
    const result = await service.getQuotedHistory({
      ...parameters,
      // Another team mailbox counts as an outside recipient here.
      recipientHandles: ['jane@example.com', 'colleague@flolabs.test'],
    });

    expect(result).toBeUndefined();
  });

  it('sends the reply without a quote when reading the thread fails', async () => {
    workspaceOrmManager.executeInWorkspaceContext.mockRejectedValue(
      new Error('database unavailable'),
    );

    await expect(
      service.getQuotedHistory({
        ...parameters,
        recipientHandles: ['jane@example.com'],
      }),
    ).resolves.toBeUndefined();
  });
});
