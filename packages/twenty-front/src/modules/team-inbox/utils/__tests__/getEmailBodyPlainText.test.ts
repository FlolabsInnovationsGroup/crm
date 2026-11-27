import { getEmailBodyPlainText } from '@/team-inbox/utils/getEmailBodyPlainText';

describe('getEmailBodyPlainText', () => {
  it('reads an unedited template, which is still HTML', () => {
    expect(
      getEmailBodyPlainText(
        '<p>Hi Ada,</p><p>It is <strong>unpaid</strong>.<br>Thanks</p>',
      ),
    ).toBe('Hi Ada,\n\nIt is unpaid.\nThanks');
  });

  it('reads the editor document and keeps paragraphs', () => {
    const document = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Hi Ada,' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'It starts ' },
            { type: 'text', text: 'Monday', marks: [{ type: 'bold' }] },
            { type: 'hardBreak' },
            { type: 'text', text: 'HR Team' },
          ],
        },
      ],
    };

    expect(getEmailBodyPlainText(JSON.stringify(document))).toBe(
      'Hi Ada,\n\nIt starts Monday\nHR Team',
    );
  });
});
