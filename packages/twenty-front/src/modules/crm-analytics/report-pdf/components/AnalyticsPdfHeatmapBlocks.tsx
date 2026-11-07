import { isDefined } from 'twenty-shared/utils';

import {
  AnalyticsPdfHeatmap,
  type AnalyticsPdfHeatmapColumn,
  type AnalyticsPdfHeatmapRow,
} from '@/crm-analytics/report-pdf/charts/AnalyticsPdfHeatmap';
import { AnalyticsPdfHeatmapKey } from '@/crm-analytics/report-pdf/charts/AnalyticsPdfHeatmapKey';
import { AnalyticsPdfChartBlock } from '@/crm-analytics/report-pdf/components/AnalyticsPdfChartBlock';
import { AnalyticsPdfNoData } from '@/crm-analytics/report-pdf/components/AnalyticsPdfNoData';
import { ANALYTICS_PDF_PAGE_LAYOUT } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfPageLayout';
import { splitAnalyticsPdfHeatmap } from '@/crm-analytics/report-pdf/utils/splitAnalyticsPdfHeatmap';

type AnalyticsPdfHeatmapBlocksProps = {
  title: string;
  continuedTitle: string;
  note: string;
  noDataLine: string;
  columns: AnalyticsPdfHeatmapColumn[];
  rows: AnalyticsPdfHeatmapRow[];
  labelWidth: number;
  rowHeight: number;
  cornerLabel?: string;
};

export const AnalyticsPdfHeatmapBlocks = ({
  title,
  continuedTitle,
  note,
  noDataLine,
  columns,
  rows,
  labelWidth,
  rowHeight,
  cornerLabel,
}: AnalyticsPdfHeatmapBlocksProps) => {
  const hasKnownRate = rows.some(({ cells }) =>
    cells.some(({ ratio }) => isDefined(ratio)),
  );

  if (!hasKnownRate) {
    return <AnalyticsPdfNoData title={title} line={noDataLine} />;
  }

  return (
    <>
      {splitAnalyticsPdfHeatmap({ columns, rows }).map((block, blockIndex) => (
        <AnalyticsPdfChartBlock
          key={blockIndex}
          title={blockIndex === 0 ? title : continuedTitle}
          note={note}
        >
          <AnalyticsPdfHeatmap
            columns={block.columns}
            rows={block.rows}
            width={ANALYTICS_PDF_PAGE_LAYOUT.contentWidth}
            labelWidth={labelWidth}
            rowHeight={rowHeight}
            cornerLabel={cornerLabel}
          />
          <AnalyticsPdfHeatmapKey />
        </AnalyticsPdfChartBlock>
      ))}
    </>
  );
};
