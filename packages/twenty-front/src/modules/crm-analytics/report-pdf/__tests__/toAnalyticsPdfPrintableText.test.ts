import { toAnalyticsPdfPrintableText } from '@/crm-analytics/report-pdf/utils/toAnalyticsPdfPrintableText';

describe('toAnalyticsPdfPrintableText', () => {
  it('keeps everything the built-in fonts can print', () => {
    expect(toAnalyticsPdfPrintableText('Août – 82% …')).toBe('Août – 82% …');
  });

  it('prints the narrow spaces of number and date formats as plain spaces', () => {
    expect(toAnalyticsPdfPrintableText('1 234 at 2:30 PM')).toBe(
      '1 234 at 2:30 PM',
    );
  });

  it('drops accents the fonts lack and turns the minus sign into a hyphen', () => {
    expect(toAnalyticsPdfPrintableText('Łódź −5')).toBe('?ódz -5');
  });

  it('shows a plain mark for anything else instead of wrong characters', () => {
    expect(toAnalyticsPdfPrintableText('2026年')).toBe('2026?');
  });
});
