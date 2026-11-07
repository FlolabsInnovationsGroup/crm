import { plural, t } from '@lingui/core/macro';

import { type AnalyticsOverview } from '@/crm-analytics/types/AnalyticsApi';
import { countAnalyticsUnmappedPeople } from '@/crm-analytics/utils/countAnalyticsUnmappedPeople';

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
  const stuck = formatNumber(stuckPeople);

  const activeSentence = overview.stuck.hasLimits
    ? t`${activeSentencePart}, ${stuck} past their stage limit.`
    : t`${activeSentencePart}. No stage limits are set.`;

  const unmappedPeople = countAnalyticsUnmappedPeople(overview.stageTotals);

  if (unmappedPeople === 0) {
    return activeSentence;
  }

  const unmapped = formatNumber(unmappedPeople);
  const unmappedSentence = plural(unmappedPeople, {
    one: `${unmapped} person has a stage not yet mapped and is not counted as active or past their limit.`,
    other: `${unmapped} people have a stage not yet mapped and are not counted as active or past their limit.`,
  });

  return `${activeSentence} ${unmappedSentence}`;
};
