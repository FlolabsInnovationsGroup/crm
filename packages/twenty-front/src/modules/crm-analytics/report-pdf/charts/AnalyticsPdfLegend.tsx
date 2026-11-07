import { Line, StyleSheet, Svg, View } from '@react-pdf/renderer';
import { isDefined } from 'twenty-shared/utils';

import { AnalyticsPdfText } from '@/crm-analytics/report-pdf/components/AnalyticsPdfText';
import { ANALYTICS_PDF_COLOR } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfColor';
import { ANALYTICS_PDF_FONT_SIZE } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfFontSize';

const LINE_KEY_WIDTH = 16;
const LINE_KEY_HEIGHT = 4;

const styles = StyleSheet.create({
  legend: {
    columnGap: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 5,
    rowGap: 2,
  },
  lineKey: {
    marginRight: 4,
  },
  item: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  label: {
    color: ANALYTICS_PDF_COLOR.inkSecondary,
    fontSize: ANALYTICS_PDF_FONT_SIZE.axis,
  },
  swatch: {
    borderRadius: 1.5,
    height: 7,
    marginRight: 4,
    width: 7,
  },
});

export type AnalyticsPdfLegendItem = {
  key: string;
  label: string;
  color: string;
  isLine?: boolean;
  lineDash?: string;
};

type AnalyticsPdfLegendProps = {
  items: AnalyticsPdfLegendItem[];
};

export const AnalyticsPdfLegend = ({ items }: AnalyticsPdfLegendProps) => (
  <View style={styles.legend}>
    {items.map(({ key, label, color, isLine = false, lineDash }) => (
      <View key={key} style={styles.item}>
        {isLine ? (
          <Svg
            width={LINE_KEY_WIDTH}
            height={LINE_KEY_HEIGHT}
            style={styles.lineKey}
          >
            <Line
              x1={1}
              y1={LINE_KEY_HEIGHT / 2}
              x2={LINE_KEY_WIDTH - 1}
              y2={LINE_KEY_HEIGHT / 2}
              stroke={color}
              strokeWidth={1.75}
              strokeLinecap="round"
              {...(isDefined(lineDash) ? { strokeDasharray: lineDash } : {})}
            />
          </Svg>
        ) : (
          <View style={[styles.swatch, { backgroundColor: color }]} />
        )}
        <AnalyticsPdfText style={styles.label}>{label}</AnalyticsPdfText>
      </View>
    ))}
  </View>
);
