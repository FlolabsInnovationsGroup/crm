import {
  AnalyticsPdfSvgText,
  getAnalyticsPdfBaseline,
} from '@/crm-analytics/report-pdf/charts/AnalyticsPdfSvgText';
import { ANALYTICS_PDF_COLOR } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfColor';
import { ANALYTICS_PDF_FONT_SIZE } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfFontSize';
import { wrapAnalyticsPdfLabel } from '@/crm-analytics/report-pdf/utils/fitAnalyticsPdfLabel';

const LINE_HEIGHT_RATIO = 1.16;

type AnalyticsPdfSvgLabelProps = {
  x: number;
  centerY: number;
  text: string;
  maximumWidth: number;
  maximumLines?: number;
  fontSize?: number;
  color?: string;
  isBold?: boolean;
  anchor?: 'start' | 'middle' | 'end';
};

export const AnalyticsPdfSvgLabel = ({
  x,
  centerY,
  text,
  maximumWidth,
  maximumLines = 2,
  fontSize = ANALYTICS_PDF_FONT_SIZE.label,
  color = ANALYTICS_PDF_COLOR.ink,
  isBold = false,
  anchor = 'start',
}: AnalyticsPdfSvgLabelProps) => {
  const lines = wrapAnalyticsPdfLabel({
    text,
    maximumWidth,
    fontSize,
    isBold,
    maximumLines,
  });
  const lineHeight = fontSize * LINE_HEIGHT_RATIO;
  const firstLineCenterY = centerY - ((lines.length - 1) * lineHeight) / 2;

  return (
    <>
      {lines.map((line, lineIndex) => (
        <AnalyticsPdfSvgText
          key={lineIndex}
          x={x}
          y={getAnalyticsPdfBaseline(
            firstLineCenterY + lineIndex * lineHeight,
            fontSize,
          )}
          text={line}
          fontSize={fontSize}
          color={color}
          isBold={isBold}
          anchor={anchor}
        />
      ))}
    </>
  );
};
