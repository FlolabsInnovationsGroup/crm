import { parseTeamInboxReviewItem } from '@/team-inbox/utils/parseTeamInboxReviewItem';

const APPROVAL_URL =
  'https://searchcompareshare.com/webhook-waiting/1234/abcd?approved=true&signature=xyz';

describe('parseTeamInboxReviewItem', () => {
  it('reads a reply-triage email', () => {
    expect(
      parseTeamInboxReviewItem(
        '[Reply triage] question: ada@gmail.com - Re: Internship',
        '',
      ),
    ).toEqual({
      kind: 'REPLY_TRIAGE',
      applicantEmail: 'ada@gmail.com',
      triage: {
        reason: 'question',
        note: null,
        applicantEmail: 'ada@gmail.com',
        originalSubject: 'Re: Internship',
      },
      approvalUrl: null,
    });
  });

  it('reads an orientation approval and its approval page', () => {
    expect(
      parseTeamInboxReviewItem(
        'APPROVAL NEEDED (orientation): choose a date for Ada Lovelace (ada@gmail.com)',
        `Ada submitted Form 2.\n\nChoose date and send [${APPROVAL_URL}]`,
      ),
    ).toEqual({
      kind: 'ORIENTATION_APPROVAL',
      applicantEmail: 'ada@gmail.com',
      triage: null,
      approvalUrl: APPROVAL_URL,
    });
  });

  it('reads a Form 1 approval', () => {
    const item = parseTeamInboxReviewItem(
      'APPROVAL NEEDED (Form 1): send "BEFORE MEETING" to ada@gmail.com',
      `Review and send [${APPROVAL_URL}]`,
    );

    expect(item.kind).toBe('FORM_1_APPROVAL');
    expect(item.applicantEmail).toBe('ada@gmail.com');
    expect(item.approvalUrl).toBe(APPROVAL_URL);
  });

  it('ignores approval links to any other site', () => {
    const item = parseTeamInboxReviewItem(
      'APPROVAL NEEDED (Form 1): send "BEFORE MEETING" to ada@gmail.com',
      'Review and send [https://searchcompareshare.com.evil.example/webhook-waiting/1/2]\nOpen [https://example.com/webhook-waiting/1/2]',
    );

    expect(item.approvalUrl).toBeNull();
  });

  it.each([
    'http://searchcompareshare.com/webhook-waiting/1/2',
    'https://searchcompareshare.com:444/webhook-waiting/1/2',
    'https://searchcompareshare.com@evil.example/webhook-waiting/1/2',
    'https://searchcompareshare.com/workflow/1',
  ])('gives no approval button for %s', (link) => {
    const item = parseTeamInboxReviewItem(
      'APPROVAL NEEDED (orientation): choose a date for Ada (ada@gmail.com)',
      `Choose date and send [${link}]`,
    );

    expect(item.approvalUrl).toBeNull();
  });

  it('keeps an unknown subject as a plain item', () => {
    expect(parseTeamInboxReviewItem('Something else entirely', '')).toEqual({
      kind: 'OTHER',
      applicantEmail: null,
      triage: null,
      approvalUrl: null,
    });
  });

  it.each([
    ['[Stuck applicant] Ada Lovelace (ada@gmail.com)', 'STUCK_APPLICANT'],
    [
      '[n8n] Recruitment automation needs attention: ada@gmail.com',
      'AUTOMATION_NEEDS_ATTENTION',
    ],
    [
      '[n8n] Email SENT but CRM not updated: ada@gmail.com',
      'AUTOMATION_SENT_NOT_UPDATED',
    ],
    [
      '[n8n] CRM application not queued: ada@gmail.com',
      'AUTOMATION_FIRST_EMAIL_FAILED',
    ],
    [
      '[n8n] CRM first email step failed: ada@gmail.com',
      'AUTOMATION_FIRST_EMAIL_FAILED',
    ],
  ])('reads "%s" as %s', (subject, kind) => {
    expect(parseTeamInboxReviewItem(subject, '')).toEqual({
      kind,
      applicantEmail: 'ada@gmail.com',
      triage: null,
      approvalUrl: null,
    });
  });
});
