import { Command, CommandRunner } from 'nest-commander';

import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import {
  CRM_ANALYTICS_DAILY_CRON_PATTERN,
  CRM_ANALYTICS_SYNC_CRON_PATTERN,
} from 'src/modules/analytics/constants/crm-analytics-cron-patterns.constant';
import { CrmAnalyticsDailyCronJob } from 'src/modules/analytics/crons/jobs/crm-analytics-daily.cron.job';
import { CrmAnalyticsSyncCronJob } from 'src/modules/analytics/crons/jobs/crm-analytics-sync.cron.job';

@Command({
  name: 'cron:crm-analytics',
  description: 'Starts the CRM analytics sync and daily cron jobs',
})
export class CrmAnalyticsCronCommand extends CommandRunner {
  constructor(
    @InjectMessageQueue(MessageQueue.cronQueue)
    private readonly messageQueueService: MessageQueueService,
  ) {
    super();
  }

  async run(): Promise<void> {
    await this.messageQueueService.addCron<undefined>({
      jobName: CrmAnalyticsSyncCronJob.name,
      data: undefined,
      options: {
        repeat: { pattern: CRM_ANALYTICS_SYNC_CRON_PATTERN },
      },
    });

    await this.messageQueueService.addCron<undefined>({
      jobName: CrmAnalyticsDailyCronJob.name,
      data: undefined,
      options: {
        repeat: { pattern: CRM_ANALYTICS_DAILY_CRON_PATTERN },
      },
    });
  }
}
