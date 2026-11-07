import { StyleSheet, View } from '@react-pdf/renderer';
import { isDefined } from 'twenty-shared/utils';

import { AnalyticsPdfBlockGap } from '@/crm-analytics/report-pdf/components/AnalyticsPdfBlockGap';
import { AnalyticsPdfText } from '@/crm-analytics/report-pdf/components/AnalyticsPdfText';
import { ANALYTICS_PDF_COLOR } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfColor';
import { ANALYTICS_PDF_FONT } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfFont';
import { ANALYTICS_PDF_FONT_SIZE } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfFontSize';

const styles = StyleSheet.create({
  block: {
    marginTop: 4,
  },
  line: {
    color: ANALYTICS_PDF_COLOR.inkSecondary,
    fontSize: ANALYTICS_PDF_FONT_SIZE.label,
    lineHeight: 1.3,
  },
  title: {
    color: ANALYTICS_PDF_COLOR.ink,
    fontFamily: ANALYTICS_PDF_FONT.bold,
    fontSize: ANALYTICS_PDF_FONT_SIZE.chartTitle,
    marginBottom: 3,
  },
});

type AnalyticsPdfNoDataProps = {
  title?: string;
  line: string;
  width?: number;
  isInPair?: boolean;
};

// With a title it stands in for a chart, so it keeps the gap a chart would have.
export const AnalyticsPdfNoData = ({
  title,
  line,
  width,
  isInPair = false,
}: AnalyticsPdfNoDataProps) => (
  <>
    {isDefined(title) && !isInPair && <AnalyticsPdfBlockGap />}
    <View wrap={false} style={[styles.block, { width }]}>
      {isDefined(title) && (
        <AnalyticsPdfText style={styles.title}>{title}</AnalyticsPdfText>
      )}
      <AnalyticsPdfText style={styles.line}>{line}</AnalyticsPdfText>
    </View>
  </>
);
