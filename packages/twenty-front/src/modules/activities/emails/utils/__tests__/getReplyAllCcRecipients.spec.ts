import { getReplyAllCcRecipients } from '@/activities/emails/utils/getReplyAllCcRecipients';
import { type EmailThreadMessageParticipant } from '@/activities/emails/types/EmailThreadMessageParticipant';
import { type EmailThreadMessageWithSender } from '@/activities/emails/types/EmailThreadMessageWithSender';
import { MessageParticipantRole } from 'twenty-shared/types';

const buildParticipant = (
  role: MessageParticipantRole,
  handle: string,
  displayName = '',
): EmailThreadMessageParticipant =>
  ({
    role,
    handle,
    displayName,
  }) as EmailThreadMessageParticipant;

const buildMessage = (
  participants: EmailThreadMessageParticipant[],
): EmailThreadMessageWithSender =>
  ({
    sender: participants[0],
    messageParticipants: participants,
  }) as unknown as EmailThreadMessageWithSender;

const CONNECTED_ACCOUNT_HANDLE = 'hr@company.com';

describe('getReplyAllCcRecipients', () => {
  it('copies the other To and Cc participants, without me or the reply target', () => {
    const message = buildMessage([
      buildParticipant(MessageParticipantRole.FROM, 'applicant@example.com'),
      buildParticipant(MessageParticipantRole.TO, CONNECTED_ACCOUNT_HANDLE),
      buildParticipant(MessageParticipantRole.CC, 'ceo@company.com', 'CEO'),
      buildParticipant(MessageParticipantRole.CC, 'applicant@example.com'),
    ]);

    expect(
      getReplyAllCcRecipients({
        message,
        connectedAccountHandle: CONNECTED_ACCOUNT_HANDLE,
        replyToRecipients: 'applicant@example.com',
      }),
    ).toBe('CEO <ceo@company.com>');
  });

  it('removes duplicates regardless of case', () => {
    const message = buildMessage([
      buildParticipant(MessageParticipantRole.FROM, 'a@example.com'),
      buildParticipant(MessageParticipantRole.TO, 'b@example.com'),
      buildParticipant(MessageParticipantRole.CC, 'B@Example.com'),
    ]);

    expect(
      getReplyAllCcRecipients({
        message,
        connectedAccountHandle: CONNECTED_ACCOUNT_HANDLE,
        replyToRecipients: 'a@example.com',
      }),
    ).toBe('b@example.com');
  });

  it('returns an empty string when nobody else was on the email', () => {
    const message = buildMessage([
      buildParticipant(MessageParticipantRole.FROM, 'a@example.com'),
      buildParticipant(MessageParticipantRole.TO, CONNECTED_ACCOUNT_HANDLE),
    ]);

    expect(
      getReplyAllCcRecipients({
        message,
        connectedAccountHandle: CONNECTED_ACCOUNT_HANDLE,
        replyToRecipients: 'a@example.com',
      }),
    ).toBe('');
  });
});
