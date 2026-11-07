import { t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';

import {
  type AnalyticsReport,
  type AnalyticsReportComparison,
} from '@/crm-analytics/types/AnalyticsApi';

const NEW_APPLICATIONS_METRIC_KEY = 'NEW_APPLICATIONS';
const ENTERED_METRIC_KEY_PREFIX = 'ENTERED_';

// The stored label is frozen English, so known measures translate by key and fall back to it.
export const getAnalyticsPdfComparisonLabel = (
  { metricKey, label }: AnalyticsReportComparison,
  movement: AnalyticsReport['movement'],
) => {
  if (metricKey === NEW_APPLICATIONS_METRIC_KEY) {
    return t`New applications`;
  }

  const stageLabel = movement.find(
    ({ stageKey }) => `${ENTERED_METRIC_KEY_PREFIX}${stageKey}` === metricKey,
  )?.label;

  return isDefined(stageLabel) ? t`Entered ${stageLabel}` : label;
};
