import { toManualReviewHistoryCsvRow } from '@/team-inbox/utils/toManualReviewHistoryCsvRow';
import { type TimelineThread } from '~/generated/graphql';

const TRIAGE_BODY = `Applicant reply - needs a human

From: Jane (jane@example.com)
Current CRM stage: CONTACTED

Their reply:

Is the internship paid?

Execution: 1152707`;

const thread = {
  id: '20202020-0001-4e7c-8001-123456789def',
  lastMessageBody: TRIAGE_BODY,
  lastMessageReceivedAt: '2026-11-25T08:00:00.000Z',
} as TimelineThread;

describe('toManualReviewHistoryCsvRow', () => {
  it('combines the review email with when it was done and our reply', () => {
    expect(
      toManualReviewHistoryCsvRow({
        thread,
        item: {
          kind: 'REPLY_TRIAGE',
          applicantEmail: 'jane@example.com',
          triage: {
            reason: 'question',
            note: null,
            applicantEmail: 'jane@example.com',
            originalSubject: 'Re: Your application',
          },
          approvalUrl: null,
        },
        kindLabel: 'Applicant reply',
        entry: {
          messageThreadId: thread.id,
          doneAt: '2026-11-25T10:00:00.000Z',
          doneByName: 'Nago',
          replyText:
            'Yes, it is paid.\n\nOn Tue, 25 Nov 2026, Jane wrote:\n> Is the internship paid?',
          replySentAt: '2026-11-25T09:30:00.000Z',
        },
        suggestedTemplateName: 'Paid internship',
        formatDateTime: (isoDate) => `local ${isoDate}`,
      }),
    ).toEqual({
      doneAt: 'local 2026-11-25T10:00:00.000Z',
      doneByName: 'Nago',
      applicantEmail: 'jane@example.com',
      kind: 'Applicant reply',
      reason: 'question',
      stage: 'CONTACTED',
      applicantMessage: 'Is the internship paid?',
      suggestedTemplate: 'Paid internship',
      replyText: 'Yes, it is paid.',
      replySentAt: 'local 2026-11-25T09:30:00.000Z',
      reviewReceivedAt: 'local 2026-11-25T08:00:00.000Z',
    });
  });

  it('leaves the history columns empty when the server has no details', () => {
    const row = toManualReviewHistoryCsvRow({
      thread,
      item: {
        kind: 'OTHER',
        applicantEmail: null,
        triage: null,
        approvalUrl: null,
      },
      kindLabel: 'Other',
      entry: undefined,
      suggestedTemplateName: null,
      formatDateTime: (isoDate) => isoDate,
    });

    expect(row.doneAt).toBeNull();
    expect(row.replyText).toBeNull();
    expect(row.stage).toBeNull();
  });
});
