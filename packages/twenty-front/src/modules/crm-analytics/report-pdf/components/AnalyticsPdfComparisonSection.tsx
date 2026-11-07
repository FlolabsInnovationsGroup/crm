import { t } from '@lingui/core/macro';
import { StyleSheet, View } from '@react-pdf/renderer';

import { AnalyticsPdfBlockGap } from '@/crm-analytics/report-pdf/components/AnalyticsPdfBlockGap';
import { AnalyticsPdfComparisonTable } from '@/crm-analytics/report-pdf/components/AnalyticsPdfComparisonTable';
import { AnalyticsPdfNoData } from '@/crm-analytics/report-pdf/components/AnalyticsPdfNoData';
import { AnalyticsPdfSection } from '@/crm-analytics/report-pdf/components/AnalyticsPdfSection';
import { AnalyticsPdfText } from '@/crm-analytics/report-pdf/components/AnalyticsPdfText';
import { ANALYTICS_PDF_COLOR } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfColor';
import { ANALYTICS_PDF_FONT_SIZE } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfFontSize';
import { buildAnalyticsPdfComparisonRows } from '@/crm-analytics/report-pdf/utils/buildAnalyticsPdfComparisonRows';
import { formatAnalyticsPdfNumber } from '@/crm-analytics/report-pdf/utils/formatAnalyticsPdfNumber';
import { isAnalyticsPdfPreviousPeriodTracked } from '@/crm-analytics/report-pdf/utils/isAnalyticsPdfPreviousPeriodTracked';
import { type AnalyticsReport } from '@/crm-analytics/types/AnalyticsApi';

// Up to this many rows always fit on one page, so the table can stay whole and join the page before it.
const MAXIMUM_ROWS_KEPT_WHOLE = 20;

const styles = StyleSheet.create({
  note: {
    color: ANALYTICS_PDF_COLOR.inkSecondary,
    fontSize: ANALYTICS_PDF_FONT_SIZE.axis,
    lineHeight: 1.3,
    marginBottom: 10,
    marginTop: 2,
  },
});

type AnalyticsPdfComparisonSectionProps = {
  report: AnalyticsReport;
};

export const AnalyticsPdfComparisonSection = ({
  report,
}: AnalyticsPdfComparisonSectionProps) => {
  const rows = buildAnalyticsPdfComparisonRows(report);
  const minimumSample = formatAnalyticsPdfNumber(report.minimumSample);

  if (rows.length === 0) {
    return (
      <AnalyticsPdfSection
        name={t`Comparison`}
        question={t`How does this period compare?`}
        startsNewPage={false}
        isCompact
      >
        <AnalyticsPdfNoData line={t`There is nothing to compare yet.`} />
      </AnalyticsPdfSection>
    );
  }

  const isKeptWhole = rows.length <= MAXIMUM_ROWS_KEPT_WHOLE;

  const section = (
    <AnalyticsPdfSection
      name={t`Comparison`}
      question={t`How does this period compare?`}
      startsNewPage={!isKeptWhole}
      hasGapBefore={false}
    >
      <AnalyticsPdfText style={styles.note}>
        {isAnalyticsPdfPreviousPeriodTracked(report)
          ? t`Counts inside each period, by event date. A row is marked when the change is significant and both counts are at least ${minimumSample}.`
          : t`Counts inside this period, by event date. There is no earlier period to compare with yet.`}
      </AnalyticsPdfText>
      <AnalyticsPdfComparisonTable rows={rows} hasMarks />
    </AnalyticsPdfSection>
  );

  return isKeptWhole ? (
    <>
      <AnalyticsPdfBlockGap />
      <View wrap={false}>{section}</View>
    </>
  ) : (
    section
  );
};
