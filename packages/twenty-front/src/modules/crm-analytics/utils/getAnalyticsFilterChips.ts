import { i18n } from '@lingui/core';
import { t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';

import {
  type AnalyticsFilter,
  type AnalyticsMeta,
} from '@/crm-analytics/types/AnalyticsApi';
import { findAnalyticsDatePreset } from '@/crm-analytics/utils/getAnalyticsDatePreset';
import {
  getAnalyticsProgramFilterLabel,
  getAnalyticsSourceFilterLabel,
  getAnalyticsStatusFilterLabel,
  getAnalyticsTrackFilterLabel,
} from '@/crm-analytics/utils/getAnalyticsFilterLabels';
import { toAnalyticsLocalDate } from '@/crm-analytics/utils/toAnalyticsLocalDate';

export type AnalyticsFilterChip = {
  key: 'DATES' | 'TRACK' | 'PROGRAM' | 'SOURCE' | 'STATUS';
  label: string;
  filterWithoutChip: AnalyticsFilter;
};

const formatChipDate = (date: string) =>
  i18n.date(toAnalyticsLocalDate(date), {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });

const getDatesLabel = (filter: AnalyticsFilter, timeZone: string) => {
  switch (findAnalyticsDatePreset(filter, timeZone)) {
    case 'LAST_7':
      return t`Last 7 days`;
    case 'LAST_30':
      return t`Last 30 days`;
    case 'LAST_90':
      return t`Last 90 days`;
  }

  if (isDefined(filter.dateFrom) && isDefined(filter.dateTo)) {
    const fromDate = formatChipDate(filter.dateFrom);
    const toDate = formatChipDate(filter.dateTo);

    return t`${fromDate} to ${toDate}`;
  }

  if (isDefined(filter.dateFrom)) {
    const fromDate = formatChipDate(filter.dateFrom);

    return t`From ${fromDate}`;
  }

  const toDate = isDefined(filter.dateTo) ? formatChipDate(filter.dateTo) : '';

  return t`Until ${toDate}`;
};

type GetAnalyticsFilterChipsArgs = {
  filter: AnalyticsFilter;
  meta: AnalyticsMeta;
  // Funnel and Trends numbers never use the status, so a chip there would claim a filter that is not applied.
  isStatusApplied: boolean;
};

export const getAnalyticsFilterChips = ({
  filter,
  meta,
  isStatusApplied,
}: GetAnalyticsFilterChipsArgs): AnalyticsFilterChip[] => {
  const chips: AnalyticsFilterChip[] = [];

  if (isDefined(filter.dateFrom) || isDefined(filter.dateTo)) {
    chips.push({
      key: 'DATES',
      label: getDatesLabel(filter, meta.reportingTimeZone),
      filterWithoutChip: { ...filter, dateFrom: null, dateTo: null },
    });
  }

  if (isDefined(filter.trackKey)) {
    const trackLabel = getAnalyticsTrackFilterLabel(filter.trackKey, meta);

    chips.push({
      key: 'TRACK',
      label: t`Track: ${trackLabel}`,
      filterWithoutChip: { ...filter, trackKey: null },
    });
  }

  if (isDefined(filter.programKey)) {
    const programLabel = getAnalyticsProgramFilterLabel(
      filter.programKey,
      meta,
    );

    chips.push({
      key: 'PROGRAM',
      label: t`Program: ${programLabel}`,
      filterWithoutChip: { ...filter, programKey: null },
    });
  }

  if (isDefined(filter.sourceKey)) {
    const sourceLabel = getAnalyticsSourceFilterLabel(filter.sourceKey, meta);

    chips.push({
      key: 'SOURCE',
      label: t`Source: ${sourceLabel}`,
      filterWithoutChip: { ...filter, sourceKey: null },
    });
  }

  if (isStatusApplied && filter.status !== 'ALL') {
    const statusLabel = getAnalyticsStatusFilterLabel(filter.status, meta);

    chips.push({
      key: 'STATUS',
      label: t`Status: ${statusLabel}`,
      filterWithoutChip: { ...filter, status: 'ALL' },
    });
  }

  return chips;
};
