import { plural } from '@lingui/core/macro';

export const formatAnalyticsOfPeople = (
  count: number,
  formatNumber: (value: number) => string,
) => {
  const formattedCount = formatNumber(count);

  return plural(count, {
    one: `of ${formattedCount} person`,
    other: `of ${formattedCount} people`,
  });
};
