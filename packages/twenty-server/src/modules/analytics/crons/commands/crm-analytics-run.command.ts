import { Logger } from '@nestjs/common';

import { Command, CommandRunner, Option } from 'nest-commander';
import { isDefined } from 'twenty-shared/utils';

import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { CrmAnalyticsWorkspaceDailyJob } from 'src/modules/analytics/jobs/crm-analytics-workspace-daily.job';
import { CrmAnalyticsWorkspaceSyncJob } from 'src/modules/analytics/jobs/crm-analytics-workspace-sync.job';

type CrmAnalyticsRunCommandOptions = {
  workspaceId: string;
  job: string;
};

const WORK_JOB_NAME_BY_OPTION = new Map<string, string>([
  ['sync', CrmAnalyticsWorkspaceSyncJob.name],
  ['daily', CrmAnalyticsWorkspaceDailyJob.name],
]);

@Command({
  name: 'crm-analytics:run',
  description: 'Enqueues one CRM analytics job for a workspace',
})
export class CrmAnalyticsRunCommand extends CommandRunner {
  private readonly logger = new Logger(CrmAnalyticsRunCommand.name);

  constructor(
    @InjectMessageQueue(MessageQueue.workspaceQueue)
    private readonly messageQueueService: MessageQueueService,
  ) {
    super();
  }

  @Option({
    flags: '--workspace-id <workspaceId>',
    description: 'Workspace UUID to run the job for',
    required: true,
  })
  parseWorkspaceId(value: string): string {
    return value;
  }

  @Option({
    flags: '--job <job>',
    description: 'Job to enqueue: sync or daily',
    required: true,
  })
  parseJob(value: string): string {
    return value;
  }

  async run(
    _passedParams: string[],
    { workspaceId, job }: CrmAnalyticsRunCommandOptions,
  ): Promise<void> {
    const workJobName = WORK_JOB_NAME_BY_OPTION.get(job);

    if (!isDefined(workJobName)) {
      throw new Error(`Unknown job "${job}", expected sync or daily`);
    }

    await this.messageQueueService.add<{ workspaceId: string }>(workJobName, {
      workspaceId,
    });

    this.logger.log(`Enqueued ${workJobName} for workspace ${workspaceId}`);
  }
}
