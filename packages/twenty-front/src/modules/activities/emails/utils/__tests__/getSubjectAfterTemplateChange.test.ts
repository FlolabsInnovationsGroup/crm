import { getSubjectAfterTemplateChange } from '@/activities/emails/utils/getSubjectAfterTemplateChange';

describe('getSubjectAfterTemplateChange', () => {
  it('fills an empty subject from the template', () => {
    expect(
      getSubjectAfterTemplateChange({
        currentSubject: '  ',
        previousTemplateSubject: null,
        templateSubject: 'Reminder: Program Agreement',
      }),
    ).toBe('Reminder: Program Agreement');
  });

  it('replaces the subject the previous template filled in', () => {
    expect(
      getSubjectAfterTemplateChange({
        currentSubject: 'RE: FloLabs Internship - Next Steps',
        previousTemplateSubject: 'RE: FloLabs Internship - Next Steps',
        templateSubject: 'Reminder: Program Agreement',
      }),
    ).toBe('Reminder: Program Agreement');
  });

  it('clears the previous template subject when the new one has none', () => {
    expect(
      getSubjectAfterTemplateChange({
        currentSubject: 'FloLabs Internship - Next Steps',
        previousTemplateSubject: 'FloLabs Internship - Next Steps',
        templateSubject: '',
      }),
    ).toBe('');
  });

  it('keeps a subject the sender typed', () => {
    expect(
      getSubjectAfterTemplateChange({
        currentSubject: 'Your agreement',
        previousTemplateSubject: 'FloLabs Internship - Next Steps',
        templateSubject: 'Reminder: Program Agreement',
      }),
    ).toBe('Your agreement');
  });

  it('keeps the reply subject so the email stays in its thread', () => {
    expect(
      getSubjectAfterTemplateChange({
        currentSubject: 'Re: FloLabs Internship',
        previousTemplateSubject: null,
        templateSubject: 'Reminder: Program Agreement',
      }),
    ).toBe('Re: FloLabs Internship');
  });
});
