import { t } from '@lingui/core/macro';
import { StyleSheet, View } from '@react-pdf/renderer';

import { AnalyticsPdfText } from '@/crm-analytics/report-pdf/components/AnalyticsPdfText';
import { ANALYTICS_PDF_COLOR } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfColor';
import { ANALYTICS_PDF_FONT_SIZE } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfFontSize';
import { ANALYTICS_PDF_HEATMAP_RAMP } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfHeatmapRamp';
import { formatAnalyticsRate } from '@/crm-analytics/utils/formatAnalyticsRate';

const styles = StyleSheet.create({
  explanation: {
    color: ANALYTICS_PDF_COLOR.inkSecondary,
    fontSize: ANALYTICS_PDF_FONT_SIZE.axis,
    marginLeft: 4,
  },
  key: {
    alignItems: 'center',
    flexDirection: 'row',
    marginTop: 4,
  },
  scaleLabel: {
    color: ANALYTICS_PDF_COLOR.inkSecondary,
    fontSize: ANALYTICS_PDF_FONT_SIZE.axis,
    marginHorizontal: 3,
  },
  swatch: {
    height: 7,
    marginRight: 1,
    width: 14,
  },
  uncertainSwatch: {
    backgroundColor: ANALYTICS_PDF_COLOR.uncertainCell,
    marginLeft: 8,
  },
});

export const AnalyticsPdfHeatmapKey = () => (
  <View style={styles.key}>
    <AnalyticsPdfText style={styles.scaleLabel}>
      {formatAnalyticsRate(0)}
    </AnalyticsPdfText>
    {ANALYTICS_PDF_HEATMAP_RAMP.map(({ fill }) => (
      <View key={fill} style={[styles.swatch, { backgroundColor: fill }]} />
    ))}
    <AnalyticsPdfText style={styles.scaleLabel}>
      {formatAnalyticsRate(1)}
    </AnalyticsPdfText>
    <View style={[styles.swatch, styles.uncertainSwatch]} />
    <AnalyticsPdfText style={styles.explanation}>
      {t`Gray: few people or still in progress. A dash: not enough data.`}
    </AnalyticsPdfText>
  </View>
);
