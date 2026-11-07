import { pdf } from '@react-pdf/renderer';
import { saveAs } from 'file-saver';

import { buildWeeklyReportFixture } from '@/crm-analytics/report-pdf/__tests__/analyticsPdfFixtures';
import { downloadAnalyticsReportPdf } from '@/crm-analytics/report-pdf/downloadAnalyticsReportPdf';
import { buildAnalyticsPdfFileName } from '@/crm-analytics/report-pdf/utils/buildAnalyticsPdfFileName';

const mockBlob = new Blob(['%PDF-']);

jest.mock('@react-pdf/renderer', () => ({
  pdf: jest.fn(() => ({ toBlob: jest.fn(async () => mockBlob) })),
  StyleSheet: { create: (styles: object) => styles },
  Document: () => null,
  Page: () => null,
  View: () => null,
  Text: () => null,
  Svg: () => null,
  G: () => null,
  Rect: () => null,
  Path: () => null,
  Line: () => null,
  Circle: () => null,
}));

jest.mock('file-saver', () => ({ saveAs: jest.fn() }));

describe('downloadAnalyticsReportPdf', () => {
  it('saves the rendered document under the report file name', async () => {
    await downloadAnalyticsReportPdf(buildWeeklyReportFixture());

    expect(pdf).toHaveBeenCalledTimes(1);
    expect(saveAs).toHaveBeenCalledWith(
      mockBlob,
      'FloLabs-analytics-weekly-2026-11-02.pdf',
    );
  });

  it('lets a render failure reach the button so it can show the error', async () => {
    jest.mocked(pdf).mockImplementationOnce(() => {
      throw new Error('render failed');
    });

    await expect(
      downloadAnalyticsReportPdf(buildWeeklyReportFixture()),
    ).rejects.toThrow('render failed');
  });
});

describe('buildAnalyticsPdfFileName', () => {
  it('names a monthly report by its first day', () => {
    expect(
      buildAnalyticsPdfFileName({
        periodType: 'MONTH',
        periodStart: '2026-10-01',
      }),
    ).toBe('FloLabs-analytics-monthly-2026-10-01.pdf');
  });

  it('keeps only the date of a period start with a time', () => {
    expect(
      buildAnalyticsPdfFileName({
        periodType: 'WEEK',
        periodStart: '2026-11-02T00:00:00.000Z',
      }),
    ).toBe('FloLabs-analytics-weekly-2026-11-02.pdf');
  });
});
