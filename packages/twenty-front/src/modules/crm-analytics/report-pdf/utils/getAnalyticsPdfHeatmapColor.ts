import { ANALYTICS_PDF_COLOR } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfColor';
import { ANALYTICS_PDF_HEATMAP_RAMP } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfHeatmapRamp';
import { type AnalyticsPdfRate } from '@/crm-analytics/report-pdf/types/AnalyticsPdfRate';

const LAST_STEP_INDEX = ANALYTICS_PDF_HEATMAP_RAMP.length - 1;

type AnalyticsPdfHeatmapColor = { fill: string; text: string };

export const getAnalyticsPdfHeatmapColor = ({
  ratio,
  isLighter,
}: Pick<AnalyticsPdfRate, 'ratio' | 'isLighter'>): AnalyticsPdfHeatmapColor => {
  if (ratio === null) {
    return {
      fill: ANALYTICS_PDF_COLOR.panel,
      text: ANALYTICS_PDF_COLOR.inkSecondary,
    };
  }

  // Stays off the ramp, so a color only ever means a rate and pale can only mean low.
  if (isLighter) {
    return {
      fill: ANALYTICS_PDF_COLOR.uncertainCell,
      text: ANALYTICS_PDF_COLOR.ink,
    };
  }

  const stepIndex = Math.min(
    Math.floor(Math.max(ratio, 0) * ANALYTICS_PDF_HEATMAP_RAMP.length),
    LAST_STEP_INDEX,
  );

  return ANALYTICS_PDF_HEATMAP_RAMP[stepIndex];
};
