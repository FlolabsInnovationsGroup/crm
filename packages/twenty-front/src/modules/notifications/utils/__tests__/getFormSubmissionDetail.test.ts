import { publicFormDefinitionSchema } from 'twenty-shared/utils';

import { getFormSubmissionDetail } from '@/notifications/utils/getFormSubmissionDetail';

const definition = publicFormDefinitionSchema.parse({
  version: 1,
  title: 'Internship application',
  fields: [
    { id: 'email', type: 'email', label: 'Email' },
    {
      id: 'position_applied_for',
      type: 'multiSelect',
      label: 'Position',
      options: [
        { value: 'AI_AGI_INTERN', label: 'AI/AGI Intern' },
        {
          value: 'QUALITY_ASSURANCE_INTERN',
          label: 'Quality Assurance Intern',
        },
      ],
    },
  ],
});

describe('getFormSubmissionDetail', () => {
  it('shows the positions applied for by their labels', () => {
    expect(
      getFormSubmissionDetail(definition, {
        email: 'a@b.co',
        position_applied_for: ['AI_AGI_INTERN', 'QUALITY_ASSURANCE_INTERN'],
      }),
    ).toBe('AI/AGI Intern, Quality Assurance Intern');
  });

  it('is empty for a form without a position question', () => {
    expect(getFormSubmissionDetail(definition, { email: 'a@b.co' })).toBe('');
  });
});
