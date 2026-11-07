import { isDefined } from 'twenty-shared/utils';

import {
  type AnalyticsPdfHeatmapColumn,
  type AnalyticsPdfHeatmapRow,
} from '@/crm-analytics/report-pdf/charts/AnalyticsPdfHeatmap';
import { describeAnalyticsPdfRate } from '@/crm-analytics/report-pdf/utils/describeAnalyticsPdfRate';
import { getAnalyticsPdfCategoryLabel } from '@/crm-analytics/report-pdf/utils/getAnalyticsPdfCategoryLabel';
import {
  type AnalyticsCategoryRow,
  type AnalyticsReport,
} from '@/crm-analytics/types/AnalyticsApi';

// The last funnel stage has no next stage, so it is not a step anyone can move on from.
export const getAnalyticsPdfStepColumns = (
  report: AnalyticsReport,
): AnalyticsPdfHeatmapColumn[] => {
  const { funnel, categories } = report;
  const lastStageKey = funnel.rows[funnel.rows.length - 1]?.stageKey;

  return categories.stepStageKeys
    .filter((stageKey) => stageKey !== lastStageKey)
    .map((stageKey) => ({
      key: stageKey,
      label:
        funnel.rows.find((row) => row.stageKey === stageKey)?.label ?? stageKey,
    }));
};

export const buildAnalyticsPdfStepHeatmapRow = (
  row: AnalyticsCategoryRow,
  report: AnalyticsReport,
): AnalyticsPdfHeatmapRow => ({
  key: row.key,
  label: getAnalyticsPdfCategoryLabel(row, report.categories.groupBy),
  cells: getAnalyticsPdfStepColumns(report).map((column) => {
    const stepRate = row.stepRates.find(
      ({ stageKey }) => stageKey === column.key,
    );

    return describeAnalyticsPdfRate({
      rate: stepRate?.rate ?? null,
      soFarRate: stepRate?.soFarRate,
      sampleSize: isDefined(stepRate) ? stepRate.eligible : null,
      minimumSample: report.minimumSample,
    });
  }),
});
