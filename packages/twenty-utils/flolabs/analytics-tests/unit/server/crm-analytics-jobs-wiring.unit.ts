import { type ExceptionHandlerService } from 'src/engine/core-modules/exception-handler/exception-handler.service';
import { type MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { CrmAnalyticsRunCommand } from 'src/modules/analytics/crons/commands/crm-analytics-run.command';
import { CrmAnalyticsCronCommand } from 'src/modules/analytics/crons/commands/crm-analytics.cron.command';
import { CrmAnalyticsDailyCronJob } from 'src/modules/analytics/crons/jobs/crm-analytics-daily.cron.job';
import { CrmAnalyticsSyncCronJob } from 'src/modules/analytics/crons/jobs/crm-analytics-sync.cron.job';
import { type CrmAnalyticsFacadeService } from 'src/modules/analytics/facade/crm-analytics-facade.service';
import { CrmAnalyticsWorkspaceDailyJob } from 'src/modules/analytics/jobs/crm-analytics-workspace-daily.job';
import { CrmAnalyticsWorkspaceSyncJob } from 'src/modules/analytics/jobs/crm-analytics-workspace-sync.job';

const buildQueue = () => ({
  add: jest.fn().mockResolvedValue(undefined),
  addCron: jest.fn().mockResolvedValue(undefined),
});

describe('CrmAnalyticsCronCommand', () => {
  it('registers both crons with the contract section 5 patterns', async () => {
    const queue = buildQueue();

    await new CrmAnalyticsCronCommand(
      queue as unknown as MessageQueueService,
    ).run();

    expect(queue.addCron.mock.calls.map(([call]) => call)).toEqual([
      {
        jobName: CrmAnalyticsSyncCronJob.name,
        data: undefined,
        options: { repeat: { pattern: '7,22,37,52 * * * *' } },
      },
      {
        jobName: CrmAnalyticsDailyCronJob.name,
        data: undefined,
        options: { repeat: { pattern: '30 2 * * *' } },
      },
    ]);
  });
});

describe('CrmAnalyticsRunCommand', () => {
  it.each([
    ['sync', CrmAnalyticsWorkspaceSyncJob.name],
    ['daily', CrmAnalyticsWorkspaceDailyJob.name],
  ])('--job %s enqueues the work job for that workspace', async (job, jobName) => {
    const queue = buildQueue();
    const command = new CrmAnalyticsRunCommand(
      queue as unknown as MessageQueueService,
    );

    await command.run([], { workspaceId: 'workspace-1', job });

    expect(queue.add.mock.calls).toEqual([
      [jobName, { workspaceId: 'workspace-1' }],
    ]);
  });

  it('refuses an unknown job and enqueues nothing', async () => {
    const queue = buildQueue();
    const command = new CrmAnalyticsRunCommand(
      queue as unknown as MessageQueueService,
    );

    await expect(
      command.run([], { workspaceId: 'workspace-1', job: 'weekly' }),
    ).rejects.toThrow('weekly');
    expect(queue.add).not.toHaveBeenCalled();
  });
});

describe('CrmAnalyticsDailyCronJob', () => {
  const buildJob = () => {
    const queue = buildQueue();
    const exceptionHandler = { captureExceptions: jest.fn() };
    const job = new CrmAnalyticsDailyCronJob(
      {
        listActiveWorkspaceIds: jest
          .fn()
          .mockResolvedValue(['workspace-1', 'workspace-2', 'workspace-3']),
      } as unknown as CrmAnalyticsFacadeService,
      queue as unknown as MessageQueueService,
      exceptionHandler as unknown as ExceptionHandlerService,
    );

    return { job, queue, exceptionHandler };
  };

  it('enqueues the daily work job once per active workspace', async () => {
    const { job, queue } = buildJob();

    await job.handle();

    expect(queue.add.mock.calls).toEqual([
      [CrmAnalyticsWorkspaceDailyJob.name, { workspaceId: 'workspace-1' }],
      [CrmAnalyticsWorkspaceDailyJob.name, { workspaceId: 'workspace-2' }],
      [CrmAnalyticsWorkspaceDailyJob.name, { workspaceId: 'workspace-3' }],
    ]);
  });

  it('keeps going when the queue fails for one workspace, and reports it', async () => {
    const { job, queue, exceptionHandler } = buildJob();
    const queueError = new Error('queue unavailable');

    queue.add
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(queueError)
      .mockResolvedValueOnce(undefined);

    await job.handle();

    expect(queue.add).toHaveBeenCalledTimes(3);
    expect(exceptionHandler.captureExceptions).toHaveBeenCalledWith(
      [queueError],
      { workspace: { id: 'workspace-2' } },
    );
  });
});
