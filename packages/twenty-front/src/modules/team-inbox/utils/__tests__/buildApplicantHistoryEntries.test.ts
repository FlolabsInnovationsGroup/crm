import { type ApplicantEmailHistoryMessage } from '@/team-inbox/types/ApplicantEmailHistoryMessage';
import { buildApplicantHistoryEntries } from '@/team-inbox/utils/buildApplicantHistoryEntries';

const message = (
  id: string,
  subject: string | null,
  messageThreadId = 'thread-a',
): ApplicantEmailHistoryMessage => ({
  id,
  messageThreadId,
  subject,
  text: 'Hello',
  receivedAt: '2026-11-20T10:00:00.000Z',
  headerMessageId: `<${id}@mail>`,
  direction: 'INCOMING',
  isFromApplicant: true,
  sender: null,
  recipients: [],
});

describe('buildApplicantHistoryEntries', () => {
  it('labels the first message and every change of subject', () => {
    expect(
      buildApplicantHistoryEntries([
        message('first', 'Internship'),
        message('reminder', 'Reminder: Form 1', 'thread-b'),
        message('back', 'Internship'),
      ]).map((entry) => [entry.message.id, entry.threadSubject]),
    ).toEqual([
      ['first', 'Internship'],
      ['reminder', 'Reminder: Form 1'],
      ['back', 'Internship'],
    ]);
  });

  it('keeps replies and forwards under the subject they answer', () => {
    expect(
      buildApplicantHistoryEntries([
        message('first', 'Internship'),
        message('reply', 'RE: Internship'),
        message('forward', 'Fwd: re: internship '),
      ]).map(({ threadSubject }) => threadSubject),
    ).toEqual(['Internship', null, null]);
  });

  it('labels a missing subject with an empty one', () => {
    expect(
      buildApplicantHistoryEntries([
        message('first', 'Internship'),
        message('blank', null),
      ]).map(({ threadSubject }) => threadSubject),
    ).toEqual(['Internship', '']);
  });

  it('returns nothing for no messages', () => {
    expect(buildApplicantHistoryEntries([])).toEqual([]);
  });
});
