import { extractImportedMessageText } from 'src/modules/messaging/message-import-manager/utils/extract-imported-message-text.util';

const TRIAGE_BODY = [
  'APPLICANT REPLY - NEEDS A HUMAN',
  '',
  'From: Ada Lovelace <ada@gmail.com>',
  'Sent: Monday, November 16, 2026 10:00 AM',
  'Current CRM stage: Contacted',
  'AI classification (advisory): question - asks about hours',
  '',
  'Their reply:',
  'How many hours per week is the internship?',
  '',
  'On Mon, 16 Nov 2026 at 09:00, Human Resources <hr@flolabs.test> wrote:',
  '> Thank you for applying to FloLabs.',
].join('\n');

const APPROVAL_HTML = [
  '<p>Ada submitted Form 2.</p>',
  '<p>On Mon, 16 Nov 2026 at 09:00, Ada <ada@gmail.com> wrote:</p>',
  '<p><a href="https://n8n.example.com/webhook-waiting/1/2?signature=abc">Choose date and send</a></p>',
].join('');

describe('extractImportedMessageText', () => {
  it('keeps the whole body of a reply-triage email', () => {
    const text = extractImportedMessageText({
      subject: '[Reply triage] question: ada@gmail.com - Re: Internship',
      text: TRIAGE_BODY,
    });

    expect(text).toContain('Current CRM stage: Contacted');
    expect(text).toContain('How many hours per week is the internship?');
  });

  it('keeps the approval link of an approval email', () => {
    const text = extractImportedMessageText({
      subject:
        'APPROVAL NEEDED (orientation): choose a date for Ada (ada@gmail.com)',
      html: APPROVAL_HTML,
    });

    expect(text).toContain(
      'Choose date and send [https://n8n.example.com/webhook-waiting/1/2?signature=abc]',
    );
  });

  it('still strips quoted history from other emails', () => {
    const text = extractImportedMessageText({
      subject: 'Re: Internship',
      text: TRIAGE_BODY,
    });

    expect(text).not.toContain('How many hours per week is the internship?');
  });
});
