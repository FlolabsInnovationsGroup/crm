import { t } from '@lingui/core/macro';

import { AnalyticsPdfLegend } from '@/crm-analytics/report-pdf/charts/AnalyticsPdfLegend';
import { ANALYTICS_PDF_COLOR } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfColor';

export const AnalyticsPdfActiveLegend = () => (
  <AnalyticsPdfLegend
    items={[
      {
        key: 'ACTIVE',
        label: t`Active`,
        color: ANALYTICS_PDF_COLOR.accent,
      },
      {
        key: 'NOT_ACTIVE',
        label: t`Not active`,
        color: ANALYTICS_PDF_COLOR.neutralSoft,
      },
    ]}
  />
);
