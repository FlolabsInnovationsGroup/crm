import { type Repository } from 'typeorm';

import { type ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { type WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { type WorkflowSendEmailActionInput } from 'src/modules/workflow/workflow-executor/workflow-actions/mail-sender/types/workflow-send-email-action-input.type';
import {
  applyLatestConversationReply,
  buildReplySubject,
  getFirstRecipientHandle,
} from 'src/modules/workflow/workflow-executor/workflow-actions/mail-sender/utils/apply-latest-conversation-reply.util';

const WORKSPACE_ID = 'workspace-id';

const buildInput = (
  overrides: Partial<WorkflowSendEmailActionInput> = {},
): WorkflowSendEmailActionInput => ({
  connectedAccountId: 'account-id',
  recipients: { to: 'Ada@Example.com' },
  subject: 'Confirmation Requested: Continued Interest',
  body: '',
  replyToLatestConversation: true,
  ...overrides,
});

const setup = ({
  messageChannelIds = ['channel-id'],
  participantMessageIds = ['message-1', 'message-2'],
  associatedMessageIds = ['message-2'],
  latestMessage = {
    headerMessageId: '<latest@flolabs.test>',
    subject: 'RE: Re: FloLabs Internship',
  } as { headerMessageId: string | null; subject: string | null } | null,
} = {}) => {
  const participantFind = jest
    .fn()
    .mockResolvedValue(
      participantMessageIds.map((messageId) => ({ messageId })),
    );
  const associationFind = jest
    .fn()
    .mockResolvedValue(associatedMessageIds.map((messageId) => ({ messageId })));
  const messageFindOne = jest.fn().mockResolvedValue(latestMessage);

  const repositories: Record<string, unknown> = {
    messageParticipant: { find: participantFind },
    messageChannelMessageAssociation: { find: associationFind },
    message: { findOne: messageFindOne },
  };

  const workspaceOrmManager = {
    executeInWorkspaceContext: jest.fn((callback: () => unknown) =>
      callback(),
    ),
    getRepository: jest.fn((name: string) => repositories[name]),
  } as unknown as WorkspaceOrmManager;

  const connectedAccountRepository = {
    findOne: jest.fn().mockResolvedValue({
      messageChannels: messageChannelIds.map((id) => ({ id })),
    }),
  } as unknown as Repository<ConnectedAccountEntity>;

  return {
    workspaceOrmManager,
    connectedAccountRepository,
    participantFind,
    associationFind,
    messageFindOne,
  };
};

describe('buildReplySubject', () => {
  it('adds a single Re: prefix', () => {
    expect(buildReplySubject('RE: re:Fwd: FloLabs Internship')).toBe(
      'Re: FloLabs Internship',
    );
    expect(buildReplySubject('FloLabs Internship - Next Steps')).toBe(
      'Re: FloLabs Internship - Next Steps',
    );
  });
});

describe('getFirstRecipientHandle', () => {
  it('returns the first address, lowercased', () => {
    expect(getFirstRecipientHandle(' Ada@Example.com , b@c.co')).toBe(
      'ada@example.com',
    );
    expect(getFirstRecipientHandle('')).toBeUndefined();
    expect(getFirstRecipientHandle(undefined)).toBeUndefined();
  });
});

describe('applyLatestConversationReply', () => {
  it('replies to the latest message with the recipient', async () => {
    const mocks = setup();

    const result = await applyLatestConversationReply({
      input: buildInput(),
      workspaceId: WORKSPACE_ID,
      ...mocks,
    });

    expect(result).toEqual({
      ...buildInput(),
      replyToLatestConversation: undefined,
      inReplyTo: '<latest@flolabs.test>',
      subject: 'Re: FloLabs Internship',
    });
    expect('replyToLatestConversation' in result).toBe(false);
    expect(mocks.associationFind).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          messageChannelId: expect.objectContaining({
            value: ['channel-id'],
          }),
        }),
      }),
    );
  });

  it('keeps the template subject when the conversation has none', async () => {
    const mocks = setup({
      latestMessage: { headerMessageId: '<latest@flolabs.test>', subject: '' },
    });

    const result = await applyLatestConversationReply({
      input: buildInput(),
      workspaceId: WORKSPACE_ID,
      ...mocks,
    });

    expect(result.subject).toBe('Confirmation Requested: Continued Interest');
    expect(result.inReplyTo).toBe('<latest@flolabs.test>');
  });

  it('sends a new email when there is no earlier conversation', async () => {
    const mocks = setup({ participantMessageIds: [] });

    const result = await applyLatestConversationReply({
      input: buildInput(),
      workspaceId: WORKSPACE_ID,
      ...mocks,
    });

    expect(result.inReplyTo).toBeUndefined();
    expect(result.subject).toBe('Confirmation Requested: Continued Interest');
    expect(mocks.associationFind).not.toHaveBeenCalled();
  });

  it('ignores messages from other mailboxes', async () => {
    const mocks = setup({ associatedMessageIds: [] });

    const result = await applyLatestConversationReply({
      input: buildInput(),
      workspaceId: WORKSPACE_ID,
      ...mocks,
    });

    expect(result.inReplyTo).toBeUndefined();
    expect(mocks.messageFindOne).not.toHaveBeenCalled();
  });

  it.each([
    ['the option is off', { replyToLatestConversation: false }],
    ['In-Reply-To is already set', { inReplyTo: '<manual@flolabs.test>' }],
    ['there is no recipient', { recipients: { to: '' } }],
  ])('changes nothing when %s', async (_case, overrides) => {
    const mocks = setup();
    const input = buildInput(overrides);

    const result = await applyLatestConversationReply({
      input,
      workspaceId: WORKSPACE_ID,
      ...mocks,
    });

    const { replyToLatestConversation: _option, ...expected } = input;

    expect(result).toEqual(expected);
    expect(mocks.participantFind).not.toHaveBeenCalled();
  });
});
