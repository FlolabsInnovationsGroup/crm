import { type ApplicantEmailHistoryMessage } from '@/team-inbox/types/ApplicantEmailHistoryMessage';
import { pickApplicantHistoryReplyTarget } from '@/team-inbox/utils/pickApplicantHistoryReplyTarget';

const message = (
  id: string,
  isFromApplicant: boolean,
): ApplicantEmailHistoryMessage => ({
  id,
  messageThreadId: `thread-${id}`,
  subject: 'Internship',
  text: 'Hello',
  receivedAt: '2026-11-20T10:00:00.000Z',
  headerMessageId: `<${id}@mail>`,
  direction: isFromApplicant ? 'INCOMING' : 'OUTGOING',
  isFromApplicant,
  sender: null,
  recipients: [],
});

describe('pickApplicantHistoryReplyTarget', () => {
  it('answers the newest email the applicant sent, even after our reminders', () => {
    expect(
      pickApplicantHistoryReplyTarget([
        message('first', false),
        message('question', true),
        message('follow-up', true),
        message('reminder', false),
      ])?.id,
    ).toBe('follow-up');
  });

  it('falls back to the newest email when the applicant never wrote', () => {
    expect(
      pickApplicantHistoryReplyTarget([
        message('first', false),
        message('reminder', false),
      ])?.id,
    ).toBe('reminder');
  });

  it('has nothing to answer without emails', () => {
    expect(pickApplicantHistoryReplyTarget([])).toBeNull();
  });
});
