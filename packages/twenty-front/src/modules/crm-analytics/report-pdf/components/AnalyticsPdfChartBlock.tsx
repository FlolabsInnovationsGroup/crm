import { StyleSheet, View } from '@react-pdf/renderer';
import { type ReactNode } from 'react';

import { AnalyticsPdfBlockGap } from '@/crm-analytics/report-pdf/components/AnalyticsPdfBlockGap';
import { AnalyticsPdfText } from '@/crm-analytics/report-pdf/components/AnalyticsPdfText';
import { ANALYTICS_PDF_COLOR } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfColor';
import { ANALYTICS_PDF_FONT } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfFont';
import { ANALYTICS_PDF_FONT_SIZE } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfFontSize';
import { ANALYTICS_PDF_PAGE_LAYOUT } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfPageLayout';

const styles = StyleSheet.create({
  note: {
    color: ANALYTICS_PDF_COLOR.inkSecondary,
    fontSize: ANALYTICS_PDF_FONT_SIZE.axis,
    lineHeight: 1.25,
    marginBottom: 5,
  },
  pair: {
    columnGap: ANALYTICS_PDF_PAGE_LAYOUT.columnGap,
    flexDirection: 'row',
  },
  title: {
    color: ANALYTICS_PDF_COLOR.ink,
    fontFamily: ANALYTICS_PDF_FONT.bold,
    fontSize: ANALYTICS_PDF_FONT_SIZE.chartTitle,
    marginBottom: 2,
  },
});

type AnalyticsPdfChartBlockProps = {
  title: string;
  note: string;
  width?: number;
  // Two side by side keep their charts level even when one note runs to a second line.
  noteMinimumHeight?: number;
  isInPair?: boolean;
  legend?: ReactNode;
  children: ReactNode;
};

// Never wraps, so a chart is never split across two pages.
export const AnalyticsPdfChartBlock = ({
  title,
  note,
  width = ANALYTICS_PDF_PAGE_LAYOUT.contentWidth,
  noteMinimumHeight,
  isInPair = false,
  legend,
  children,
}: AnalyticsPdfChartBlockProps) => (
  <>
    {!isInPair && <AnalyticsPdfBlockGap />}
    <View wrap={false} style={{ width }}>
      <AnalyticsPdfText style={styles.title}>{title}</AnalyticsPdfText>
      <View style={{ minHeight: noteMinimumHeight }}>
        <AnalyticsPdfText style={styles.note}>{note}</AnalyticsPdfText>
      </View>
      {legend}
      {children}
    </View>
  </>
);

type AnalyticsPdfChartPairProps = {
  children: ReactNode;
};

export const AnalyticsPdfChartPair = ({
  children,
}: AnalyticsPdfChartPairProps) => (
  <>
    <AnalyticsPdfBlockGap />
    <View wrap={false} style={styles.pair}>
      {children}
    </View>
  </>
);
