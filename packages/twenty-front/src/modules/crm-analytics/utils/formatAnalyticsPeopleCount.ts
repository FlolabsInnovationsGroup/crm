import { plural } from '@lingui/core/macro';

export const formatAnalyticsPeopleCount = (
  count: number,
  formatNumber: (value: number) => string,
) => {
  const formattedCount = formatNumber(count);

  return plural(count, {
    one: `${formattedCount} person`,
    other: `${formattedCount} people`,
  });
};
