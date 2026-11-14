import { suggestInboxTemplate } from '@/team-inbox/utils/suggestInboxTemplate';

const TEMPLATES = [
  { id: 'paid', name: 'Paid or Unpaid' },
  { id: 'orientation', name: 'What is the orientation meeting about' },
  { id: 'not-interested', name: 'NOT INTERESTED' },
  {
    id: 'other-offer',
    name: 'When they found something else work or internship',
  },
];

describe('suggestInboxTemplate', () => {
  it('matches the question in the reply', () => {
    expect(
      suggestInboxTemplate({
        reason: 'question',
        replyText: 'Is the internship paid or unpaid?',
        templates: TEMPLATES,
      })?.id,
    ).toBe('paid');
    expect(
      suggestInboxTemplate({
        reason: 'question',
        replyText: 'I cannot attend the meeting on Saturday.',
        templates: TEMPLATES,
      })?.id,
    ).toBe('orientation');
  });

  it('prefers the other-offer template, then falls back by reason', () => {
    expect(
      suggestInboxTemplate({
        reason: 'not interested',
        replyText: 'Thanks, but I have accepted another offer.',
        templates: TEMPLATES,
      })?.id,
    ).toBe('other-offer');
    expect(
      suggestInboxTemplate({
        reason: 'not interested',
        replyText: 'No thank you.',
        templates: TEMPLATES,
      })?.id,
    ).toBe('not-interested');
  });

  it('suggests nothing when no rule or template fits', () => {
    expect(
      suggestInboxTemplate({
        reason: 'question',
        replyText: 'Can I bring a friend?',
        templates: TEMPLATES,
      }),
    ).toBeNull();
  });
});
