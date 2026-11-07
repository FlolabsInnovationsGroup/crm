import { Text } from '@react-pdf/renderer';

import { ANALYTICS_PDF_COLOR } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfColor';
import { ANALYTICS_PDF_FONT } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfFont';
import { ANALYTICS_PDF_FONT_SIZE } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfFontSize';
import { toAnalyticsPdfPrintableText } from '@/crm-analytics/report-pdf/utils/toAnalyticsPdfPrintableText';

const CAP_HEIGHT_SHARE = 0.36;

// SVG text sits on its baseline, so centering on a mark means dropping it by about half the cap height.
export const getAnalyticsPdfBaseline = (centerY: number, fontSize: number) =>
  centerY + fontSize * CAP_HEIGHT_SHARE;

type AnalyticsPdfSvgTextProps = {
  x: number;
  y: number;
  text: string;
  fontSize?: number;
  color?: string;
  isBold?: boolean;
  anchor?: 'start' | 'middle' | 'end';
};

export const AnalyticsPdfSvgText = ({
  x,
  y,
  text,
  fontSize = ANALYTICS_PDF_FONT_SIZE.label,
  color = ANALYTICS_PDF_COLOR.ink,
  isBold = false,
  anchor = 'start',
}: AnalyticsPdfSvgTextProps) => (
  <Text
    x={x}
    y={y}
    fill={color}
    textAnchor={anchor}
    style={{
      fontFamily: isBold ? ANALYTICS_PDF_FONT.bold : ANALYTICS_PDF_FONT.regular,
      fontSize,
    }}
  >
    {toAnalyticsPdfPrintableText(text)}
  </Text>
);
