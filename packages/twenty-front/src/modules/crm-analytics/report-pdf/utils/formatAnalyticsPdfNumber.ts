import { i18n } from '@lingui/core';
import { plural, t } from '@lingui/core/macro';

// Hooks do not run inside react-pdf's renderer, so the user's number format setting is out of reach.
export const formatAnalyticsPdfNumber = (value: number) => i18n.number(value);

export const formatAnalyticsPdfPeople = (count: number) => {
  const formattedCount = formatAnalyticsPdfNumber(count);

  return plural(count, {
    one: `${formattedCount} person`,
    other: `${formattedCount} people`,
  });
};

export const formatAnalyticsPdfOfPeople = (count: number) => {
  const people = formatAnalyticsPdfPeople(count);

  return t`of ${people}`;
};

export const formatAnalyticsPdfDays = (days: number) => {
  const formattedDays = formatAnalyticsPdfNumber(days);

  return plural(days, {
    one: `${formattedDays} day`,
    other: `${formattedDays} days`,
  });
};

export const formatAnalyticsPdfStays = (count: number) => {
  const formattedCount = formatAnalyticsPdfNumber(count);

  return plural(count, {
    one: `${formattedCount} completed stay`,
    other: `${formattedCount} completed stays`,
  });
};
