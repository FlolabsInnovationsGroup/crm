import { DataSource } from 'typeorm';

import { type WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { CrmAnalyticsDatabaseService } from 'src/modules/analytics/services/crm-analytics-database.service';

jest.mock('typeorm', () => ({
  ...jest.requireActual('typeorm'),
  DataSource: jest.fn(),
}));

const WORKSPACE_ID = '20202020-0000-4000-8000-000000000001';

const setupPageTransaction = () => {
  const executeRawQuery = jest.fn().mockResolvedValue([]);

  const service = new CrmAnalyticsDatabaseService(
    {
      executeInWorkspaceContext: (work: () => unknown) => work(),
      runInWorkspaceTransaction: (
        work: (transactionScope: { executeRawQuery: jest.Mock }) => unknown,
      ) => work({ executeRawQuery }),
    } as unknown as WorkspaceOrmManager,
    {} as DataSource,
  );

  return { service, executeRawQuery };
};

const setupJob = (query: jest.Mock) => {
  const release = jest.fn().mockResolvedValue(undefined);
  const destroy = jest.fn().mockResolvedValue(undefined);

  const jobDataSource = {
    initialize: jest.fn(),
    createQueryRunner: () => ({ query, release }),
    destroy,
  };

  jobDataSource.initialize.mockResolvedValue(jobDataSource);
  (DataSource as unknown as jest.Mock).mockImplementation(() => jobDataSource);

  const service = new CrmAnalyticsDatabaseService(
    {} as WorkspaceOrmManager,
    { options: { type: 'postgres', extra: {} } } as unknown as DataSource,
  );

  return { service, release, destroy };
};

describe('CrmAnalyticsDatabaseService', () => {
  describe('runPageTransaction', () => {
    it('applies the limits and planner settings to this transaction only, before the work', async () => {
      const { service, executeRawQuery } = setupPageTransaction();

      const result = await service.runPageTransaction(
        WORKSPACE_ID,
        async (run) => {
          await run('SELECT 1', []);

          return 'done';
        },
      );

      expect(result).toBe('done');
      expect(executeRawQuery.mock.calls).toEqual([
        ['SET TRANSACTION READ ONLY', []],
        [`SELECT set_config('statement_timeout', $1, true)`, ['8000']],
        ['SET LOCAL enable_nestloop = off', []],
        ['SET LOCAL jit = off', []],
        ['SELECT 1', []],
      ]);
    });
  });

  describe('runJob', () => {
    it('applies the planner settings on the job connection before the work', async () => {
      const query = jest.fn().mockResolvedValue({ records: [{ total: 1 }] });
      const { service, release, destroy } = setupJob(query);

      const rows = await service.runJob((run) => run('SELECT 1', []));

      expect(rows).toEqual([{ total: 1 }]);
      expect(query.mock.calls.map(([sql]) => sql)).toEqual([
        'SET enable_nestloop = off',
        'SET jit = off',
        'SELECT 1',
      ]);
      expect(release).toHaveBeenCalledTimes(1);
      expect(destroy).toHaveBeenCalledTimes(1);
    });

    it('closes the job connection when a planner setting fails', async () => {
      const query = jest.fn().mockRejectedValue(new Error('connection lost'));
      const { service, release, destroy } = setupJob(query);
      const work = jest.fn();

      await expect(service.runJob(work)).rejects.toThrow('connection lost');

      expect(work).not.toHaveBeenCalled();
      expect(release).toHaveBeenCalledTimes(1);
      expect(destroy).toHaveBeenCalledTimes(1);
    });
  });
});
