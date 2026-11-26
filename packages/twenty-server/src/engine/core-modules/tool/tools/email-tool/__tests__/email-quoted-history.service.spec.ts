import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { EmailQuotedHistoryService } from 'src/engine/core-modules/tool/tools/email-tool/email-quoted-history.service';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';

describe('EmailQuotedHistoryService', () => {
  const connectedAccountRepository = { find: jest.fn() };
  const workspaceOrmManager = {
    executeInWorkspaceContext: jest.fn(),
    getRepository: jest.fn(),
  };

  let service: EmailQuotedHistoryService;

  beforeEach(async () => {
    jest.resetAllMocks();

    connectedAccountRepository.find.mockResolvedValue([
      {
        handle: 'hr@flolabs.test',
        handleAliases: ['jobs@flolabs.test'],
        messageChannels: [{ handle: 'team@flolabs.test' }],
      },
    ]);

    const module = await Test.createTestingModule({
      providers: [
        EmailQuotedHistoryService,
        { provide: WorkspaceOrmManager, useValue: workspaceOrmManager },
        {
          provide: getRepositoryToken(ConnectedAccountEntity),
          useValue: connectedAccountRepository,
        },
      ],
    }).compile();

    service = module.get(EmailQuotedHistoryService);
  });

  const parameters = {
    workspaceId: 'workspace-id',
    messageChannelId: 'channel-id',
    inReplyTo: '<parent@mail>',
  };

  it('quotes nothing when every recipient is one of our own mailboxes', async () => {
    const result = await service.getQuotedHistory({
      ...parameters,
      recipientHandles: [
        'HR@flolabs.test',
        'jobs@flolabs.test',
        'team@flolabs.test',
      ],
    });

    expect(result).toBeUndefined();
    expect(
      workspaceOrmManager.executeInWorkspaceContext,
    ).not.toHaveBeenCalled();
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
