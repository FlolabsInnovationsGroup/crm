import { pdf } from '@react-pdf/renderer';
import { saveAs } from 'file-saver';

import { AnalyticsReportPdfDocument } from '@/crm-analytics/report-pdf/components/AnalyticsReportPdfDocument';
import { buildAnalyticsPdfFileName } from '@/crm-analytics/report-pdf/utils/buildAnalyticsPdfFileName';
import { type AnalyticsReport } from '@/crm-analytics/types/AnalyticsApi';

export const downloadAnalyticsReportPdf = async (report: AnalyticsReport) => {
  const blob = await pdf(
    <AnalyticsReportPdfDocument report={report} />,
  ).toBlob();

  saveAs(blob, buildAnalyticsPdfFileName(report));
};
