import { plural, t } from '@lingui/core/macro';

import { type AnalyticsOverview } from '@/crm-analytics/types/AnalyticsApi';

type BuildOverviewTakeawayArgs = {
  overview: AnalyticsOverview;
  formatNumber: (value: number) => string;
};

export const buildOverviewTakeaway = ({
  overview,
  formatNumber,
}: BuildOverviewTakeawayArgs): string => {
  const { activePeople, stuckPeople, totalContacts } = overview.figures;

  if (totalContacts === 0) {
    return t`No people match these filters.`;
  }

  const active = formatNumber(activePeople);
  const activeSentencePart = plural(activePeople, {
    one: `${active} active person`,
    other: `${active} active people`,
  });

  if (!overview.stuck.hasLimits) {
    return t`${activeSentencePart}. No stage limits are set.`;
  }

  const stuck = formatNumber(stuckPeople);

  return t`${activeSentencePart}, ${stuck} past their stage limit.`;
};
