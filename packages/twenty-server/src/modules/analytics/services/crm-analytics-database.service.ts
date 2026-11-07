import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';

import { msg } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';
import { DataSource } from 'typeorm';

import { TimeoutError } from 'src/engine/core-modules/graphql/utils/graphql-errors.util';
import { type WorkspaceTransactionScope } from 'src/engine/twenty-orm/types/workspace-transaction-scope.type';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { CRM_ANALYTICS_DDL_STATEMENTS } from 'src/modules/analytics/constants/crm-analytics-ddl.constant';
import { type CrmAnalyticsSqlRunner } from 'src/modules/analytics/types/crm-analytics-crm-state.type';

// Under the 10 s client-side query limit of the workspace pool.
const PAGE_STATEMENT_TIMEOUT_MS = 8000;
const JOB_STATEMENT_TIMEOUT_MS = 120000;

// Page reads share the pool that serves all CRM records and its waiters never time out,
// so these bounds keep analytics from starving it.
const MAXIMUM_CONCURRENT_PAGE_READS = 2;
const PAGE_READ_SLOT_WAIT_MS = 2000;
const PAGE_READ_TIME_BUDGET_MS = 15000;

// CTE row estimates run low, so nested loops hit the limits; their disable cost would trip JIT.
const PLANNER_SETTINGS = ['enable_nestloop = off', 'jit = off'];

const SET_STATEMENT_TIMEOUT_SQL = `SELECT set_config('statement_timeout', $1, true)`;

const buildPageReadBusyError = (): TimeoutError =>
  new TimeoutError('CRM analytics page reads are busy', {
    subCode: 'CRM_ANALYTICS_BUSY',
    userFriendlyMessage: msg`Analytics is busy right now. Please try again in a moment.`,
  });

// The statement limit shrinks with the time left, so the last statement cannot overrun.
const buildPageReadRunner =
  (
    transactionScope: WorkspaceTransactionScope,
    deadline: number,
  ): CrmAnalyticsSqlRunner =>
  async (sql, parameters) => {
    const remainingMs = deadline - Date.now();

    if (remainingMs <= 0) {
      throw buildPageReadBusyError();
    }

    try {
      if (remainingMs < PAGE_STATEMENT_TIMEOUT_MS) {
        await transactionScope.executeRawQuery(SET_STATEMENT_TIMEOUT_SQL, [
          String(remainingMs),
        ]);
      }

      return await transactionScope.executeRawQuery(sql, parameters);
    } catch (error) {
      throw Date.now() >= deadline ? buildPageReadBusyError() : error;
    }
  };

@Injectable()
export class CrmAnalyticsDatabaseService {
  private activePageReadCount = 0;
  private readonly pageReadWaiters: (() => void)[] = [];

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
    await this.acquirePageReadSlot();

    try {
      const deadline = Date.now() + PAGE_READ_TIME_BUDGET_MS;

      return await this.workspaceOrmManager.executeInWorkspaceContext(
        () =>
          this.workspaceOrmManager.runInWorkspaceTransaction(
            async (transactionScope) => {
              const run = buildPageReadRunner(transactionScope, deadline);

              await run('SET TRANSACTION READ ONLY', []);
              await run(SET_STATEMENT_TIMEOUT_SQL, [
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
    } finally {
      this.releasePageReadSlot();
    }
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

  private async acquirePageReadSlot(): Promise<void> {
    if (this.activePageReadCount < MAXIMUM_CONCURRENT_PAGE_READS) {
      this.activePageReadCount += 1;

      return;
    }

    await new Promise<void>((resolve, reject) => {
      const waitTimeout = setTimeout(() => {
        this.pageReadWaiters.splice(this.pageReadWaiters.indexOf(grantSlot), 1);
        reject(buildPageReadBusyError());
      }, PAGE_READ_SLOT_WAIT_MS);

      const grantSlot = () => {
        clearTimeout(waitTimeout);
        resolve();
      };

      this.pageReadWaiters.push(grantSlot);
    });
  }

  // The slot passes straight to the longest waiter, so the count only falls when none waits.
  private releasePageReadSlot(): void {
    const grantSlot = this.pageReadWaiters.shift();

    if (isDefined(grantSlot)) {
      grantSlot();

      return;
    }

    this.activePageReadCount -= 1;
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
