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

describe('filterEmails manual review', () => {
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

  it.each([
    'APPROVAL NEEDED (Form 1): send "BEFORE MEETING" to applicant@gmail.com',
    'APPROVAL NEEDED (orientation): choose a date for Ada Lovelace (applicant@gmail.com)',
    'approval needed (ORIENTATION): choose a date for Ada Lovelace (applicant@gmail.com)',
    '[Stuck applicant] Ada Lovelace (applicant@gmail.com)',
    '[n8n] Recruitment automation needs attention: applicant@gmail.com',
    '[n8n] Email SENT but CRM not updated: applicant@gmail.com',
    '[n8n] CRM application not queued: applicant@gmail.com',
    '[n8n] CRM first email step failed: applicant@gmail.com',
  ])('keeps the internal automation email "%s"', (subject) => {
    const message = buildInternalMessage(subject);

    expect(filterEmails(PRIMARY_HANDLE, [], [message], [])).toEqual([message]);
  });

  it.each([
    '[n8n] Recruitment automation summary',
    '[n8n] WARNING: workflow stopped',
    '[N8N] Recovery Check: 2 items',
  ])('keeps the internal system report "%s"', (subject) => {
    const message = buildInternalMessage(subject);

    expect(filterEmails(PRIMARY_HANDLE, [], [message], [])).toEqual([message]);
  });

  it('drops a system-looking email a teammate sent', () => {
    const message = buildInternalMessage(
      '[n8n] Gmail node credentials',
      'teammate@acme.com',
    );

    expect(filterEmails(PRIMARY_HANDLE, [], [message], [])).toEqual([]);
  });

  it('still drops other internal emails', () => {
    const messages = [
      buildInternalMessage('Weekly sync'),
      buildInternalMessage('Re: [Reply triage] question: a@b.co - Re: x'),
      buildInternalMessage('Approval needed: team budget'),
      buildInternalMessage(
        'Re: APPROVAL NEEDED (Form 1): send "BEFORE MEETING" to a@b.co',
      ),
      buildInternalMessage('Re: [n8n] WARNING: workflow stopped'),
      buildInternalMessage('n8n weekly sync'),
      buildInternalMessage(null),
    ];

    expect(filterEmails(PRIMARY_HANDLE, [], messages, [])).toEqual([]);
  });
});
