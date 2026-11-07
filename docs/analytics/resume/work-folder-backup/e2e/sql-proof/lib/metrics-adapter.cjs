'use strict';
// The same calls the resolver makes: real filter parser, then the real service.
const FILTER_REQUEST = 'src/modules/analytics/utils/parse-crm-analytics-filter.util';

const createMetricsReader = ({ loader, services }) => {
  const metrics = () => services.get('CrmAnalyticsMetricsService');
  const parseFilter = (filter) => loader.real(FILTER_REQUEST).parseCrmAnalyticsFilter(filter);

  return {
    getOverview: (workspaceId, filter) =>
      metrics().getOverview({ workspaceId, filter: parseFilter(filter) }),
    getFunnel: (workspaceId, filter) =>
      metrics().getFunnel({ workspaceId, filter: parseFilter(filter) }),
    getCategories: (workspaceId, groupBy, filter) =>
      metrics().getCategories({ workspaceId, groupBy, filter: parseFilter(filter) }),
    getTrends: (workspaceId, metric, stageKey, filter) =>
      metrics().getTrends({ workspaceId, metric, stageKey, filter: parseFilter(filter) }),
  };
};

const getFunnel = ({ services, workspaceId }) =>
  services.get('CrmAnalyticsMetricsService').getFunnel({
    workspaceId,
    filter: {
      dateFrom: null,
      dateTo: null,
      trackKey: null,
      programKey: null,
      sourceKey: null,
      status: 'ALL',
      period: 'WEEK',
    },
  });

module.exports = { createMetricsReader, getFunnel };
