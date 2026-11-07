import {
  type AnalyticsPdfHeatmapColumn,
  type AnalyticsPdfHeatmapRow,
} from '@/crm-analytics/report-pdf/charts/AnalyticsPdfHeatmap';
import { chunkAnalyticsPdfRows } from '@/crm-analytics/report-pdf/utils/chunkAnalyticsPdfRows';

// Past this, column headers no longer fit a word like Agreement.
const MAXIMUM_COLUMNS_PER_BLOCK = 9;

type SplitAnalyticsPdfHeatmapArgs = {
  columns: AnalyticsPdfHeatmapColumn[];
  rows: AnalyticsPdfHeatmapRow[];
};

// Blocks hold equal numbers of columns, so a last column is never left alone.
export const splitAnalyticsPdfHeatmap = ({
  columns,
  rows,
}: SplitAnalyticsPdfHeatmapArgs): SplitAnalyticsPdfHeatmapArgs[] => {
  const blockCount = Math.ceil(columns.length / MAXIMUM_COLUMNS_PER_BLOCK);
  const columnsPerBlock = Math.ceil(columns.length / blockCount);

  return chunkAnalyticsPdfRows(rows).flatMap((rowChunk) =>
    Array.from({ length: blockCount }, (_, blockIndex) => {
      const start = blockIndex * columnsPerBlock;
      const end = start + columnsPerBlock;

      return {
        columns: columns.slice(start, end),
        rows: rowChunk.map((row) => ({
          ...row,
          cells: row.cells.slice(start, end),
        })),
      };
    }),
  );
};
