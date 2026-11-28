import {
  ConnectedAccountProvider,
  MessageParticipantRole,
} from 'twenty-shared/types';

import { type ReplyContextReady } from '@/activities/emails/types/ReplyContext';
import { type ApplicantEmailHistoryMessage } from '@/team-inbox/types/ApplicantEmailHistoryMessage';
import { buildApplicantHistoryReplyContext } from '@/team-inbox/utils/buildApplicantHistoryReplyContext';

// The thread's last sent message was HR forwarding to a colleague.
const THREAD_CONTEXT: ReplyContextReady = {
  loading: false,
  to: 'colleague@flolabs.test',
  replyAllCc: 'boss@flolabs.test',
  subject: 'Fwd: Internship',
  inReplyTo: '<forward@mail>',
  connectedAccountId: 'account-hr',
  connectedAccountProvider: ConnectedAccountProvider.GOOGLE,
};

const OPTIONS = {
  applicantEmail: 'ada@x.com',
  ownHandles: ['HR@flolabs.test'],
};

const target = (
  overrides: Partial<ApplicantEmailHistoryMessage>,
): ApplicantEmailHistoryMessage => ({
  id: 'question',
  messageThreadId: 'thread-b',
  subject: 'Internship',
  text: 'When do I start?',
  receivedAt: '2026-11-20T10:00:00.000Z',
  headerMessageId: '<question@mail>',
  direction: 'INCOMING',
  isFromApplicant: true,
  sender: {
    role: MessageParticipantRole.FROM,
    handle: 'ada@x.com',
    displayName: 'Ada',
  },
  recipients: [
    {
      role: MessageParticipantRole.TO,
      handle: 'hr@flolabs.test',
      displayName: 'FloLabs HR',
    },
  ],
  ...overrides,
});

describe('buildApplicantHistoryReplyContext', () => {
  it("answers the applicant, not the thread's last recipient", () => {
    expect(
      buildApplicantHistoryReplyContext(THREAD_CONTEXT, target({}), OPTIONS),
    ).toEqual({
      loading: false,
      to: 'Ada <ada@x.com>',
      replyAllCc: '',
      subject: 'Re: Internship',
      inReplyTo: '<question@mail>',
      connectedAccountId: 'account-hr',
      connectedAccountProvider: ConnectedAccountProvider.GOOGLE,
    });
  });

  it("falls back to the card's address when the sender is unknown", () => {
    expect(
      buildApplicantHistoryReplyContext(
        THREAD_CONTEXT,
        target({ sender: null }),
        OPTIONS,
      ),
    ).toMatchObject({ to: 'ada@x.com' });
  });

  it('answers our own email to its other recipients, without our mailboxes', () => {
    expect(
      buildApplicantHistoryReplyContext(
        THREAD_CONTEXT,
        target({
          isFromApplicant: false,
          direction: 'OUTGOING',
          subject: 'RE: Form 1',
          sender: {
            role: MessageParticipantRole.FROM,
            handle: 'hr@flolabs.test',
            displayName: 'FloLabs HR',
          },
          recipients: [
            {
              role: MessageParticipantRole.TO,
              handle: 'ada@x.com',
              displayName: null,
            },
            {
              role: MessageParticipantRole.CC,
              handle: 'HR@flolabs.test',
              displayName: null,
            },
            {
              role: MessageParticipantRole.CC,
              handle: 'mentor@y.com',
              displayName: null,
            },
            {
              role: MessageParticipantRole.BCC,
              handle: 'archive@y.com',
              displayName: null,
            },
            {
              role: MessageParticipantRole.CC,
              handle: 'ADA@x.com',
              displayName: null,
            },
          ],
        }),
        OPTIONS,
      ),
    ).toMatchObject({ to: 'ada@x.com, mentor@y.com', subject: 'RE: Form 1' });
  });

  it('passes loading or missing contexts through', () => {
    expect(
      buildApplicantHistoryReplyContext({ loading: true }, target({}), OPTIONS),
    ).toEqual({ loading: true });
    expect(
      buildApplicantHistoryReplyContext(null, target({}), OPTIONS),
    ).toBeNull();
    expect(
      buildApplicantHistoryReplyContext(THREAD_CONTEXT, null, OPTIONS),
    ).toBe(THREAD_CONTEXT);
  });
});
