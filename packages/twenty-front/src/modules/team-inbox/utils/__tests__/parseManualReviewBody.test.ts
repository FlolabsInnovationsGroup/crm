import { parseManualReviewBody } from '@/team-inbox/utils/parseManualReviewBody';

const TRIAGE_BODY = `Applicant reply - needs a human

From: Harry (harry@example.com)
Current CRM stage: CONTACTED
AI classification (advisory): not_interested - The applicant states they are not interested in an unpaid internship. (The applicant explicitly declines.)
CRM person: open person

No automated action was taken. Not interested: set the status and send the "Not Interested" template manually.

Their reply:

thx for your reply,I'm not interested in no paid internship

Human Resources <hr@flolabs.com> 于2026年11月14日周六 06:44写道：
> earlier email

Execution: 1152707`;

describe('parseManualReviewBody', () => {
  it('reads the stage, the summary and the applicant text without the quote', () => {
    expect(parseManualReviewBody(TRIAGE_BODY)).toEqual({
      stage: 'CONTACTED',
      classification:
        'The applicant states they are not interested in an unpaid internship.',
      reply: "thx for your reply,I'm not interested in no paid internship",
    });
  });

  it('copes with a body in another format', () => {
    expect(parseManualReviewBody('Something else')).toEqual({
      stage: null,
      classification: null,
      reply: '',
    });
  });
});
