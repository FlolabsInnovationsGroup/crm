import { ANALYTICS_PDF_FONT_SIZE } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfFontSize';
import { estimateAnalyticsPdfTextWidth } from '@/crm-analytics/report-pdf/utils/fitAnalyticsPdfLabel';

const MINIMUM_LABEL_WIDTH = 104;
const MAXIMUM_LABEL_WIDTH = 170;
const LABEL_GAP = 8;
// Tall enough for the charts to wrap a label onto a second line.
const TWO_LINE_ROW_HEIGHT = 20;

export const getAnalyticsPdfRowLabelLayout = (
  labels: string[],
  rowHeight: number,
) => {
  // Whole points, so charts subtracting the gap get back at least the estimate despite float rounding.
  const neededWidth =
    LABEL_GAP +
    Math.ceil(
      Math.max(
        0,
        ...labels.map((label) =>
          estimateAnalyticsPdfTextWidth(label, ANALYTICS_PDF_FONT_SIZE.label),
        ),
      ),
    );

  return {
    labelWidth: Math.min(
      Math.max(neededWidth, MINIMUM_LABEL_WIDTH),
      MAXIMUM_LABEL_WIDTH,
    ),
    rowHeight:
      neededWidth > MAXIMUM_LABEL_WIDTH
        ? Math.max(rowHeight, TWO_LINE_ROW_HEIGHT)
        : rowHeight,
  };
};
