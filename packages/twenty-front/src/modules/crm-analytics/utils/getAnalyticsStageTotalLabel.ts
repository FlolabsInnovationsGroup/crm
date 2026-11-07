import { t } from '@lingui/core/macro';

import { type AnalyticsStageTotalRow } from '@/crm-analytics/types/AnalyticsApi';

export const getAnalyticsStageTotalLabel = (row: AnalyticsStageTotalRow) => {
  switch (row.rowKind) {
    case 'UNMAPPED': {
      const rawValue = row.label;

      return t`Unmapped: ${rawValue}`;
    }
    case 'NO_STAGE':
      return t`No stage`;
    default:
      return row.label;
  }
};
