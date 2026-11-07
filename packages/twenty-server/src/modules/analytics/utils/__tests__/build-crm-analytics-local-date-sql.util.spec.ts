import { buildCrmAnalyticsLocalDateSql } from 'src/modules/analytics/utils/build-crm-analytics-local-date-sql.util';

describe('buildCrmAnalyticsLocalDateSql', () => {
  it('builds one expression around the column', () => {
    expect(
      buildCrmAnalyticsLocalDateSql({
        columnSql: 's.created_at',
        timeZoneParameter: '$3',
      }),
    ).toBe('(s.created_at AT TIME ZONE $3::text)');
  });

  it('takes the zone only as a parameter', () => {
    const sql = buildCrmAnalyticsLocalDateSql({
      columnSql: 't.happened_at',
      timeZoneParameter: '$7',
    });

    expect(sql).toContain('$7');
    expect(sql).not.toContain("'");
  });
});
