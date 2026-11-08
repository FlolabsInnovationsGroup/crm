import { t } from '@lingui/core/macro';
import { StyleSheet, View } from '@react-pdf/renderer';
import { isDefined } from 'twenty-shared/utils';

import { AnalyticsPdfText } from '@/crm-analytics/report-pdf/components/AnalyticsPdfText';
import { ANALYTICS_PDF_COLOR } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfColor';
import { ANALYTICS_PDF_FONT } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfFont';
import { ANALYTICS_PDF_FONT_SIZE } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfFontSize';
import { ANALYTICS_PDF_UNKNOWN_VALUE } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfUnknownValue';
import { formatAnalyticsPdfNumber } from '@/crm-analytics/report-pdf/utils/formatAnalyticsPdfNumber';
import { formatAnalyticsSignedNumber } from '@/crm-analytics/utils/formatAnalyticsSignedNumber';

const styles = StyleSheet.create({
  bodyCell: {
    color: ANALYTICS_PDF_COLOR.ink,
    fontSize: ANALYTICS_PDF_FONT_SIZE.label,
  },
  boldCell: {
    fontFamily: ANALYTICS_PDF_FONT.bold,
  },
  headerCell: {
    color: ANALYTICS_PDF_COLOR.inkSecondary,
    fontSize: ANALYTICS_PDF_FONT_SIZE.axis,
  },
  headerRow: {
    borderBottomColor: ANALYTICS_PDF_COLOR.ink,
    borderBottomWidth: 0.75,
    flexDirection: 'row',
    paddingBottom: 4,
  },
  markCell: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingLeft: 12,
    width: 110,
  },
  markDot: {
    backgroundColor: ANALYTICS_PDF_COLOR.accent,
    borderRadius: 2,
    height: 4,
    marginRight: 4,
    width: 4,
  },
  markText: {
    color: ANALYTICS_PDF_COLOR.inkSecondary,
    fontSize: ANALYTICS_PDF_FONT_SIZE.axis,
  },
  measureCell: {
    flexGrow: 1,
    flexBasis: 0,
    paddingRight: 8,
  },
  numberCell: {
    textAlign: 'right',
    width: 62,
  },
  row: {
    alignItems: 'center',
    borderBottomColor: ANALYTICS_PDF_COLOR.hairline,
    borderBottomWidth: 0.5,
    flexDirection: 'row',
    paddingVertical: 6.5,
  },
});

export type AnalyticsPdfComparisonRow = {
  key: string;
  label: string;
  current: number | null;
  previous: number | null;
  isSignificant: boolean;
};

const formatCount = (value: number | null) =>
  isDefined(value)
    ? formatAnalyticsPdfNumber(value)
    : ANALYTICS_PDF_UNKNOWN_VALUE;

const formatChange = ({ current, previous }: AnalyticsPdfComparisonRow) =>
  isDefined(current) && isDefined(previous)
    ? formatAnalyticsSignedNumber(current - previous, formatAnalyticsPdfNumber)
    : ANALYTICS_PDF_UNKNOWN_VALUE;

type AnalyticsPdfComparisonTableProps = {
  rows: AnalyticsPdfComparisonRow[];
  hasMarks: boolean;
};

export const AnalyticsPdfComparisonTable = ({
  rows,
  hasMarks,
}: AnalyticsPdfComparisonTableProps) => (
  <View>
    <View wrap={false} style={styles.headerRow}>
      <View style={styles.measureCell}>
        <AnalyticsPdfText
          style={styles.headerCell}
        >{t`Measure`}</AnalyticsPdfText>
      </View>
      <AnalyticsPdfText style={[styles.headerCell, styles.numberCell]}>
        {t`This period`}
      </AnalyticsPdfText>
      <AnalyticsPdfText style={[styles.headerCell, styles.numberCell]}>
        {t`Previous period`}
      </AnalyticsPdfText>
      <AnalyticsPdfText style={[styles.headerCell, styles.numberCell]}>
        {t`Change`}
      </AnalyticsPdfText>
      {hasMarks && <View style={styles.markCell} />}
    </View>
    {rows.map((row) => (
      <View key={row.key} wrap={false} style={styles.row}>
        <View style={styles.measureCell}>
          <AnalyticsPdfText
            style={
              row.isSignificant
                ? [styles.bodyCell, styles.boldCell]
                : styles.bodyCell
            }
          >
            {row.label}
          </AnalyticsPdfText>
        </View>
        <AnalyticsPdfText
          style={[styles.bodyCell, styles.numberCell, styles.boldCell]}
        >
          {formatCount(row.current)}
        </AnalyticsPdfText>
        <AnalyticsPdfText style={[styles.bodyCell, styles.numberCell]}>
          {formatCount(row.previous)}
        </AnalyticsPdfText>
        <AnalyticsPdfText style={[styles.bodyCell, styles.numberCell]}>
          {formatChange(row)}
        </AnalyticsPdfText>
        {hasMarks && (
          <View style={styles.markCell}>
            {row.isSignificant && (
              <>
                <View style={styles.markDot} />
                <AnalyticsPdfText style={styles.markText}>
                  {t`Significant change`}
                </AnalyticsPdfText>
              </>
            )}
          </View>
        )}
      </View>
    ))}
  </View>
);
