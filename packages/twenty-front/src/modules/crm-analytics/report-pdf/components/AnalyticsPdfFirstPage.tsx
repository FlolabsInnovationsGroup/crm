import { i18n } from '@lingui/core';
import { t } from '@lingui/core/macro';
import { StyleSheet, View } from '@react-pdf/renderer';

import { AnalyticsPdfComparisonTable } from '@/crm-analytics/report-pdf/components/AnalyticsPdfComparisonTable';
import { AnalyticsPdfText } from '@/crm-analytics/report-pdf/components/AnalyticsPdfText';
import { ANALYTICS_PDF_COLOR } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfColor';
import { ANALYTICS_PDF_FONT } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfFont';
import { ANALYTICS_PDF_FONT_SIZE } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfFontSize';
import { buildAnalyticsPdfAnswers } from '@/crm-analytics/report-pdf/utils/buildAnalyticsPdfAnswers';
import { buildAnalyticsPdfComparisonRows } from '@/crm-analytics/report-pdf/utils/buildAnalyticsPdfComparisonRows';
import { buildAnalyticsPdfKeyFigures } from '@/crm-analytics/report-pdf/utils/buildAnalyticsPdfKeyFigures';
import { formatAnalyticsPdfNumber } from '@/crm-analytics/report-pdf/utils/formatAnalyticsPdfNumber';
import { isAnalyticsPdfPreviousPeriodTracked } from '@/crm-analytics/report-pdf/utils/isAnalyticsPdfPreviousPeriodTracked';
import { type AnalyticsReport } from '@/crm-analytics/types/AnalyticsApi';
import { formatAnalyticsReportPeriod } from '@/crm-analytics/utils/formatAnalyticsReportPeriod';

const styles = StyleSheet.create({
  answer: {
    color: ANALYTICS_PDF_COLOR.ink,
    flexBasis: 0,
    flexGrow: 1,
    fontSize: ANALYTICS_PDF_FONT_SIZE.body,
    lineHeight: 1.35,
  },
  answerRow: {
    borderTopColor: ANALYTICS_PDF_COLOR.hairline,
    borderTopWidth: 0.75,
    flexDirection: 'row',
    paddingVertical: 8.5,
  },
  blockTitle: {
    color: ANALYTICS_PDF_COLOR.ink,
    fontFamily: ANALYTICS_PDF_FONT.bold,
    fontSize: ANALYTICS_PDF_FONT_SIZE.chartTitle,
    marginBottom: 6,
  },
  figure: {
    borderColor: ANALYTICS_PDF_COLOR.hairline,
    borderRadius: 4,
    borderWidth: 0.75,
    flexBasis: 0,
    flexGrow: 1,
    padding: 11,
  },
  figureDetail: {
    color: ANALYTICS_PDF_COLOR.inkSecondary,
    fontSize: ANALYTICS_PDF_FONT_SIZE.note,
    lineHeight: 1.3,
  },
  figureLabel: {
    color: ANALYTICS_PDF_COLOR.inkSecondary,
    fontSize: ANALYTICS_PDF_FONT_SIZE.label,
    marginBottom: 5,
  },
  figureValue: {
    color: ANALYTICS_PDF_COLOR.ink,
    fontFamily: ANALYTICS_PDF_FONT.bold,
    fontSize: ANALYTICS_PDF_FONT_SIZE.figure,
    marginBottom: 5,
  },
  figureValueLighter: {
    color: ANALYTICS_PDF_COLOR.inkMuted,
  },
  figures: {
    columnGap: 8,
    flexDirection: 'row',
    marginBottom: 24,
  },
  meta: {
    color: ANALYTICS_PDF_COLOR.inkSecondary,
    fontSize: ANALYTICS_PDF_FONT_SIZE.label,
    lineHeight: 1.4,
  },
  metaBlock: {
    marginBottom: 18,
  },
  moreChanges: {
    color: ANALYTICS_PDF_COLOR.inkSecondary,
    fontSize: ANALYTICS_PDF_FONT_SIZE.label,
    marginTop: 6,
  },
  notice: {
    backgroundColor: ANALYTICS_PDF_COLOR.panel,
    borderRadius: 4,
    color: ANALYTICS_PDF_COLOR.ink,
    fontSize: ANALYTICS_PDF_FONT_SIZE.label,
    marginBottom: 16,
    padding: 8,
  },
  plainLine: {
    color: ANALYTICS_PDF_COLOR.inkSecondary,
    fontSize: ANALYTICS_PDF_FONT_SIZE.body,
  },
  period: {
    color: ANALYTICS_PDF_COLOR.inkSecondary,
    fontSize: ANALYTICS_PDF_FONT_SIZE.sectionTitle,
    marginBottom: 10,
  },
  question: {
    color: ANALYTICS_PDF_COLOR.inkSecondary,
    fontSize: ANALYTICS_PDF_FONT_SIZE.label,
    lineHeight: 1.45,
    paddingRight: 10,
    width: 150,
  },
  readingNote: {
    color: ANALYTICS_PDF_COLOR.inkSecondary,
    fontSize: ANALYTICS_PDF_FONT_SIZE.axis,
    lineHeight: 1.3,
  },
  section: {
    marginBottom: 20,
  },
  title: {
    color: ANALYTICS_PDF_COLOR.ink,
    fontFamily: ANALYTICS_PDF_FONT.bold,
    fontSize: ANALYTICS_PDF_FONT_SIZE.reportTitle,
    marginBottom: 4,
  },
});

// More than this would push the first page over onto a second one. The last page has them all.
const MAXIMUM_SIGNIFICANT_ROWS = 8;

type AnalyticsPdfFirstPageProps = {
  report: AnalyticsReport;
  generatedAt: string;
};

export const AnalyticsPdfFirstPage = ({
  report,
  generatedAt,
}: AnalyticsPdfFirstPageProps) => {
  const reportPeriod = formatAnalyticsReportPeriod(report);
  const trackingStartedOn = i18n.date(new Date(report.trackingStartedAt), {
    dateStyle: 'medium',
    timeZone: report.reportingTimeZone,
  });
  const isPreviousPeriodTracked = isAnalyticsPdfPreviousPeriodTracked(report);
  const significantRows = buildAnalyticsPdfComparisonRows(report).filter(
    ({ isSignificant }) => isSignificant,
  );
  const hiddenSignificantCount = formatAnalyticsPdfNumber(
    significantRows.length - MAXIMUM_SIGNIFICANT_ROWS,
  );

  return (
    <View>
      <AnalyticsPdfText style={styles.title}>
        {report.periodType === 'MONTH'
          ? t`Monthly analytics report`
          : t`Weekly analytics report`}
      </AnalyticsPdfText>
      <AnalyticsPdfText style={styles.period}>{reportPeriod}</AnalyticsPdfText>
      <View style={styles.metaBlock}>
        <AnalyticsPdfText style={styles.meta}>
          {report.isProvisional === true
            ? t`Generated ${generatedAt}.`
            : t`Generated ${generatedAt}. It stays as generated; corrections appear in the next report.`}
        </AnalyticsPdfText>
        <AnalyticsPdfText style={styles.meta}>
          {t`Tracking started ${trackingStartedOn}. Imported people count in current totals and stage moves, never in rates.`}
        </AnalyticsPdfText>
      </View>
      {report.isProvisional === true && (
        <AnalyticsPdfText style={styles.notice}>
          {t`Built on provisional definitions. It will be rebuilt once they are confirmed.`}
        </AnalyticsPdfText>
      )}
      <View style={styles.figures}>
        {buildAnalyticsPdfKeyFigures(report).map(
          ({ key, label, value, detail, isLighter }) => (
            <View key={key} style={styles.figure}>
              <AnalyticsPdfText style={styles.figureLabel}>
                {label}
              </AnalyticsPdfText>
              <AnalyticsPdfText
                style={
                  isLighter
                    ? [styles.figureValue, styles.figureValueLighter]
                    : styles.figureValue
                }
              >
                {value}
              </AnalyticsPdfText>
              <AnalyticsPdfText style={styles.figureDetail}>
                {detail}
              </AnalyticsPdfText>
            </View>
          ),
        )}
      </View>
      <View style={styles.section}>
        <AnalyticsPdfText style={styles.blockTitle}>
          {t`Plain answers`}
        </AnalyticsPdfText>
        {buildAnalyticsPdfAnswers(report).map(({ key, question, answer }) => (
          <View key={key} wrap={false} style={styles.answerRow}>
            <AnalyticsPdfText style={styles.question}>
              {question}
            </AnalyticsPdfText>
            <AnalyticsPdfText style={styles.answer}>{answer}</AnalyticsPdfText>
          </View>
        ))}
      </View>
      <View style={styles.section}>
        <AnalyticsPdfText style={styles.blockTitle}>
          {t`Significant changes against the previous period`}
        </AnalyticsPdfText>
        {!isPreviousPeriodTracked && (
          <AnalyticsPdfText style={styles.plainLine}>
            {t`There is no earlier period to compare with yet.`}
          </AnalyticsPdfText>
        )}
        {isPreviousPeriodTracked && significantRows.length === 0 && (
          <AnalyticsPdfText style={styles.plainLine}>
            {t`No significant changes.`}
          </AnalyticsPdfText>
        )}
        {significantRows.length > 0 && (
          <AnalyticsPdfComparisonTable
            rows={significantRows.slice(0, MAXIMUM_SIGNIFICANT_ROWS)}
            hasMarks={false}
          />
        )}
        {significantRows.length > MAXIMUM_SIGNIFICANT_ROWS && (
          <AnalyticsPdfText style={styles.moreChanges}>
            {t`And ${hiddenSignificantCount} more in the comparison on the last page.`}
          </AnalyticsPdfText>
        )}
      </View>
      <AnalyticsPdfText style={styles.readingNote}>
        {t`Reports hold counts only, never names. A dash means not enough data. Small groups, shown with their count, and rates still in progress print lighter, dotted on lines and gray in heatmaps.`}
      </AnalyticsPdfText>
    </View>
  );
};
