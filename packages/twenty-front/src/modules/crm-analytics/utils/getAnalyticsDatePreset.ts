import { Temporal } from 'temporal-polyfill';

import { CRM_ANALYTICS_DATE_PRESET_DAYS } from '@/crm-analytics/constants/CrmAnalyticsDatePresetDays';
import { type AnalyticsFilter } from '@/crm-analytics/types/AnalyticsApi';

export type AnalyticsDatePresetKey =
  keyof typeof CRM_ANALYTICS_DATE_PRESET_DAYS;

export const getAnalyticsDatePresetRange = (
  preset: AnalyticsDatePresetKey,
  timeZone: string,
) => {
  const today = Temporal.Now.plainDateISO(timeZone);

  return {
    dateFrom: today
      .subtract({ days: CRM_ANALYTICS_DATE_PRESET_DAYS[preset] - 1 })
      .toString(),
    dateTo: today.toString(),
  };
};

export const findAnalyticsDatePreset = (
  { dateFrom, dateTo }: Pick<AnalyticsFilter, 'dateFrom' | 'dateTo'>,
  timeZone: string,
): AnalyticsDatePresetKey | undefined =>
  (
    Object.keys(CRM_ANALYTICS_DATE_PRESET_DAYS) as AnalyticsDatePresetKey[]
  ).find((preset) => {
    const range = getAnalyticsDatePresetRange(preset, timeZone);

    return range.dateFrom === dateFrom && range.dateTo === dateTo;
  });
