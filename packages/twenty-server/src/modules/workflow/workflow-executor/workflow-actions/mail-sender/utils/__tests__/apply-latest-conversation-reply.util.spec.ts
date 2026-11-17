import { ConnectedAccountProvider } from 'twenty-shared/types';
import { type Repository } from 'typeorm';

import { type ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { type WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { MessageDirection } from 'src/modules/messaging/common/enums/message-direction.enum';
import { type WorkflowSendEmailActionInput } from 'src/modules/workflow/workflow-executor/workflow-actions/mail-sender/types/workflow-send-email-action-input.type';
import {
  applyLatestConversationReply,
  buildReplySubject,
} from 'src/modules/workflow/workflow-executor/workflow-actions/mail-sender/utils/apply-latest-conversation-reply.util';

const WORKSPACE_ID = 'workspace-id';

const buildInput = (
  overrides: Partial<WorkflowSendEmailActionInput> = {},
): WorkflowSendEmailActionInput => ({
  connectedAccountId: 'account-id',
  recipients: { to: 'Ada@Example.com, other@example.com' },
  subject: 'Confirmation Requested: Continued Interest',
  body: '',
  replyToLatestConversation: true,
  ...overrides,
});

type LatestMessage = { headerMessageId: string | null; subject: string | null };

const setup = ({
  participantMessageIds = ['message-1', 'message-2'],
  associatedMessageIds = ['message-2'],
  latestMessage = {
    headerMessageId: '<latest@flolabs.test>',
    subject: 'RE: Re: FloLabs Internship',
  } as LatestMessage | null,
  connectedAccount = {
    provider: ConnectedAccountProvider.IMAP_SMTP_CALDAV,
    handle: 'hr@flolabs.test',
    messageChannels: [
      { id: 'other-channel', handle: 'alias@flolabs.test' },
      { id: 'hr-channel', handle: 'hr@flolabs.test' },
    ],
  } as Partial<ConnectedAccountEntity> | null,
} = {}) => {
  const participantFind = jest
    .fn()
    .mockResolvedValue(
      participantMessageIds.map((messageId) => ({ messageId })),
    );
  const associationFind = jest
    .fn()
    .mockResolvedValue(
      associatedMessageIds.map((messageId) => ({ messageId })),
    );
  const messageFindOne = jest.fn().mockResolvedValue(latestMessage);

  const repositories: Record<string, unknown> = {
    messageParticipant: { find: participantFind },
    messageChannelMessageAssociation: { find: associationFind },
    message: { findOne: messageFindOne },
  };

  const workspaceOrmManager = {
    executeInWorkspaceContext: jest.fn((callback: () => unknown) => callback()),
    getRepository: jest.fn((name: string) => repositories[name]),
  } as unknown as WorkspaceOrmManager;

  const connectedAccountRepository = {
    findOne: jest.fn().mockResolvedValue(connectedAccount),
  } as unknown as Repository<ConnectedAccountEntity>;

  return {
    workspaceOrmManager,
    connectedAccountRepository,
    participantFind,
    associationFind,
    messageFindOne,
  };
};

const run = (
  mocks: ReturnType<typeof setup>,
  input: WorkflowSendEmailActionInput = buildInput(),
) =>
  applyLatestConversationReply({
    input,
    workspaceId: WORKSPACE_ID,
    workspaceOrmManager: mocks.workspaceOrmManager,
    connectedAccountRepository: mocks.connectedAccountRepository,
  });

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

describe('applyLatestConversationReply', () => {
  it('replies to the latest email this mailbox sent the first recipient', async () => {
    const mocks = setup();

    const result = await run(mocks);

    const { replyToLatestConversation: _option, ...expected } = buildInput();

    expect(result).toEqual({
      ...expected,
      inReplyTo: '<latest@flolabs.test>',
      subject: 'Re: FloLabs Internship',
    });
    expect('replyToLatestConversation' in result).toBe(false);
    expect(mocks.associationFind).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          messageChannelId: 'hr-channel',
          direction: MessageDirection.OUTGOING,
        }),
      }),
    );
  });

  it('skips drafts and messages without a date', async () => {
    const mocks = setup();

    await run(mocks);

    expect(mocks.messageFindOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isDraft: false,
          receivedAt: expect.objectContaining({ _type: 'not' }),
        }),
      }),
    );
  });

  it('matches the recipient exactly, with LIKE wildcards escaped', async () => {
    const mocks = setup();

    await run(mocks, buildInput({ recipients: { to: 'first_last@x.co' } }));

    expect(mocks.participantFind).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          handle: expect.objectContaining({
            _type: 'ilike',
            _value: 'first\\_last@x.co',
          }),
        },
      }),
    );
  });

  it('keeps the template subject when the conversation has none', async () => {
    const mocks = setup({
      latestMessage: { headerMessageId: '<latest@flolabs.test>', subject: '' },
    });

    const result = await run(mocks);

    expect(result.subject).toBe('Confirmation Requested: Continued Interest');
    expect(result.inReplyTo).toBe('<latest@flolabs.test>');
  });

  it('sends as written when there is no earlier email', async () => {
    const mocks = setup({ participantMessageIds: [] });

    const result = await run(mocks);

    expect(result.inReplyTo).toBeUndefined();
    expect(result.subject).toBe('Confirmation Requested: Continued Interest');
    expect(mocks.associationFind).not.toHaveBeenCalled();
  });

  it('sends as written when the mailbox never emailed the recipient', async () => {
    const mocks = setup({ associatedMessageIds: [] });

    const result = await run(mocks);

    expect(result.inReplyTo).toBeUndefined();
    expect(mocks.messageFindOne).not.toHaveBeenCalled();
  });

  it('sends as written when the lookup fails', async () => {
    const mocks = setup();

    mocks.participantFind.mockRejectedValue(new Error('database down'));

    const result = await run(mocks);

    expect(result.inReplyTo).toBeUndefined();
    expect(result.subject).toBe('Confirmation Requested: Continued Interest');
  });

  it.each([
    ['the option is off', { replyToLatestConversation: false }],
    ['In-Reply-To is already set', { inReplyTo: '<manual@flolabs.test>' }],
    ['there is no recipient', { recipients: { to: '' } }],
    ['no account is selected', { connectedAccountId: '' }],
  ])('changes nothing when %s', async (_case, overrides) => {
    const mocks = setup();
    const input = buildInput(overrides);

    const result = await run(mocks, input);

    const { replyToLatestConversation: _option, ...expected } = input;

    expect(result).toEqual(expected);
    expect(mocks.participantFind).not.toHaveBeenCalled();
  });

  it('does not touch a non-text recipient when the option is off', async () => {
    const mocks = setup();
    const input = buildInput({
      replyToLatestConversation: false,
      recipients: { to: ['a@b.co'] as unknown as string },
    });

    await expect(run(mocks, input)).resolves.toEqual(
      expect.objectContaining({ recipients: { to: ['a@b.co'] } }),
    );
  });
});
