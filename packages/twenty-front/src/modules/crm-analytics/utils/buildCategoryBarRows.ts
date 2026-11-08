import { t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';

import { type AnalyticsHorizontalBarRow } from '@/crm-analytics/charts/AnalyticsHorizontalBarChart';
import {
  type AnalyticsCategories,
  type AnalyticsCategoryRow,
} from '@/crm-analytics/types/AnalyticsApi';
import { getAnalyticsCategoryLabel } from '@/crm-analytics/utils/getAnalyticsCategoryLabel';
import { isAnalyticsCatchAllRow } from '@/crm-analytics/utils/isAnalyticsCatchAllRow';

const MAXIMUM_CATCH_ALL_ROWS = 3;

type BuildCategoryBarRowsArgs = {
  categories: AnalyticsCategories;
  // Keeps only the largest. Without it every group stays, even an empty one.
  maximumRows?: number;
  formatNumber: (value: number) => string;
};

export const buildCategoryBarRows = ({
  categories: { rows, groupBy },
  maximumRows,
  formatNumber,
}: BuildCategoryBarRowsArgs) => {
  const buildRow = (row: AnalyticsCategoryRow): AnalyticsHorizontalBarRow => ({
    key: row.key,
    label: getAnalyticsCategoryLabel(row, groupBy),
    segments: [{ key: 'people', label: t`People`, value: row.people }],
    tooltip: {
      title: getAnalyticsCategoryLabel(row, groupBy),
      rows: [
        { label: t`People`, value: formatNumber(row.people) },
        { label: t`Active people`, value: formatNumber(row.activePeople) },
        ...(isDefined(row.newApplications)
          ? [
              {
                label: t`New applications`,
                value: formatNumber(row.newApplications),
              },
            ]
          : []),
      ],
    },
  });

  const rankedRows = rows
    .filter(({ parentKey }) => !isDefined(parentKey))
    .sort((firstRow, secondRow) => secondRow.people - firstRow.people);

  const namedRows = rankedRows.filter((row) => !isAnalyticsCatchAllRow(row));

  return {
    mainRows: (isDefined(maximumRows)
      ? namedRows.filter(({ people }) => people > 0).slice(0, maximumRows)
      : namedRows
    ).map(buildRow),
    catchAllRows: rankedRows
      .filter((row) => isAnalyticsCatchAllRow(row) && row.people > 0)
      .slice(0, MAXIMUM_CATCH_ALL_ROWS)
      .map(buildRow),
  };
};
