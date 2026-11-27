import { getApprovalApplicantSummary } from '@/team-inbox/utils/getApprovalApplicantSummary';

const person = {
  personId: 'person-id',
  name: 'Ada Lovelace',
  stageLabel: 'Contacted',
  stageColor: 'blue' as const,
  position: 'AI/AGI Intern',
  positions: 'AI/AGI Intern, Operations Intern',
  location: 'London, United Kingdom',
  applicationDate: null,
};

describe('getApprovalApplicantSummary', () => {
  it('says what they applied for and where they live', () => {
    expect(getApprovalApplicantSummary(person)).toEqual([
      'Applied for: AI/AGI Intern, Operations Intern',
      'Lives in: London, United Kingdom',
    ]);
  });

  it('adds how long ago they applied and skips what is unknown', () => {
    const summary = getApprovalApplicantSummary({
      ...person,
      positions: '',
      location: '',
      applicationDate: new Date(
        Date.now() - 3 * 24 * 60 * 60 * 1000,
      ).toISOString(),
    });

    expect(summary).toHaveLength(1);
    expect(summary[0]).toMatch(/^Applied /);
  });
});
