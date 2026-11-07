import { i18n } from '@lingui/core';
import { t } from '@lingui/core/macro';
import { Document, Page, StyleSheet } from '@react-pdf/renderer';

import { AnalyticsPdfComparisonSection } from '@/crm-analytics/report-pdf/components/AnalyticsPdfComparisonSection';
import { AnalyticsPdfFirstPage } from '@/crm-analytics/report-pdf/components/AnalyticsPdfFirstPage';
import { AnalyticsPdfFunnelSection } from '@/crm-analytics/report-pdf/components/AnalyticsPdfFunnelSection';
import { AnalyticsPdfPageFrame } from '@/crm-analytics/report-pdf/components/AnalyticsPdfPageFrame';
import { AnalyticsPdfProgramsSection } from '@/crm-analytics/report-pdf/components/AnalyticsPdfProgramsSection';
import { AnalyticsPdfTracksSection } from '@/crm-analytics/report-pdf/components/AnalyticsPdfTracksSection';
import { AnalyticsPdfTrendsSection } from '@/crm-analytics/report-pdf/components/AnalyticsPdfTrendsSection';
import { ANALYTICS_PDF_COLOR } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfColor';
import { ANALYTICS_PDF_FONT } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfFont';
import { ANALYTICS_PDF_FONT_SIZE } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfFontSize';
import { ANALYTICS_PDF_PAGE_LAYOUT } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfPageLayout';
import { type AnalyticsReport } from '@/crm-analytics/types/AnalyticsApi';
import { formatAnalyticsReportPeriod } from '@/crm-analytics/utils/formatAnalyticsReportPeriod';

const styles = StyleSheet.create({
  page: {
    backgroundColor: ANALYTICS_PDF_COLOR.surface,
    color: ANALYTICS_PDF_COLOR.ink,
    fontFamily: ANALYTICS_PDF_FONT.regular,
    fontSize: ANALYTICS_PDF_FONT_SIZE.body,
    paddingBottom: ANALYTICS_PDF_PAGE_LAYOUT.bottomMargin,
    paddingHorizontal: ANALYTICS_PDF_PAGE_LAYOUT.horizontalMargin,
    paddingTop: ANALYTICS_PDF_PAGE_LAYOUT.topMargin,
  },
});

type AnalyticsReportPdfDocumentProps = {
  report: AnalyticsReport;
};

export const AnalyticsReportPdfDocument = ({
  report,
}: AnalyticsReportPdfDocumentProps) => {
  const reportPeriod = formatAnalyticsReportPeriod(report);
  const title =
    report.periodType === 'MONTH'
      ? t`Monthly report, ${reportPeriod}`
      : t`Weekly report, ${reportPeriod}`;
  const generatedAt = i18n.date(new Date(report.generatedAt), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: report.reportingTimeZone,
    timeZoneName: 'short',
  });

  return (
    <Document title={title} creator={t`FloLabs analytics`}>
      <Page size="A4" style={styles.page}>
        <AnalyticsPdfPageFrame title={title} generatedAt={generatedAt} />
        <AnalyticsPdfFirstPage report={report} generatedAt={generatedAt} />
        <AnalyticsPdfFunnelSection report={report} />
        <AnalyticsPdfTracksSection report={report} />
        <AnalyticsPdfProgramsSection report={report} />
        <AnalyticsPdfTrendsSection report={report} />
        <AnalyticsPdfComparisonSection report={report} />
      </Page>
    </Document>
  );
};
