import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UserVarsModule } from 'src/engine/core-modules/user/user-vars/user-vars.module';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { WorkspaceManyOrAllFlatEntityMapsCacheModule } from 'src/engine/metadata-modules/flat-entity/services/workspace-many-or-all-flat-entity-maps-cache.module';
import { PermissionsModule } from 'src/engine/metadata-modules/permissions/permissions.module';
import { CrmAnalyticsRunCommand } from 'src/modules/analytics/crons/commands/crm-analytics-run.command';
import { CrmAnalyticsCronCommand } from 'src/modules/analytics/crons/commands/crm-analytics.cron.command';
import { CrmAnalyticsDailyCronJob } from 'src/modules/analytics/crons/jobs/crm-analytics-daily.cron.job';
import { CrmAnalyticsSyncCronJob } from 'src/modules/analytics/crons/jobs/crm-analytics-sync.cron.job';
import { CrmAnalyticsFacadeService } from 'src/modules/analytics/facade/crm-analytics-facade.service';
import { CrmAnalyticsWorkspaceDailyJob } from 'src/modules/analytics/jobs/crm-analytics-workspace-daily.job';
import { CrmAnalyticsWorkspaceSyncJob } from 'src/modules/analytics/jobs/crm-analytics-workspace-sync.job';
import { CrmAnalyticsResolver } from 'src/modules/analytics/resolvers/crm-analytics.resolver';
import { CrmAnalyticsDatabaseService } from 'src/modules/analytics/services/crm-analytics-database.service';
import { CrmAnalyticsMetaService } from 'src/modules/analytics/services/crm-analytics-meta.service';
import { CrmAnalyticsMetricsService } from 'src/modules/analytics/services/crm-analytics-metrics.service';
import { CrmAnalyticsReportService } from 'src/modules/analytics/services/crm-analytics-report.service';
import { CrmAnalyticsSettingsService } from 'src/modules/analytics/services/crm-analytics-settings.service';
import { CrmAnalyticsSnapshotService } from 'src/modules/analytics/services/crm-analytics-snapshot.service';
import { CrmAnalyticsSyncService } from 'src/modules/analytics/services/crm-analytics-sync.service';

@Module({
  imports: [
    PermissionsModule,
    UserVarsModule,
    WorkspaceManyOrAllFlatEntityMapsCacheModule,
    TypeOrmModule.forFeature([WorkspaceEntity]),
  ],
  providers: [
    CrmAnalyticsFacadeService,
    CrmAnalyticsDatabaseService,
    CrmAnalyticsSettingsService,
    CrmAnalyticsSyncService,
    CrmAnalyticsSnapshotService,
    CrmAnalyticsMetricsService,
    CrmAnalyticsReportService,
    CrmAnalyticsMetaService,
    CrmAnalyticsResolver,
    CrmAnalyticsCronCommand,
    CrmAnalyticsRunCommand,
    CrmAnalyticsSyncCronJob,
    CrmAnalyticsDailyCronJob,
    CrmAnalyticsWorkspaceSyncJob,
    CrmAnalyticsWorkspaceDailyJob,
  ],
  exports: [CrmAnalyticsCronCommand],
})
export class CrmAnalyticsModule {}
