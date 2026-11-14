import { parseManualReviewSubject } from '@/team-inbox/utils/parseManualReviewSubject';

describe('parseManualReviewSubject', () => {
  it('reads the reason, applicant and original subject', () => {
    expect(
      parseManualReviewSubject(
        '[Reply triage] not_interested: potteryhrr@gmail.com - Re: Program Clarification',
      ),
    ).toEqual({
      reason: 'not interested',
      note: null,
      applicantEmail: 'potteryhrr@gmail.com',
      originalSubject: 'Re: Program Clarification',
    });
  });

  it('keeps the note in brackets', () => {
    expect(
      parseManualReviewSubject(
        '[Reply triage] question (CONTACTED already sent): ssa83@mail.aub.edu - Re: FloLabs Internship',
      ),
    ).toEqual({
      reason: 'question',
      note: 'CONTACTED already sent',
      applicantEmail: 'ssa83@mail.aub.edu',
      originalSubject: 'Re: FloLabs Internship',
    });
  });

  it('shows an unexpected subject as it is', () => {
    expect(parseManualReviewSubject('[Reply triage] something else')).toEqual({
      reason: '',
      note: null,
      applicantEmail: null,
      originalSubject: '[Reply triage] something else',
    });
  });
});
