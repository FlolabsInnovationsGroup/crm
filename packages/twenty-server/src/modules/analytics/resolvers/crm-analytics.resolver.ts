import { UseFilters, UseGuards } from '@nestjs/common';
import { Args, Query } from '@nestjs/graphql';

import { PermissionFlagType } from 'twenty-shared/constants';

import { CoreResolver } from 'src/engine/api/graphql/graphql-config/decorators/core-resolver.decorator';
import { AuthGraphqlApiExceptionFilter } from 'src/engine/core-modules/auth/filters/auth-graphql-api-exception.filter';
import { PreventNestToAutoLogGraphqlErrorsFilter } from 'src/engine/core-modules/graphql/filters/prevent-nest-to-auto-log-graphql-errors.filter';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { AuthPrincipalGuard } from 'src/engine/guards/auth-principal.guard';
import { SettingsPermissionGuard } from 'src/engine/guards/settings-permission.guard';
import { PermissionsGraphqlApiExceptionFilter } from 'src/engine/metadata-modules/permissions/utils/permissions-graphql-api-exception.filter';
import { CrmAnalyticsFilterInput } from 'src/modules/analytics/dtos/crm-analytics-filter.input';
import { CrmAnalyticsPayloadDTO } from 'src/modules/analytics/dtos/crm-analytics-payload.dto';
import { CrmAnalyticsMetaService } from 'src/modules/analytics/services/crm-analytics-meta.service';
import { CrmAnalyticsMetricsService } from 'src/modules/analytics/services/crm-analytics-metrics.service';
import { CrmAnalyticsReportService } from 'src/modules/analytics/services/crm-analytics-report.service';
import {
  parseCrmAnalyticsFilter,
  parseCrmAnalyticsGroupBy,
  parseCrmAnalyticsLocalDate,
  parseCrmAnalyticsReportPeriodType,
  parseCrmAnalyticsStageKey,
  parseCrmAnalyticsTrendMetric,
} from 'src/modules/analytics/utils/parse-crm-analytics-filter.util';

// The services read through the system context, which bypasses record permissions, so
// these guards are what protects the data.
@UseGuards(
  AuthPrincipalGuard({
    userSession: {
      standard: true,
      impersonated: true,
      playground: false,
      workspaceAgnostic: false,
    },
    apiKey: false,
    oauthClient: false,
    application: false,
  }),
  SettingsPermissionGuard(PermissionFlagType.EXPORT_CSV),
)
@CoreResolver(() => CrmAnalyticsPayloadDTO)
@UseFilters(
  AuthGraphqlApiExceptionFilter,
  PermissionsGraphqlApiExceptionFilter,
  PreventNestToAutoLogGraphqlErrorsFilter,
)
export class CrmAnalyticsResolver {
  constructor(
    private readonly metaService: CrmAnalyticsMetaService,
    private readonly metricsService: CrmAnalyticsMetricsService,
    private readonly reportService: CrmAnalyticsReportService,
  ) {}

  @Query(() => CrmAnalyticsPayloadDTO)
  async getCrmAnalyticsMeta(
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<CrmAnalyticsPayloadDTO> {
    return { payload: await this.metaService.getMeta(workspace.id) };
  }

  @Query(() => CrmAnalyticsPayloadDTO)
  async getCrmAnalyticsOverview(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @Args('filter', { type: () => CrmAnalyticsFilterInput })
    filter: CrmAnalyticsFilterInput,
  ): Promise<CrmAnalyticsPayloadDTO> {
    const parsedFilter = parseCrmAnalyticsFilter(filter);

    return {
      payload: await this.metricsService.getOverview({
        workspaceId: workspace.id,
        filter: parsedFilter,
      }),
    };
  }

  @Query(() => CrmAnalyticsPayloadDTO)
  async getCrmAnalyticsFunnel(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @Args('filter', { type: () => CrmAnalyticsFilterInput })
    filter: CrmAnalyticsFilterInput,
  ): Promise<CrmAnalyticsPayloadDTO> {
    const parsedFilter = parseCrmAnalyticsFilter(filter);

    return {
      payload: await this.metricsService.getFunnel({
        workspaceId: workspace.id,
        filter: parsedFilter,
      }),
    };
  }

  @Query(() => CrmAnalyticsPayloadDTO)
  async getCrmAnalyticsCategories(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @Args('filter', { type: () => CrmAnalyticsFilterInput })
    filter: CrmAnalyticsFilterInput,
    @Args('groupBy', { type: () => String }) groupBy: string,
  ): Promise<CrmAnalyticsPayloadDTO> {
    const parsedFilter = parseCrmAnalyticsFilter(filter);
    const parsedGroupBy = parseCrmAnalyticsGroupBy(groupBy);

    return {
      payload: await this.metricsService.getCategories({
        workspaceId: workspace.id,
        filter: parsedFilter,
        groupBy: parsedGroupBy,
      }),
    };
  }

  @Query(() => CrmAnalyticsPayloadDTO)
  async getCrmAnalyticsTrends(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @Args('filter', { type: () => CrmAnalyticsFilterInput })
    filter: CrmAnalyticsFilterInput,
    @Args('metric', { type: () => String }) metric: string,
    @Args('stageKey', { type: () => String, nullable: true })
    stageKey?: string | null,
  ): Promise<CrmAnalyticsPayloadDTO> {
    const parsedFilter = parseCrmAnalyticsFilter(filter);
    const parsedMetric = parseCrmAnalyticsTrendMetric(metric);
    const parsedStageKey = parseCrmAnalyticsStageKey(stageKey);

    return {
      payload: await this.metricsService.getTrends({
        workspaceId: workspace.id,
        filter: parsedFilter,
        metric: parsedMetric,
        stageKey: parsedStageKey,
      }),
    };
  }

  @Query(() => CrmAnalyticsPayloadDTO)
  async getCrmAnalyticsReports(
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<CrmAnalyticsPayloadDTO> {
    return { payload: await this.reportService.listReports(workspace.id) };
  }

  @Query(() => CrmAnalyticsPayloadDTO)
  async getCrmAnalyticsReport(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @Args('periodType', { type: () => String }) periodType: string,
    @Args('periodStart', { type: () => String }) periodStart: string,
  ): Promise<CrmAnalyticsPayloadDTO> {
    const parsedPeriodType = parseCrmAnalyticsReportPeriodType(periodType);
    const parsedPeriodStart = parseCrmAnalyticsLocalDate(
      periodStart,
      'periodStart',
    );

    return {
      payload: await this.reportService.getReport({
        workspaceId: workspace.id,
        periodType: parsedPeriodType,
        periodStart: parsedPeriodStart,
      }),
    };
  }
}
