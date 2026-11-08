import { plural, t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';

import { type AnalyticsHeatmapCell } from '@/crm-analytics/charts/AnalyticsHeatmap';
import { formatAnalyticsRate } from '@/crm-analytics/utils/formatAnalyticsRate';

type BuildAnalyticsRateHeatmapCellArgs = {
  columnKey: string;
  title: string;
  rateLabel: string;
  rate: number | null;
  soFarRate?: number | null;
  // People behind the rate, and behind the so far value when the payload has them.
  count: number;
  soFarCount?: number;
  minimumSample: number;
  formatNumber: (value: number) => string;
};

export const buildAnalyticsRateHeatmapCell = ({
  columnKey,
  title,
  rateLabel,
  rate,
  soFarRate,
  count,
  soFarCount,
  minimumSample,
  formatNumber,
}: BuildAnalyticsRateHeatmapCellArgs): AnalyticsHeatmapCell => {
  const buildPeopleRow = (people: number) => {
    const formattedPeople = formatNumber(people);

    return {
      label: t`Out of`,
      value: plural(people, {
        one: `${formattedPeople} person`,
        other: `${formattedPeople} people`,
      }),
    };
  };

  if (isDefined(rate) && count > 0) {
    const isSmallSample = count < minimumSample;

    return {
      columnKey,
      value: rate,
      isSmallSample,
      tooltip: {
        title,
        rows: [
          { label: rateLabel, value: formatAnalyticsRate(rate) ?? '' },
          buildPeopleRow(count),
        ],
        note: isSmallSample ? t`A small group, so this can move a lot.` : null,
      },
    };
  }

  // Nobody has moved yet inside the window, which is not the same as a measured 0%.
  if (isDefined(soFarRate) && soFarRate > 0) {
    return {
      columnKey,
      value: soFarRate,
      isInProgress: true,
      tooltip: {
        title,
        rows: [
          { label: t`So far`, value: formatAnalyticsRate(soFarRate) ?? '' },
          ...(isDefined(soFarCount) ? [buildPeopleRow(soFarCount)] : []),
        ],
        note: t`Still in progress: some people have not had enough time yet.`,
      },
    };
  }

  return {
    columnKey,
    value: null,
    tooltip: { title, rows: [], note: t`Not enough data` },
  };
};
