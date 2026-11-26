import {
  buildManualReviewHistoryCsv,
  type ManualReviewHistoryCsvHeaders,
  type ManualReviewHistoryCsvRow,
} from '@/team-inbox/utils/buildManualReviewHistoryCsv';

const HEADERS: ManualReviewHistoryCsvHeaders = {
  doneAt: 'Done at',
  doneByName: 'Done by',
  applicantEmail: 'Applicant',
  kind: 'Type',
  reason: 'Reason',
  stage: 'Stage',
  applicantMessage: 'Their message',
  suggestedTemplate: 'Suggested template',
  replyText: 'Our reply',
  replySentAt: 'Reply sent at',
  reviewReceivedAt: 'Review received at',
};

const ROW: ManualReviewHistoryCsvRow = {
  doneAt: '2026-11-25T10:00:00.000Z',
  doneByName: 'Nago',
  applicantEmail: 'jane@example.com',
  kind: 'Reply triage',
  reason: 'question',
  stage: 'Applied',
  applicantMessage: 'Is it paid?\nWhen do I start?',
  suggestedTemplate: null,
  replyText: 'Yes, "paid", from 1 December',
  replySentAt: '2026-11-25T09:30:00.000Z',
  reviewReceivedAt: '2026-11-25T08:00:00.000Z',
};

describe('buildManualReviewHistoryCsv', () => {
  it('writes a header row and one row per item, quoting cells that need it', () => {
    const [header, row] = buildManualReviewHistoryCsv([ROW], HEADERS)
      .replace('\uFEFF', '')
      .split('\r\n');

    expect(header).toBe(
      'Done at,Done by,Applicant,Type,Reason,Stage,Their message,Suggested template,Our reply,Reply sent at,Review received at',
    );
    expect(row).toContain('"Is it paid?\nWhen do I start?"');
    expect(row).toContain('"Yes, ""paid"", from 1 December"');
  });

  it('starts with a byte order mark so Excel reads Arabic text', () => {
    expect(buildManualReviewHistoryCsv([], HEADERS).startsWith('\uFEFF')).toBe(
      true,
    );
  });

  it('stops applicant text from running as a spreadsheet formula', () => {
    const csv = buildManualReviewHistoryCsv(
      [{ ...ROW, applicantMessage: '=HYPERLINK("https://example.com")' }],
      HEADERS,
    );

    // A zero-width joiner in front keeps the cell from starting with "=".
    expect(csv).toContain('"\u200D=HYPERLINK(""https://example.com"")"');
  });

  it('leaves missing values empty', () => {
    const csv = buildManualReviewHistoryCsv(
      [{ ...ROW, doneByName: null, replyText: null }],
      HEADERS,
    );

    expect(csv.split('\r\n')[1].startsWith('2026-11-25T10:00:00.000Z,,')).toBe(
      true,
    );
  });
});
