import { parseAgreementMarkdown } from 'src/modules/agreement-templates/utils/parse-agreement-markdown.util';

describe('parseAgreementMarkdown', () => {
  it('reads headings, paragraphs, lists and bold text', () => {
    expect(
      parseAgreementMarkdown(
        '# Internship agreement\n\nThis is between **FloLabs** and Ada.\nSecond line.\n\n- First term\n2. Second term',
      ),
    ).toEqual([
      {
        kind: 'heading',
        level: 1,
        runs: [{ text: 'Internship agreement', bold: false }],
      },
      {
        kind: 'paragraph',
        runs: [
          { text: 'This is between ', bold: false },
          { text: 'FloLabs', bold: true },
          { text: ' and Ada.\nSecond line.', bold: false },
        ],
      },
      {
        kind: 'listItem',
        marker: '•',
        runs: [{ text: 'First term', bold: false }],
      },
      {
        kind: 'listItem',
        marker: '2.',
        runs: [{ text: 'Second term', bold: false }],
      },
    ]);
  });

  it('keeps underscores and escaped characters, and drops italic markers', () => {
    expect(
      parseAgreementMarkdown(
        'Write to ada_lovelace@example.com for *details*, fee 5\\*.',
      ),
    ).toEqual([
      {
        kind: 'paragraph',
        runs: [
          {
            text: 'Write to ada_lovelace@example.com for details, fee 5*.',
            bold: false,
          },
        ],
      },
    ]);
  });
});
