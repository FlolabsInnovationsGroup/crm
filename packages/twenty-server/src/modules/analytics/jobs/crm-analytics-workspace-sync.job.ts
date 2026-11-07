import { Injectable } from '@nestjs/common';

import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import {
  CrmAnalyticsWorkspaceDailyJob,
  type CrmAnalyticsWorkspaceDailyJobData,
} from 'src/modules/analytics/jobs/crm-analytics-workspace-daily.job';
import { CrmAnalyticsSyncService } from 'src/modules/analytics/services/crm-analytics-sync.service';

export type CrmAnalyticsWorkspaceSyncJobData = {
  workspaceId: string;
};

@Injectable()
@Processor(MessageQueue.workspaceQueue)
export class CrmAnalyticsWorkspaceSyncJob {
  constructor(
    private readonly crmAnalyticsSyncService: CrmAnalyticsSyncService,
    @InjectMessageQueue(MessageQueue.workspaceQueue)
    private readonly messageQueueService: MessageQueueService,
  ) {}

  @Process(CrmAnalyticsWorkspaceSyncJob.name)
  async handle({
    workspaceId,
  }: CrmAnalyticsWorkspaceSyncJobData): Promise<void> {
    await this.crmAnalyticsSyncService.runLoggedJob({
      workspaceId,
      jobName: 'sync',
      work: async ({ state, trackingStart, run }) => {
        const updatedSince =
          await this.crmAnalyticsSyncService.computeSyncUpdatedSince({
            workspaceId,
            trackingStart,
            run,
          });

        const processedCount = await this.crmAnalyticsSyncService.readTimeline({
          state,
          updatedSince,
          happenedSince: trackingStart,
          run,
        });

        // No daily row means a fresh database, so take the day-one baseline at once.
        const hasDailyLogRow =
          await this.crmAnalyticsSyncService.hasDailyLogRow({
            workspaceId,
            run,
          });

        if (!hasDailyLogRow) {
          await this.messageQueueService.add<CrmAnalyticsWorkspaceDailyJobData>(
            CrmAnalyticsWorkspaceDailyJob.name,
            { workspaceId },
          );
        }

        return { status: 'ok', processedCount };
      },
    });
  }
}
