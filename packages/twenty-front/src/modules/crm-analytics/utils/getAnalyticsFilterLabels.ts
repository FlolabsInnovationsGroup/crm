import { t } from '@lingui/core/macro';

import {
  type AnalyticsMeta,
  type AnalyticsStatusFilter,
} from '@/crm-analytics/types/AnalyticsApi';

const NO_VALUE_CATEGORY_KEY = 'NONE';
const UNMAPPED_CATEGORY_KEY = 'UNMAPPED';

// A click on a chart can filter by a key the options do not list, such as NONE or a raw source value.
export const getAnalyticsTrackFilterLabel = (
  trackKey: string,
  meta: Pick<AnalyticsMeta, 'tracks'>,
) => {
  const listedLabel = meta.tracks.find(({ key }) => key === trackKey)?.label;

  if (trackKey === NO_VALUE_CATEGORY_KEY) {
    return listedLabel ?? t`No position`;
  }

  if (trackKey === UNMAPPED_CATEGORY_KEY) {
    return listedLabel ?? t`Unmapped`;
  }

  return listedLabel ?? trackKey;
};

export const getAnalyticsProgramFilterLabel = (
  programKey: string,
  meta: Pick<AnalyticsMeta, 'programs'>,
) => {
  const listedLabel = meta.programs.find(
    ({ key }) => key === programKey,
  )?.label;

  if (programKey === NO_VALUE_CATEGORY_KEY) {
    return listedLabel ?? t`No position`;
  }

  return listedLabel ?? t`Unmapped: ${programKey}`;
};

export const getAnalyticsSourceFilterLabel = (
  sourceKey: string,
  meta: Pick<AnalyticsMeta, 'sources'>,
) => {
  const listedLabel = meta.sources.find(({ key }) => key === sourceKey)?.label;

  if (sourceKey === NO_VALUE_CATEGORY_KEY) {
    return listedLabel ?? t`No source`;
  }

  return listedLabel ?? t`Unmapped: ${sourceKey}`;
};

export const getAnalyticsStatusFilterLabel = (
  status: AnalyticsStatusFilter,
  meta: Pick<AnalyticsMeta, 'stages'>,
) => {
  switch (status) {
    case 'ALL':
      return t`All statuses`;
    case 'ACTIVE':
      return t`Active`;
    case 'SUCCESS':
      return meta.stages.find((stage) => stage.isSuccess)?.label ?? t`Success`;
    case 'EXITED':
      return t`Left`;
    case 'UNMAPPED':
      return t`Not mapped`;
    case 'NO_STAGE':
      return t`No stage`;
  }
};
