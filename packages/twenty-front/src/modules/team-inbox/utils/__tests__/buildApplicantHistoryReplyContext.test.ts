import { ConnectedAccountProvider } from 'twenty-shared/types';

import { type ReplyContextReady } from '@/activities/emails/types/ReplyContext';
import { type ApplicantEmailHistoryMessage } from '@/team-inbox/types/ApplicantEmailHistoryMessage';
import { buildApplicantHistoryReplyContext } from '@/team-inbox/utils/buildApplicantHistoryReplyContext';

const THREAD_CONTEXT: ReplyContextReady = {
  loading: false,
  to: 'Ada <ada@x.com>',
  replyAllCc: '',
  subject: 'Re: Internship',
  inReplyTo: '<our-reminder@mail>',
  connectedAccountId: 'account-hr',
  connectedAccountProvider: ConnectedAccountProvider.GOOGLE,
};

const target = (
  overrides: Partial<ApplicantEmailHistoryMessage>,
): ApplicantEmailHistoryMessage => ({
  id: 'question',
  messageThreadId: 'thread-a',
  subject: 'Internship',
  text: 'When do I start?',
  receivedAt: '2026-11-20T10:00:00.000Z',
  headerMessageId: '<question@mail>',
  direction: 'INCOMING',
  isFromApplicant: true,
  sender: null,
  recipients: [],
  ...overrides,
});

describe('buildApplicantHistoryReplyContext', () => {
  it("answers the target message from its thread's mailbox", () => {
    expect(
      buildApplicantHistoryReplyContext(THREAD_CONTEXT, target({})),
    ).toEqual({
      ...THREAD_CONTEXT,
      inReplyTo: '<question@mail>',
      subject: 'Re: Internship',
    });
  });

  it('keeps an existing Re: prefix', () => {
    expect(
      buildApplicantHistoryReplyContext(
        THREAD_CONTEXT,
        target({ subject: 'RE: Form 1' }),
      ),
    ).toMatchObject({ subject: 'RE: Form 1' });
  });

  it("falls back to the thread's values when the target lacks them", () => {
    expect(
      buildApplicantHistoryReplyContext(
        THREAD_CONTEXT,
        target({ headerMessageId: null, subject: '  ' }),
      ),
    ).toEqual(THREAD_CONTEXT);
  });

  it('passes loading or missing contexts through', () => {
    expect(
      buildApplicantHistoryReplyContext({ loading: true }, target({})),
    ).toEqual({ loading: true });
    expect(buildApplicantHistoryReplyContext(null, target({}))).toBeNull();
    expect(buildApplicantHistoryReplyContext(THREAD_CONTEXT, null)).toBe(
      THREAD_CONTEXT,
    );
  });
});
