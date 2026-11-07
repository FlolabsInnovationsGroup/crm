import { CRM_ANALYTICS_DDL_STATEMENTS } from 'src/modules/analytics/constants/crm-analytics-ddl.constant';

const stripSqlComments = (statement: string): string =>
  statement.replace(/--.*$/gm, '');

describe('CRM_ANALYTICS_DDL_STATEMENTS', () => {
  it('creates the schema before anything else', () => {
    expect(CRM_ANALYTICS_DDL_STATEMENTS[0]).toContain(
      'CREATE SCHEMA IF NOT EXISTS analytics',
    );
  });

  it('makes every statement a no-op on a repeated run', () => {
    for (const statement of CRM_ANALYTICS_DDL_STATEMENTS) {
      expect(statement).toContain('IF NOT EXISTS');
    }
  });

  it('only touches the analytics schema', () => {
    for (const statement of CRM_ANALYTICS_DDL_STATEMENTS) {
      const sql = stripSqlComments(statement);
      const qualifiedNames = sql.match(/[\w"]+\.[\w"]+/g) ?? [];

      expect(sql).toMatch(/\banalytics\b/);

      for (const qualifiedName of qualifiedNames) {
        expect(qualifiedName).toMatch(/^analytics\./);
      }
    }
  });

  it('never drops, deletes or changes rows', () => {
    for (const statement of CRM_ANALYTICS_DDL_STATEMENTS) {
      expect(stripSqlComments(statement)).not.toMatch(
        /\b(DROP|TRUNCATE|DELETE|UPDATE|INSERT)\b/i,
      );
    }
  });

  it('creates the four tables', () => {
    const tableNames = CRM_ANALYTICS_DDL_STATEMENTS.flatMap(
      (statement) =>
        statement.match(/CREATE TABLE IF NOT EXISTS analytics\.(\w+)/)?.[1] ??
        [],
    );

    expect(tableNames).toEqual([
      'stage_transition',
      'daily_snapshot',
      'report',
      'sync_log',
    ]);
  });
});
