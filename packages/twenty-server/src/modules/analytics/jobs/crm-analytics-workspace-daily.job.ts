import { Injectable } from '@nestjs/common';

import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { CrmAnalyticsReportService } from 'src/modules/analytics/services/crm-analytics-report.service';
import { CrmAnalyticsSnapshotService } from 'src/modules/analytics/services/crm-analytics-snapshot.service';
import {
  computeCrmAnalyticsErrorMessage,
  CrmAnalyticsSyncService,
  type CrmAnalyticsJobContext,
  type CrmAnalyticsJobOutcome,
} from 'src/modules/analytics/services/crm-analytics-sync.service';

export type CrmAnalyticsWorkspaceDailyJobData = {
  workspaceId: string;
};

type CrmAnalyticsDailyStepName =
  | 'timelineRead'
  | 'reconcile'
  | 'snapshot'
  | 'trimLog'
  | 'reports';

type CrmAnalyticsDailyStepOutcome =
  | { status: 'ok' | 'skipped' }
  | { status: 'failed'; errorMessage: string };

@Injectable()
@Processor(MessageQueue.workspaceQueue)
export class CrmAnalyticsWorkspaceDailyJob {
  constructor(
    private readonly crmAnalyticsSyncService: CrmAnalyticsSyncService,
    private readonly crmAnalyticsSnapshotService: CrmAnalyticsSnapshotService,
    private readonly crmAnalyticsReportService: CrmAnalyticsReportService,
  ) {}

  @Process(CrmAnalyticsWorkspaceDailyJob.name)
  async handle({
    workspaceId,
  }: CrmAnalyticsWorkspaceDailyJobData): Promise<void> {
    await this.crmAnalyticsSyncService.runLoggedJob({
      workspaceId,
      jobName: 'daily',
      work: (context) => this.runSteps(context),
    });
  }

  private async runSteps({
    state,
    trackingStart,
    run,
  }: CrmAnalyticsJobContext): Promise<CrmAnalyticsJobOutcome> {
    const { workspaceId } = state;
    const steps: Partial<
      Record<CrmAnalyticsDailyStepName, CrmAnalyticsDailyStepOutcome>
    > = {};
    const failures: unknown[] = [];

    const recordFailure = (
      stepName: CrmAnalyticsDailyStepName,
      error: unknown,
    ): void => {
      steps[stepName] = {
        status: 'failed',
        errorMessage: computeCrmAnalyticsErrorMessage(error),
      };
      failures.push(error);
    };

    const runStep = async <TResult>(
      stepName: CrmAnalyticsDailyStepName,
      step: () => Promise<TResult>,
    ): Promise<TResult | undefined> => {
      try {
        const result = await step();

        steps[stepName] = { status: 'ok' };

        return result;
      } catch (error) {
        recordFailure(stepName, error);

        return undefined;
      }
    };

    // Reconcile rows and frozen reports are never rewritten, so neither may be built
    // on a history that a failed step left incomplete. Both catch up on the next run.
    const skipStep = (stepName: CrmAnalyticsDailyStepName): undefined => {
      steps[stepName] = { status: 'skipped' };

      return undefined;
    };

    const processedCount = await runStep('timelineRead', () =>
      this.crmAnalyticsSyncService.readTimeline({
        state,
        updatedSince: trackingStart,
        happenedSince: trackingStart,
        run,
      }),
    );

    const restoredCount =
      steps.timelineRead?.status === 'ok'
        ? await runStep('reconcile', () =>
            this.crmAnalyticsSyncService.reconcile({ state, run }),
          )
        : skipStep('reconcile');

    const snapshot = await runStep('snapshot', () =>
      this.crmAnalyticsSnapshotService.takeSnapshot({ state, run }),
    );

    if (snapshot?.consistency === 'MISMATCH') {
      recordFailure(
        'snapshot',
        new Error(
          `Snapshot totals do not match the CRM: live ${snapshot.liveTotal}, all ${snapshot.allTotal}, source ${snapshot.sourceTotal}`,
        ),
      );
    }

    await runStep('trimLog', () =>
      this.crmAnalyticsSyncService.trimLog({ workspaceId, run }),
    );

    const reportsBuilt =
      steps.reconcile?.status === 'ok'
        ? await runStep('reports', () =>
            this.crmAnalyticsReportService.buildMissingReports({
              workspaceId,
              state,
              run,
            }),
          )
        : skipStep('reports');

    return {
      status: failures.length > 0 ? 'failed' : 'ok',
      processedCount,
      restoredCount,
      details: {
        steps,
        consistency: snapshot?.consistency ?? 'NOT_RUN',
        liveTotal: snapshot?.liveTotal,
        allTotal: snapshot?.allTotal,
        sourceTotal: snapshot?.sourceTotal,
        reportsBuilt,
      },
      failure: failures[0],
    };
  }
}
