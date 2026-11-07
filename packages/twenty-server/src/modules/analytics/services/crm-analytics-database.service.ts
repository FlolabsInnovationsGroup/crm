import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';

import { DataSource } from 'typeorm';

import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { CRM_ANALYTICS_DDL_STATEMENTS } from 'src/modules/analytics/constants/crm-analytics-ddl.constant';
import { type CrmAnalyticsSqlRunner } from 'src/modules/analytics/types/crm-analytics-crm-state.type';

// Under the 10 s client-side query limit of the workspace pool.
const PAGE_STATEMENT_TIMEOUT_MS = 8000;
const JOB_STATEMENT_TIMEOUT_MS = 120000;

// CTE row estimates run low, so nested loops hit the limits; their disable cost would trip JIT.
const PLANNER_SETTINGS = ['enable_nestloop = off', 'jit = off'];

@Injectable()
export class CrmAnalyticsDatabaseService {
  constructor(
    private readonly workspaceOrmManager: WorkspaceOrmManager,
    @InjectDataSource()
    private readonly coreDataSource: DataSource,
  ) {}

  // The system context bypasses record permissions, so the resolver guard is what
  // protects this path.
  async runPageTransaction<TResult>(
    workspaceId: string,
    work: (run: CrmAnalyticsSqlRunner) => Promise<TResult>,
  ): Promise<TResult> {
    return this.workspaceOrmManager.executeInWorkspaceContext(
      () =>
        this.workspaceOrmManager.runInWorkspaceTransaction(
          async (transactionScope) => {
            const run: CrmAnalyticsSqlRunner = (sql, parameters) =>
              transactionScope.executeRawQuery(sql, parameters);

            await run('SET TRANSACTION READ ONLY', []);
            await run(`SELECT set_config('statement_timeout', $1, true)`, [
              String(PAGE_STATEMENT_TIMEOUT_MS),
            ]);

            for (const setting of PLANNER_SETTINGS) {
              await run(`SET LOCAL ${setting}`, []);
            }

            return work(run);
          },
        ),
      buildSystemAuthContext(workspaceId),
    );
  }

  // Own one-connection data source: both CRM pools carry a 10 s client-side query
  // limit that a full timeline scan may exceed, and this keeps job load off them.
  async runJob<TResult>(
    work: (run: CrmAnalyticsSqlRunner) => Promise<TResult>,
  ): Promise<TResult> {
    const jobDataSource = await this.createJobDataSource();
    const queryRunner = jobDataSource.createQueryRunner();

    try {
      for (const setting of PLANNER_SETTINGS) {
        await queryRunner.query(`SET ${setting}`);
      }

      // A structured result, because the plain form returns [rows, count] for
      // UPDATE and DELETE instead of rows.
      return await work(async (sql, parameters) => {
        const { records } = await queryRunner.query(sql, parameters, true);

        return records;
      });
    } finally {
      await queryRunner.release();
      await jobDataSource.destroy();
    }
  }

  async ensureStorage(run: CrmAnalyticsSqlRunner): Promise<void> {
    for (const statement of CRM_ANALYTICS_DDL_STATEMENTS) {
      await run(statement, []);
    }
  }

  private async createJobDataSource(): Promise<DataSource> {
    const coreDataSourceOptions = this.coreDataSource.options;

    if (coreDataSourceOptions.type !== 'postgres') {
      throw new Error(
        `CRM analytics jobs require a postgres datasource, got ${coreDataSourceOptions.type}`,
      );
    }

    const jobDataSource = new DataSource({
      ...coreDataSourceOptions,
      entities: [],
      migrations: [],
      subscribers: [],
      poolSize: 1,
      extra: {
        ...coreDataSourceOptions.extra,
        query_timeout: undefined,
        statement_timeout: JOB_STATEMENT_TIMEOUT_MS,
      },
    });

    return jobDataSource.initialize();
  }
}
