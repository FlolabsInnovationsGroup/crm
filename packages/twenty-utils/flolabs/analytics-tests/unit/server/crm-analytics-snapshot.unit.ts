import { CRM_ANALYTICS_CONFIG } from 'src/modules/analytics/constants/crm-analytics-config.constant';
import { type CrmAnalyticsFacadeService } from 'src/modules/analytics/facade/crm-analytics-facade.service';
import { CrmAnalyticsSnapshotService } from 'src/modules/analytics/services/crm-analytics-snapshot.service';
import {
  type CrmAnalyticsCrmState,
  type CrmAnalyticsSqlRunner,
} from 'src/modules/analytics/types/crm-analytics-crm-state.type';

const WORKSPACE_ID = '20202020-0000-4000-8000-000000000001';
const PERSON_RELATION_SQL = 'SELECT 1 AS person_relation_marker';

type TakeSnapshotResult = Awaited<
  ReturnType<CrmAnalyticsSnapshotService['takeSnapshot']>
>;

const buildSnapshot = async (row: Record<string, unknown> | undefined) => {
  const queries: { sql: string; parameters: unknown[] }[] = [];
  const buildPersonRelationSql = jest.fn().mockReturnValue(PERSON_RELATION_SQL);
  const run: CrmAnalyticsSqlRunner = async (sql, parameters) => {
    queries.push({ sql, parameters });

    return row === undefined ? [] : [row];
  };
  const state = { workspaceId: WORKSPACE_ID } as CrmAnalyticsCrmState;
  const service = new CrmAnalyticsSnapshotService({
    buildPersonRelationSql,
  } as unknown as CrmAnalyticsFacadeService);

  const result: TakeSnapshotResult = await service.takeSnapshot({ state, run });

  return { result, queries, state, buildPersonRelationSql };
};

describe('CrmAnalyticsSnapshotService consistency', () => {
  it.each([
    ['all three totals agree', 25, 10, 10, 10, 'OK'],
    ['the all rows fall short of the live count', 25, 10, 9, 10, 'MISMATCH'],
    ['the source rows fall short of the live count', 25, 10, 10, 9, 'MISMATCH'],
    ['the all rows run over the live count', 25, 10, 11, 10, 'MISMATCH'],
    ['the source rows run over the live count', 25, 10, 10, 11, 'MISMATCH'],
    ['both totals are wrong by the same amount', 25, 10, 7, 7, 'MISMATCH'],
    ['nothing was inserted, so there is nothing to compare', 0, 10, 0, 0, 'NOT_RUN'],
    ['a rerun finds the day already stored, even with odd totals', 0, 10, 3, 4, 'NOT_RUN'],
    ['an empty workspace still stores its one all row', 1, 0, 0, 0, 'OK'],
  ])(
    '%s',
    async (_description, insertedRows, liveTotal, allTotal, sourceTotal, consistency) => {
      const { result } = await buildSnapshot({
        inserted_rows: insertedRows,
        live_total: liveTotal,
        all_total: allTotal,
        source_total: sourceTotal,
      });

      expect(result).toEqual({
        consistency,
        insertedRows,
        liveTotal,
        allTotal,
        sourceTotal,
      });
    },
  );

  it('reads counts that Postgres returns as text', async () => {
    const { result } = await buildSnapshot({
      inserted_rows: '4',
      live_total: '12',
      all_total: '12',
      source_total: '12',
    });

    expect(result).toEqual({
      consistency: 'OK',
      insertedRows: 4,
      liveTotal: 12,
      allTotal: 12,
      sourceTotal: 12,
    });
  });

  it('treats no result row as nothing inserted, not as agreement', async () => {
    const { result } = await buildSnapshot(undefined);

    expect(result).toEqual({
      consistency: 'NOT_RUN',
      insertedRows: 0,
      liveTotal: 0,
      allTotal: 0,
      sourceTotal: 0,
    });
  });
});

describe('CrmAnalyticsSnapshotService statement', () => {
  const buildStatement = async () => {
    const { queries, state, buildPersonRelationSql } = await buildSnapshot({
      inserted_rows: 1,
      live_total: 0,
      all_total: 0,
      source_total: 0,
    });

    return { queries, state, buildPersonRelationSql, sql: queries[0].sql };
  };

  // The totals and the stored rows must read one database snapshot, or a person created
  // between two statements would read as a mismatch.
  it('counts and stores in exactly one statement, with both parameters supplied', async () => {
    const { queries } = await buildStatement();

    expect(queries).toHaveLength(1);
    expect(queries[0].parameters).toEqual([
      WORKSPACE_ID,
      CRM_ANALYTICS_CONFIG.reportingTimeZone,
    ]);

    const usedParameters = [...queries[0].sql.matchAll(/\$(\d+)/g)].map((match) =>
      Number(match[1]),
    );

    expect(Math.max(...usedParameters)).toBe(queries[0].parameters.length);
  });

  it('reads people only through the relation the facade builds for this state', async () => {
    const { sql, state, buildPersonRelationSql } = await buildStatement();

    expect(buildPersonRelationSql).toHaveBeenCalledWith(state);
    expect(sql).toContain(`crm_person AS (${PERSON_RELATION_SQL})`);
  });

  it('stores all four dimensions, and adds nothing to a day that already has rows', async () => {
    const { sql } = await buildStatement();

    for (const dimension of ['all', 'source', 'position', 'track']) {
      expect(sql).toContain(`'${dimension}'`);
    }

    expect(sql).toMatch(
      /WHERE NOT EXISTS \(\s*SELECT 1 FROM analytics\.daily_snapshot d\s*WHERE d\.workspace_id = \$1 AND d\.snapshot_date = /,
    );
    expect(sql).toContain('ON CONFLICT DO NOTHING');
  });

  // A person holds several positions and tracks, so those rows do not sum to the total.
  it('compares only the all and source rows with the live count', async () => {
    const { sql } = await buildStatement();

    expect(sql).toContain(
      `(SELECT COALESCE(sum(person_count), 0) FROM inserted WHERE dimension = 'all')`,
    );
    expect(sql).toContain(
      `(SELECT COALESCE(sum(person_count), 0) FROM inserted WHERE dimension = 'source')`,
    );
    expect(sql).not.toMatch(/FROM inserted WHERE dimension = '(position|track)'/);
  });
});
