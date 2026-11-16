import { MessageParticipantRole } from 'twenty-shared/types';

import { MessageDirection } from 'src/modules/messaging/common/enums/message-direction.enum';
import { type MessageWithParticipants } from 'src/modules/messaging/message-import-manager/types/message.type';
import { filterEmails } from 'src/modules/messaging/message-import-manager/utils/filter-emails.util';

const PRIMARY_HANDLE = 'hr@acme.com';

const buildInternalMessage = (
  subject: string | null,
): MessageWithParticipants =>
  ({
    externalId: `internal-${subject ?? 'none'}`,
    subject,
    receivedAt: new Date('2026-11-16T09:00:00.000Z'),
    text: 'Applicant replied',
    headerMessageId: `<${subject ?? 'none'}@acme.com>`,
    messageThreadExternalId: `thread-${subject ?? 'none'}`,
    direction: MessageDirection.OUTGOING,
    participants: [
      {
        role: MessageParticipantRole.FROM,
        handle: PRIMARY_HANDLE,
        displayName: 'HR',
      },
      {
        role: MessageParticipantRole.TO,
        handle: PRIMARY_HANDLE,
        displayName: 'HR',
      },
    ],
    attachments: [],
    isDraft: false,
  }) as MessageWithParticipants;

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

  it('still drops other internal emails', () => {
    const messages = [
      buildInternalMessage('Weekly sync'),
      buildInternalMessage('Re: [Reply triage] question: a@b.co - Re: x'),
      buildInternalMessage(null),
    ];

    expect(filterEmails(PRIMARY_HANDLE, [], messages, [])).toEqual([]);
  });
});
