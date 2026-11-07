import { t } from '@lingui/core/macro';
import { StyleSheet, Text, View } from '@react-pdf/renderer';

import { ANALYTICS_PDF_COLOR } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfColor';
import { ANALYTICS_PDF_FONT } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfFont';
import { ANALYTICS_PDF_FONT_SIZE } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfFontSize';
import { ANALYTICS_PDF_PAGE_LAYOUT } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfPageLayout';
import { toAnalyticsPdfPrintableText } from '@/crm-analytics/report-pdf/utils/toAnalyticsPdfPrintableText';

const styles = StyleSheet.create({
  footer: {
    bottom: ANALYTICS_PDF_PAGE_LAYOUT.runningTextOffset,
    flexDirection: 'row',
    justifyContent: 'space-between',
    left: ANALYTICS_PDF_PAGE_LAYOUT.horizontalMargin,
    position: 'absolute',
    right: ANALYTICS_PDF_PAGE_LAYOUT.horizontalMargin,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    left: ANALYTICS_PDF_PAGE_LAYOUT.horizontalMargin,
    position: 'absolute',
    right: ANALYTICS_PDF_PAGE_LAYOUT.horizontalMargin,
    top: ANALYTICS_PDF_PAGE_LAYOUT.runningTextOffset,
  },
  runningBrand: {
    color: ANALYTICS_PDF_COLOR.inkMuted,
    fontSize: ANALYTICS_PDF_FONT_SIZE.axis,
  },
  runningTitle: {
    color: ANALYTICS_PDF_COLOR.ink,
    fontFamily: ANALYTICS_PDF_FONT.bold,
    fontSize: ANALYTICS_PDF_FONT_SIZE.axis,
  },
  runningFooter: {
    color: ANALYTICS_PDF_COLOR.inkSecondary,
    fontSize: ANALYTICS_PDF_FONT_SIZE.axis,
  },
});

type AnalyticsPdfPageFrameProps = {
  title: string;
  generatedAt: string;
};

export const AnalyticsPdfPageFrame = ({
  title,
  generatedAt,
}: AnalyticsPdfPageFrameProps) => (
  <>
    <View fixed style={styles.header}>
      <Text style={styles.runningTitle}>
        {toAnalyticsPdfPrintableText(title)}
      </Text>
      <Text style={styles.runningBrand}>
        {toAnalyticsPdfPrintableText(t`FloLabs analytics`)}
      </Text>
    </View>
    <View fixed style={styles.footer}>
      <Text style={styles.runningFooter}>
        {toAnalyticsPdfPrintableText(t`Generated ${generatedAt}`)}
      </Text>
      <Text
        style={styles.runningFooter}
        render={({ pageNumber, totalPages }) =>
          toAnalyticsPdfPrintableText(t`Page ${pageNumber} of ${totalPages}`)
        }
      />
    </View>
  </>
);
