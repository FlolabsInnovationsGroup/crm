import { Injectable } from '@nestjs/common';

import { SentryCronMonitor } from 'src/engine/core-modules/cron/sentry-cron-monitor.decorator';
import { ExceptionHandlerService } from 'src/engine/core-modules/exception-handler/exception-handler.service';
import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { CRM_ANALYTICS_SYNC_CRON_PATTERN } from 'src/modules/analytics/constants/crm-analytics-cron-patterns.constant';
import { CrmAnalyticsFacadeService } from 'src/modules/analytics/facade/crm-analytics-facade.service';
import {
  CrmAnalyticsWorkspaceSyncJob,
  type CrmAnalyticsWorkspaceSyncJobData,
} from 'src/modules/analytics/jobs/crm-analytics-workspace-sync.job';

@Injectable()
@Processor(MessageQueue.cronQueue)
export class CrmAnalyticsSyncCronJob {
  constructor(
    private readonly crmAnalyticsFacadeService: CrmAnalyticsFacadeService,
    @InjectMessageQueue(MessageQueue.workspaceQueue)
    private readonly messageQueueService: MessageQueueService,
    private readonly exceptionHandlerService: ExceptionHandlerService,
  ) {}

  @Process(CrmAnalyticsSyncCronJob.name)
  @SentryCronMonitor(
    CrmAnalyticsSyncCronJob.name,
    CRM_ANALYTICS_SYNC_CRON_PATTERN,
  )
  async handle(): Promise<void> {
    const workspaceIds =
      await this.crmAnalyticsFacadeService.listActiveWorkspaceIds();

    for (const workspaceId of workspaceIds) {
      try {
        await this.messageQueueService.add<CrmAnalyticsWorkspaceSyncJobData>(
          CrmAnalyticsWorkspaceSyncJob.name,
          { workspaceId },
        );
      } catch (error) {
        this.exceptionHandlerService.captureExceptions([error], {
          workspace: { id: workspaceId },
        });
      }
    }
  }
}
