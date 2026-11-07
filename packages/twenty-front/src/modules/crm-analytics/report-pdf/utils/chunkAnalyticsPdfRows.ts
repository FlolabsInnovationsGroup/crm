import { ANALYTICS_PDF_MAXIMUM_ROWS_PER_BLOCK } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfMaximumRowsPerBlock';

// A chart block never splits, so a very long chart has to become several blocks.
export const chunkAnalyticsPdfRows = <TRow>(rows: TRow[]): TRow[][] =>
  Array.from(
    { length: Math.ceil(rows.length / ANALYTICS_PDF_MAXIMUM_ROWS_PER_BLOCK) },
    (_, chunkIndex) =>
      rows.slice(
        chunkIndex * ANALYTICS_PDF_MAXIMUM_ROWS_PER_BLOCK,
        (chunkIndex + 1) * ANALYTICS_PDF_MAXIMUM_ROWS_PER_BLOCK,
      ),
  );
