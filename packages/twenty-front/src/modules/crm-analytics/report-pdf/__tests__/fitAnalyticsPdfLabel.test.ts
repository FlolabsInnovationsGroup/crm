import {
  estimateAnalyticsPdfTextWidth,
  truncateAnalyticsPdfLabel,
  wrapAnalyticsPdfLabel,
} from '@/crm-analytics/report-pdf/utils/fitAnalyticsPdfLabel';

const FONT_SIZE = 8;

describe('wrapAnalyticsPdfLabel', () => {
  it('keeps a short label on one line', () => {
    expect(
      wrapAnalyticsPdfLabel({
        text: 'New',
        maximumWidth: 100,
        fontSize: FONT_SIZE,
      }),
    ).toEqual(['New']);
  });

  it('breaks a long track name between words on two lines', () => {
    const text = 'Business Management, Growth & Entrepreneurship';
    const lines = wrapAnalyticsPdfLabel({
      text,
      maximumWidth: 120,
      fontSize: FONT_SIZE,
    });

    expect(lines).toHaveLength(2);
    expect(lines.join(' ')).toBe(text);
  });

  it('ends with an ellipsis when the label needs more lines than allowed', () => {
    const lines = wrapAnalyticsPdfLabel({
      text: 'Business Management, Growth & Entrepreneurship and every partner program run with universities',
      maximumWidth: 100,
      fontSize: FONT_SIZE,
    });

    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith('…')).toBe(true);
    lines.forEach((line) =>
      expect(
        estimateAnalyticsPdfTextWidth(line, FONT_SIZE),
      ).toBeLessThanOrEqual(100),
    );
  });

  it('cuts one very long word to fit', () => {
    const [line] = wrapAnalyticsPdfLabel({
      text: 'Pneumonoultramicroscopicsilicovolcanoconiosis',
      maximumWidth: 40,
      fontSize: FONT_SIZE,
    });

    expect(line.endsWith('…')).toBe(true);
    expect(estimateAnalyticsPdfTextWidth(line, FONT_SIZE)).toBeLessThanOrEqual(
      40,
    );
  });
});

describe('truncateAnalyticsPdfLabel', () => {
  it('returns text that fits untouched', () => {
    expect(
      truncateAnalyticsPdfLabel({
        text: 'Signed',
        maximumWidth: 100,
        fontSize: FONT_SIZE,
      }),
    ).toBe('Signed');
  });

  it('leaves only an ellipsis when nothing else fits', () => {
    expect(
      truncateAnalyticsPdfLabel({
        text: 'Signed',
        maximumWidth: 1,
        fontSize: FONT_SIZE,
      }),
    ).toBe('…');
  });
});
