import { isNonEmptyString } from '@sniptt/guards';

export type AgreementTextRun = { text: string; bold: boolean };

export type AgreementBlock =
  | { kind: 'heading'; level: number; runs: AgreementTextRun[] }
  | { kind: 'paragraph'; runs: AgreementTextRun[] }
  | { kind: 'listItem'; marker: string; runs: AgreementTextRun[] };

const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBERED = /^\s*(\d+)[.)]\s+(.*)$/;

// BlockNote escapes markdown characters it does not mean as formatting.
const unescape = (text: string) =>
  text.replace(/\\([\\`*_{}[\]()#+\-.!|~>])/g, '$1');

// Only bold is kept. Italic asterisks are dropped; underscores stay, as
// emails use them.
const toRuns = (text: string): AgreementTextRun[] =>
  text
    .split(/(\*\*[^*]+\*\*)/)
    .filter(isNonEmptyString)
    .map((part) =>
      /^\*\*.+\*\*$/.test(part)
        ? { text: unescape(part.slice(2, -2)), bold: true }
        : { text: unescape(part.replace(/(?<!\\)\*/g, '')), bold: false },
    );

// Covers what the CRM's rich text editor writes: headings, paragraphs, lists
// and bold. Anything else is printed as plain text rather than dropped.
export const parseAgreementMarkdown = (markdown: string): AgreementBlock[] => {
  const blocks: AgreementBlock[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: 'paragraph', runs: toRuns(paragraph.join('\n')) });
      paragraph = [];
    }
  };

  for (const line of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    const heading = HEADING.exec(line);
    const bullet = BULLET.exec(line);
    const numbered = NUMBERED.exec(line);

    if (line.trim() === '') {
      flushParagraph();
    } else if (heading) {
      flushParagraph();
      blocks.push({
        kind: 'heading',
        level: heading[1].length,
        runs: toRuns(heading[2]),
      });
    } else if (bullet) {
      flushParagraph();
      blocks.push({ kind: 'listItem', marker: '•', runs: toRuns(bullet[1]) });
    } else if (numbered) {
      flushParagraph();
      blocks.push({
        kind: 'listItem',
        marker: `${numbered[1]}.`,
        runs: toRuns(numbered[2]),
      });
    } else {
      paragraph.push(line.trim());
    }
  }

  flushParagraph();

  return blocks;
};
