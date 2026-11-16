import { MessageParticipantRole } from 'twenty-shared/types';

import { type MessageWithParticipants } from 'src/modules/messaging/message-import-manager/types/message.type';
import { messagingGetMessagesServiceGetMessages } from 'src/modules/messaging/message-import-manager/utils/__mocks__/messages';
import { filterEmails } from 'src/modules/messaging/message-import-manager/utils/filter-emails.util';

const PRIMARY_HANDLE = 'hr@acme.com';

const buildInternalMessage = (
  subject: string | null,
  senderHandle: string = PRIMARY_HANDLE,
): MessageWithParticipants => ({
  ...messagingGetMessagesServiceGetMessages[0],
  externalId: `internal-${subject ?? 'none'}-${senderHandle}`,
  subject,
  participants: [
    {
      role: MessageParticipantRole.FROM,
      handle: senderHandle,
      displayName: 'Sender',
    },
    {
      role: MessageParticipantRole.TO,
      handle: PRIMARY_HANDLE,
      displayName: 'HR',
    },
  ],
});

describe('filterEmails reply triage', () => {
  it('keeps an internal reply-triage email', () => {
    const message = buildInternalMessage(
      '[Reply triage] question: applicant@gmail.com - Re: Internship',
    );

    expect(filterEmails(PRIMARY_HANDLE, [], [message], [])).toEqual([message]);
  });

  it('matches the prefix regardless of case', () => {
    const message = buildInternalMessage(
      '[reply TRIAGE] not_interested: applicant@gmail.com - Re: Internship',
    );

    expect(filterEmails(PRIMARY_HANDLE, [], [message], [])).toEqual([message]);
  });

  it('keeps a reply-triage email sent from another address on the domain', () => {
    const message = buildInternalMessage(
      '[Reply triage] question: applicant@gmail.com - Re: Internship',
      'automation@acme.com',
    );

    expect(filterEmails(PRIMARY_HANDLE, [], [message], [])).toEqual([message]);
  });

  it('still drops other internal emails', () => {
    const messages = [
      buildInternalMessage('Weekly sync'),
      buildInternalMessage('Re: [Reply triage] question: a@b.co - Re: x'),
      buildInternalMessage(null),
    ];

    expect(filterEmails(PRIMARY_HANDLE, [], messages, [])).toEqual([]);
  });
});
