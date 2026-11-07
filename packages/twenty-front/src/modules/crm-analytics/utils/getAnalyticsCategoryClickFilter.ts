import { isDefined } from 'twenty-shared/utils';

import {
  type AnalyticsCategoryGroupBy,
  type AnalyticsCategoryRow,
  type AnalyticsFilter,
} from '@/crm-analytics/types/AnalyticsApi';

const toggleKey = (key: string, currentKey: string | null) =>
  key === currentKey ? null : key;

export const getAnalyticsCategoryClickFilter = (
  row: Pick<AnalyticsCategoryRow, 'key' | 'parentKey'>,
  groupBy: AnalyticsCategoryGroupBy,
  filter: AnalyticsFilter,
): AnalyticsFilter => {
  if (groupBy === 'SOURCE') {
    return { ...filter, sourceKey: toggleKey(row.key, filter.sourceKey) };
  }

  if (isDefined(row.parentKey)) {
    return row.key === filter.programKey
      ? { ...filter, programKey: null }
      : { ...filter, trackKey: row.parentKey, programKey: row.key };
  }

  return {
    ...filter,
    trackKey: toggleKey(row.key, filter.trackKey),
    programKey: null,
  };
};
