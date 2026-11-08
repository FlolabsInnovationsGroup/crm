import { StyleSheet, View } from '@react-pdf/renderer';
import { type ReactNode } from 'react';
import { isDefined } from 'twenty-shared/utils';

import { AnalyticsPdfBlockGap } from '@/crm-analytics/report-pdf/components/AnalyticsPdfBlockGap';
import { AnalyticsPdfText } from '@/crm-analytics/report-pdf/components/AnalyticsPdfText';
import { ANALYTICS_PDF_COLOR } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfColor';
import { ANALYTICS_PDF_FONT } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfFont';
import { ANALYTICS_PDF_FONT_SIZE } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfFontSize';

// Tall enough for the first chart to stay with the heading when a section starts partway down a page.
// It only works among siblings, so a section stays a fragment and its parts sit directly on the page.
const PRESENCE_AFTER_HEADING = 170;

const styles = StyleSheet.create({
  compactHeading: {
    borderTopColor: ANALYTICS_PDF_COLOR.baseline,
    borderTopWidth: 0.75,
    flexDirection: 'row',
    marginBottom: 2,
    paddingTop: 4,
  },
  compactName: {
    fontFamily: ANALYTICS_PDF_FONT.bold,
    fontSize: ANALYTICS_PDF_FONT_SIZE.chartTitle,
    marginRight: 5,
  },
  compactQuestion: {
    color: ANALYTICS_PDF_COLOR.inkSecondary,
    fontSize: ANALYTICS_PDF_FONT_SIZE.chartTitle,
  },
  heading: {
    borderTopColor: ANALYTICS_PDF_COLOR.ink,
    borderTopWidth: 1.25,
    flexDirection: 'row',
    marginBottom: 4,
    paddingTop: 6,
  },
  name: {
    fontFamily: ANALYTICS_PDF_FONT.bold,
    fontSize: ANALYTICS_PDF_FONT_SIZE.sectionTitle,
    marginRight: 7,
  },
  question: {
    color: ANALYTICS_PDF_COLOR.inkSecondary,
    fontSize: ANALYTICS_PDF_FONT_SIZE.sectionTitle,
  },
  takeaway: {
    color: ANALYTICS_PDF_COLOR.ink,
    fontSize: ANALYTICS_PDF_FONT_SIZE.body,
    lineHeight: 1.35,
  },
});

type AnalyticsPdfSectionProps = {
  name: string;
  question: string;
  takeaway?: string | null;
  startsNewPage: boolean;
  // A section with nothing to chart is one plain line, so its heading stays small too.
  isCompact?: boolean;
  hasGapBefore?: boolean;
  children: ReactNode;
};

export const AnalyticsPdfSection = ({
  name,
  question,
  takeaway,
  startsNewPage,
  isCompact = false,
  hasGapBefore = !startsNewPage,
  children,
}: AnalyticsPdfSectionProps) => (
  <>
    {hasGapBefore && <AnalyticsPdfBlockGap isSmall={isCompact} />}
    <View
      wrap={false}
      break={startsNewPage}
      minPresenceAhead={PRESENCE_AFTER_HEADING}
    >
      <View style={isCompact ? styles.compactHeading : styles.heading}>
        <AnalyticsPdfText style={isCompact ? styles.compactName : styles.name}>
          {name}
        </AnalyticsPdfText>
        <AnalyticsPdfText
          style={isCompact ? styles.compactQuestion : styles.question}
        >
          {question}
        </AnalyticsPdfText>
      </View>
      {isDefined(takeaway) && takeaway !== '' && (
        <AnalyticsPdfText style={styles.takeaway}>{takeaway}</AnalyticsPdfText>
      )}
    </View>
    {children}
  </>
);
