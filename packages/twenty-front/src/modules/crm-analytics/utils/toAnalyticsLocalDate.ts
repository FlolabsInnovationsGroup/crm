// Buckets and report periods are local dates in the reporting zone, so they format at UTC with no zone shift.
export const toAnalyticsLocalDate = (value: string) =>
  new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
