import { type ExceptionHandlerService } from 'src/engine/core-modules/exception-handler/exception-handler.service';
import { type MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { CrmAnalyticsSyncCronJob } from 'src/modules/analytics/crons/jobs/crm-analytics-sync.cron.job';
import { type CrmAnalyticsFacadeService } from 'src/modules/analytics/facade/crm-analytics-facade.service';
import { CrmAnalyticsWorkspaceSyncJob } from 'src/modules/analytics/jobs/crm-analytics-workspace-sync.job';

describe('CrmAnalyticsSyncCronJob', () => {
  let crmAnalyticsFacadeService: { listActiveWorkspaceIds: jest.Mock };
  let messageQueueService: { add: jest.Mock };
  let exceptionHandlerService: { captureExceptions: jest.Mock };
  let job: CrmAnalyticsSyncCronJob;

  beforeEach(() => {
    crmAnalyticsFacadeService = {
      listActiveWorkspaceIds: jest
        .fn()
        .mockResolvedValue(['workspace-1', 'workspace-2', 'workspace-3']),
    };
    messageQueueService = { add: jest.fn().mockResolvedValue(undefined) };
    exceptionHandlerService = { captureExceptions: jest.fn() };

    job = new CrmAnalyticsSyncCronJob(
      crmAnalyticsFacadeService as unknown as CrmAnalyticsFacadeService,
      messageQueueService as unknown as MessageQueueService,
      exceptionHandlerService as unknown as ExceptionHandlerService,
    );
  });

  it('enqueues one work job per active workspace', async () => {
    await job.handle();

    expect(messageQueueService.add.mock.calls).toEqual([
      [CrmAnalyticsWorkspaceSyncJob.name, { workspaceId: 'workspace-1' }],
      [CrmAnalyticsWorkspaceSyncJob.name, { workspaceId: 'workspace-2' }],
      [CrmAnalyticsWorkspaceSyncJob.name, { workspaceId: 'workspace-3' }],
    ]);
    expect(exceptionHandlerService.captureExceptions).not.toHaveBeenCalled();
  });

  it('keeps enqueuing after a queue error for one workspace', async () => {
    const queueError = new Error('queue unavailable');

    messageQueueService.add
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(queueError)
      .mockResolvedValueOnce(undefined);

    await job.handle();

    expect(messageQueueService.add).toHaveBeenCalledTimes(3);
    expect(messageQueueService.add).toHaveBeenLastCalledWith(
      CrmAnalyticsWorkspaceSyncJob.name,
      { workspaceId: 'workspace-3' },
    );
    expect(exceptionHandlerService.captureExceptions).toHaveBeenCalledTimes(1);
    expect(exceptionHandlerService.captureExceptions).toHaveBeenCalledWith(
      [queueError],
      { workspace: { id: 'workspace-2' } },
    );
  });

  it('enqueues nothing when no workspace is active', async () => {
    crmAnalyticsFacadeService.listActiveWorkspaceIds.mockResolvedValue([]);

    await job.handle();

    expect(messageQueueService.add).not.toHaveBeenCalled();
  });
});
