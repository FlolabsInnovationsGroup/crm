import { t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';

import {
  type AnalyticsCategoryGroupBy,
  type AnalyticsCategoryRow,
} from '@/crm-analytics/types/AnalyticsApi';

const NO_VALUE_CATEGORY_KEY = 'NONE';
const UNMAPPED_CATEGORY_KEY = 'UNMAPPED';

// The server's label for these rows is stored English, so they translate by their stable key.
export const getAnalyticsCategoryLabel = (
  row: AnalyticsCategoryRow,
  groupBy: AnalyticsCategoryGroupBy,
) => {
  if (!isDefined(row.parentKey) && row.key === NO_VALUE_CATEGORY_KEY) {
    return groupBy === 'SOURCE' ? t`No source` : t`No position`;
  }

  if (
    groupBy === 'TRACK_PROGRAM' &&
    !isDefined(row.parentKey) &&
    row.key === UNMAPPED_CATEGORY_KEY
  ) {
    return t`Unmapped`;
  }

  if (!row.isUnmapped) {
    return row.label;
  }

  const rawValue = row.label;

  return t`Unmapped: ${rawValue}`;
};
