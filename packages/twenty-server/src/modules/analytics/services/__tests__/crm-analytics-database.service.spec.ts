import { DataSource } from 'typeorm';

import { type WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { CrmAnalyticsDatabaseService } from 'src/modules/analytics/services/crm-analytics-database.service';

jest.mock('typeorm', () => ({
  ...jest.requireActual('typeorm'),
  DataSource: jest.fn(),
}));

const WORKSPACE_ID = '20202020-0000-4000-8000-000000000001';

const setupPageTransaction = ({
  runInWorkspaceTransaction,
}: { runInWorkspaceTransaction?: () => Promise<unknown> } = {}) => {
  const executeRawQuery = jest.fn().mockResolvedValue([]);

  const service = new CrmAnalyticsDatabaseService(
    {
      executeInWorkspaceContext: (work: () => unknown) => work(),
      runInWorkspaceTransaction:
        runInWorkspaceTransaction ??
        ((
          work: (transactionScope: { executeRawQuery: jest.Mock }) => unknown,
        ) => work({ executeRawQuery })),
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
        ['SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY', []],
        [`SELECT set_config('statement_timeout', $1, true)`, ['8000']],
        ['SET LOCAL enable_nestloop = off', []],
        ['SET LOCAL jit = off', []],
        ['SELECT 1', []],
      ]);
    });

    describe('limits', () => {
      const BUSY_ERROR = {
        extensions: { code: 'TIMEOUT', subCode: 'CRM_ANALYTICS_BUSY' },
      };

      const buildGate = () => {
        let open = () => {};
        const opened = new Promise<void>((resolve) => {
          open = resolve;
        });

        return { opened, open };
      };

      beforeEach(() => {
        jest.useFakeTimers();
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      it('runs two reads at once and hands a freed slot to the longest waiter', async () => {
        const { service } = setupPageTransaction();
        const started: string[] = [];
        const firstGate = buildGate();
        const secondGate = buildGate();

        const read = (name: string, gate: Promise<void>) =>
          service.runPageTransaction(WORKSPACE_ID, async () => {
            started.push(name);
            await gate;

            return name;
          });

        const first = read('first', firstGate.opened);
        const second = read('second', secondGate.opened);
        const third = read('third', Promise.resolve());
        const fourth = read('fourth', Promise.resolve());

        await jest.advanceTimersByTimeAsync(0);
        expect(started).toEqual(['first', 'second']);

        firstGate.open();
        await expect(first).resolves.toBe('first');
        await expect(third).resolves.toBe('third');
        await expect(fourth).resolves.toBe('fourth');
        expect(started).toEqual(['first', 'second', 'third', 'fourth']);

        secondGate.open();
        await expect(second).resolves.toBe('second');
      });

      it('gives a clear busy error after about 10 seconds of waiting, without touching the database', async () => {
        const { service, executeRawQuery } = setupPageTransaction();
        const gate = buildGate();
        const hold = () =>
          service.runPageTransaction(WORKSPACE_ID, () => gate.opened);
        const held = [hold(), hold()];

        await jest.advanceTimersByTimeAsync(0);
        executeRawQuery.mockClear();

        const work = jest.fn();
        let isSettled = false;
        const waiting = service
          .runPageTransaction(WORKSPACE_ID, work)
          .finally(() => {
            isSettled = true;
          });
        const busyExpectation =
          expect(waiting).rejects.toMatchObject(BUSY_ERROR);

        await jest.advanceTimersByTimeAsync(9999);
        expect(isSettled).toBe(false);

        await jest.advanceTimersByTimeAsync(1);
        await busyExpectation;
        expect(work).not.toHaveBeenCalled();
        expect(executeRawQuery).not.toHaveBeenCalled();

        gate.open();
        await Promise.all(held);

        await expect(
          service.runPageTransaction(WORKSPACE_ID, async () => 'free again'),
        ).resolves.toBe('free again');
      });

      it('frees the slot when a read fails', async () => {
        const { service } = setupPageTransaction();

        for (const attempt of [1, 2, 3]) {
          await expect(
            service.runPageTransaction(WORKSPACE_ID, async () => {
              throw new Error(`failed read ${attempt}`);
            }),
          ).rejects.toThrow(`failed read ${attempt}`);
        }

        await expect(
          service.runPageTransaction(WORKSPACE_ID, async () => 'still free'),
        ).resolves.toBe('still free');
      });

      it('frees the slot when the transaction cannot open', async () => {
        const { service } = setupPageTransaction({
          runInWorkspaceTransaction: () =>
            Promise.reject(new Error('no connection')),
        });

        for (const _attempt of [1, 2, 3]) {
          await expect(
            service.runPageTransaction(WORKSPACE_ID, async () => 'unreached'),
          ).rejects.toThrow('no connection');
        }
      });

      it('stops a read that has run for about 15 seconds in total', async () => {
        const { service, executeRawQuery } = setupPageTransaction();

        await expect(
          service.runPageTransaction(WORKSPACE_ID, async (run) => {
            await run('SELECT 1', []);
            jest.advanceTimersByTime(15000);
            await run('SELECT 2', []);
          }),
        ).rejects.toMatchObject(BUSY_ERROR);

        expect(executeRawQuery).toHaveBeenCalledWith('SELECT 1', []);
        expect(executeRawQuery).not.toHaveBeenCalledWith('SELECT 2', []);
      });

      it('starts the time budget once the slot is held', async () => {
        const { service } = setupPageTransaction();
        const gate = buildGate();
        const hold = () =>
          service.runPageTransaction(WORKSPACE_ID, () => gate.opened);
        const held = [hold(), hold()];

        await jest.advanceTimersByTimeAsync(0);

        const waiting = service.runPageTransaction(WORKSPACE_ID, (run) => {
          jest.advanceTimersByTime(14000);

          return run('SELECT 1', []);
        });

        await jest.advanceTimersByTimeAsync(1500);
        gate.open();
        await Promise.all(held);

        await expect(waiting).resolves.toEqual([]);
      });

      it('shrinks the statement limit to the time left, inside this transaction only', async () => {
        const { service, executeRawQuery } = setupPageTransaction();

        await service.runPageTransaction(WORKSPACE_ID, async (run) => {
          await run('SELECT 1', []);
          jest.advanceTimersByTime(7000);
          await run('SELECT 2', []);
          jest.advanceTimersByTime(5000);
          await run('SELECT 3', []);
        });

        expect(executeRawQuery.mock.calls.slice(-4)).toEqual([
          ['SELECT 1', []],
          ['SELECT 2', []],
          [`SELECT set_config('statement_timeout', $1, true)`, ['3000']],
          ['SELECT 3', []],
        ]);
      });

      it('reports a statement cut off at the end of the budget as busy', async () => {
        const { service, executeRawQuery } = setupPageTransaction();

        executeRawQuery.mockImplementation(async (sql: string) => {
          if (sql === 'SELECT 1') {
            jest.advanceTimersByTime(15000);

            throw new Error('canceling statement due to statement timeout');
          }

          return [];
        });

        await expect(
          service.runPageTransaction(WORKSPACE_ID, (run) =>
            run('SELECT 1', []),
          ),
        ).rejects.toMatchObject(BUSY_ERROR);
      });

      it('reports a statement cut off by its own limit as busy, inside the budget', async () => {
        const { service, executeRawQuery } = setupPageTransaction();

        executeRawQuery.mockImplementation(async (sql: string) => {
          if (sql === 'SELECT 1') {
            throw Object.assign(new Error('Data validation error.'), {
              code: '57014',
            });
          }

          return [];
        });

        await expect(
          service.runPageTransaction(WORKSPACE_ID, (run) =>
            run('SELECT 1', []),
          ),
        ).rejects.toMatchObject(BUSY_ERROR);
      });

      it('keeps any other statement error as it is', async () => {
        const { service, executeRawQuery } = setupPageTransaction();

        executeRawQuery.mockImplementation(async (sql: string) => {
          if (sql === 'SELECT 1') {
            throw new Error('relation does not exist');
          }

          return [];
        });

        await expect(
          service.runPageTransaction(WORKSPACE_ID, (run) =>
            run('SELECT 1', []),
          ),
        ).rejects.toThrow('relation does not exist');
      });
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
