import { CRM_ANALYTICS_CONFIG } from 'src/modules/analytics/constants/crm-analytics-config.constant';

export const CRM_ANALYTICS_SERIES_STAGES = CRM_ANALYTICS_CONFIG.stages.filter(
  ({ kind }) => kind === 'MAIN' || kind === 'EXIT',
);
