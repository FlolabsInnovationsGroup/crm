// The one place dates become local to the reporting zone. Returns a timestamp
// without zone: follow it with ::date or wrap it in date_trunc for a bucket.
export const buildCrmAnalyticsLocalDateSql = ({
  columnSql,
  timeZoneParameter,
}: {
  columnSql: string;
  timeZoneParameter: string;
}): string => `(${columnSql} AT TIME ZONE ${timeZoneParameter}::text)`;
