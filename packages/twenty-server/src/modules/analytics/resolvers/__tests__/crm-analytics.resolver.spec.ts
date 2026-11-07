import {
  EXCEPTION_FILTERS_METADATA,
  GUARDS_METADATA,
} from '@nestjs/common/constants';
import { GqlExecutionContext } from '@nestjs/graphql';

import { PermissionFlagType } from 'twenty-shared/constants';

import { RESOLVER_SCHEMA_SCOPE_KEY } from 'src/engine/api/graphql/graphql-config/constants/resolver-schema-scope-key.constant';
import { AuthGraphqlApiExceptionFilter } from 'src/engine/core-modules/auth/filters/auth-graphql-api-exception.filter';
import { PreventNestToAutoLogGraphqlErrorsFilter } from 'src/engine/core-modules/graphql/filters/prevent-nest-to-auto-log-graphql-errors.filter';
import { UserInputError } from 'src/engine/core-modules/graphql/utils/graphql-errors.util';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AUTH_PRINCIPAL_GUARD_CONFIG_KEY } from 'src/engine/guards/constants/auth-principal-guard-config-key.constant';
import { PermissionsGraphqlApiExceptionFilter } from 'src/engine/metadata-modules/permissions/utils/permissions-graphql-api-exception.filter';
import { CrmAnalyticsResolver } from 'src/modules/analytics/resolvers/crm-analytics.resolver';
import { type CrmAnalyticsMetaService } from 'src/modules/analytics/services/crm-analytics-meta.service';
import { type CrmAnalyticsMetricsService } from 'src/modules/analytics/services/crm-analytics-metrics.service';
import { type CrmAnalyticsReportService } from 'src/modules/analytics/services/crm-analytics-report.service';

const WORKSPACE = { id: 'workspace-id' } as WorkspaceEntity;

const PARSED_DEFAULT_FILTER = {
  dateFrom: null,
  dateTo: null,
  trackKey: null,
  programKey: null,
  sourceKey: null,
  status: 'ALL',
  period: 'WEEK',
};

const setup = () => {
  const metaService = { getMeta: jest.fn(async () => ({ state: 'READY' })) };
  const metricsService = {
    getOverview: jest.fn(async () => ({ view: 'overview' })),
    getFunnel: jest.fn(async () => ({ view: 'funnel' })),
    getCategories: jest.fn(async () => ({ view: 'categories' })),
    getTrends: jest.fn(async () => ({ view: 'trends' })),
    getSeries: jest.fn(async () => ({ view: 'series' })),
  };
  const reportService = {
    listReports: jest.fn(async () => [{ periodType: 'WEEK' }]),
    getReport: jest.fn(async () => ({ periodType: 'MONTH' })),
  };

  return {
    metaService,
    metricsService,
    reportService,
    resolver: new CrmAnalyticsResolver(
      metaService as unknown as CrmAnalyticsMetaService,
      metricsService as unknown as CrmAnalyticsMetricsService,
      reportService as unknown as CrmAnalyticsReportService,
    ),
  };
};

describe('CrmAnalyticsResolver', () => {
  describe('decorators', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, CrmAnalyticsResolver);

    it('accepts only a workspace user session', () => {
      expect(guards).toHaveLength(2);
      expect(
        Reflect.getMetadata(AUTH_PRINCIPAL_GUARD_CONFIG_KEY, guards[0]),
      ).toEqual({
        userSession: {
          standard: true,
          impersonated: true,
          playground: false,
          workspaceAgnostic: false,
        },
        apiKey: false,
        oauthClient: false,
        application: false,
      });
    });

    it('checks the EXPORT_CSV flag', async () => {
      const userHasWorkspaceSettingPermission = jest.fn(async () => true);
      const permissionGuard = new guards[1]({
        userHasWorkspaceSettingPermission,
      });

      jest.spyOn(GqlExecutionContext, 'create').mockReturnValue({
        getContext: () => ({
          req: {
            workspace: { id: 'workspace-id', activationStatus: 'ACTIVE' },
            userWorkspaceId: 'user-workspace-id',
          },
        }),
      } as unknown as GqlExecutionContext);

      await expect(permissionGuard.canActivate({})).resolves.toBe(true);
      expect(userHasWorkspaceSettingPermission).toHaveBeenCalledWith(
        expect.objectContaining({
          setting: PermissionFlagType.EXPORT_CSV,
          workspaceId: 'workspace-id',
        }),
      );
    });

    it('sits in the core schema with the permission and auth filters', () => {
      expect(
        Reflect.getMetadata(RESOLVER_SCHEMA_SCOPE_KEY, CrmAnalyticsResolver),
      ).toBe('core');
      expect(
        Reflect.getMetadata(EXCEPTION_FILTERS_METADATA, CrmAnalyticsResolver),
      ).toEqual([
        AuthGraphqlApiExceptionFilter,
        PermissionsGraphqlApiExceptionFilter,
        PreventNestToAutoLogGraphqlErrorsFilter,
      ]);
    });

    it.each([
      'getCrmAnalyticsMeta',
      'getCrmAnalyticsOverview',
      'getCrmAnalyticsFunnel',
      'getCrmAnalyticsCategories',
      'getCrmAnalyticsTrends',
      'getCrmAnalyticsSeries',
      'getCrmAnalyticsReports',
      'getCrmAnalyticsReport',
    ] as const)('exposes %s as a query', (queryName) => {
      expect(
        Reflect.getMetadata(
          'graphql:resolver_type',
          CrmAnalyticsResolver.prototype[queryName],
        ),
      ).toBe('Query');
    });
  });

  describe('filter parsing', () => {
    it.each([
      [
        'getCrmAnalyticsOverview',
        (resolver: CrmAnalyticsResolver) =>
          resolver.getCrmAnalyticsOverview(WORKSPACE, { status: 'BAD' }),
      ],
      [
        'getCrmAnalyticsFunnel',
        (resolver: CrmAnalyticsResolver) =>
          resolver.getCrmAnalyticsFunnel(WORKSPACE, { dateFrom: 'yesterday' }),
      ],
      [
        'getCrmAnalyticsCategories',
        (resolver: CrmAnalyticsResolver) =>
          resolver.getCrmAnalyticsCategories(
            WORKSPACE,
            { period: 'YEAR' },
            'SOURCE',
          ),
      ],
      [
        'getCrmAnalyticsTrends',
        (resolver: CrmAnalyticsResolver) =>
          resolver.getCrmAnalyticsTrends(
            WORKSPACE,
            { trackKey: 'x'.repeat(201) },
            'TOTAL_CONTACTS',
          ),
      ],
      [
        'getCrmAnalyticsSeries',
        (resolver: CrmAnalyticsResolver) =>
          resolver.getCrmAnalyticsSeries(WORKSPACE, { period: 'YEAR' }, []),
      ],
    ])('rejects a bad filter on %s before any read', async (_name, query) => {
      const { resolver, metricsService } = setup();

      await expect(query(resolver)).rejects.toBeInstanceOf(UserInputError);

      Object.values(metricsService).forEach((method) =>
        expect(method).not.toHaveBeenCalled(),
      );
    });

    it('rejects bad arguments before any read', async () => {
      const { resolver, metricsService, reportService } = setup();

      await expect(
        resolver.getCrmAnalyticsCategories(WORKSPACE, {}, 'POSITION'),
      ).rejects.toBeInstanceOf(UserInputError);
      await expect(
        resolver.getCrmAnalyticsTrends(WORKSPACE, {}, 'REVENUE'),
      ).rejects.toBeInstanceOf(UserInputError);
      await expect(
        resolver.getCrmAnalyticsTrends(
          WORKSPACE,
          {},
          'STAGE_COUNT',
          'x'.repeat(201),
        ),
      ).rejects.toBeInstanceOf(UserInputError);
      await expect(
        resolver.getCrmAnalyticsReport(WORKSPACE, 'DAY', '2026-11-01'),
      ).rejects.toBeInstanceOf(UserInputError);
      await expect(
        resolver.getCrmAnalyticsReport(WORKSPACE, 'WEEK', 'last week'),
      ).rejects.toBeInstanceOf(UserInputError);

      expect(metricsService.getCategories).not.toHaveBeenCalled();
      expect(metricsService.getTrends).not.toHaveBeenCalled();
      expect(reportService.getReport).not.toHaveBeenCalled();
    });

    it('rejects more than 40 resulting series before any read', async () => {
      const { resolver, metricsService } = setup();

      await expect(
        resolver.getCrmAnalyticsSeries(
          WORKSPACE,
          {},
          new Array<{ metric: string; groupBy: string }>(9).fill({
            metric: 'TOTAL_CONTACTS',
            groupBy: 'TRACK',
          }),
        ),
      ).rejects.toBeInstanceOf(UserInputError);

      expect(metricsService.getSeries).not.toHaveBeenCalled();
    });

    it('hands the parsed series requests to the service', async () => {
      const { resolver, metricsService } = setup();

      await expect(
        resolver.getCrmAnalyticsSeries(WORKSPACE, { period: 'MONTH' }, [
          { metric: 'NEW_APPLICATIONS', groupBy: 'TRACK' },
        ]),
      ).resolves.toEqual({ payload: { view: 'series' } });

      expect(metricsService.getSeries).toHaveBeenCalledWith({
        workspaceId: 'workspace-id',
        filter: { ...PARSED_DEFAULT_FILTER, period: 'MONTH' },
        requests: [
          { metric: 'NEW_APPLICATIONS', stageKey: null, groupBy: 'TRACK' },
        ],
      });
    });

    it('hands the parsed values to the services', async () => {
      const { resolver, metricsService, reportService } = setup();

      await resolver.getCrmAnalyticsOverview(WORKSPACE, {});
      await resolver.getCrmAnalyticsFunnel(WORKSPACE, {
        dateFrom: '2026-11-01',
        status: 'ACTIVE',
      });
      await resolver.getCrmAnalyticsCategories(WORKSPACE, {}, 'SOURCE');
      await resolver.getCrmAnalyticsTrends(
        WORKSPACE,
        { period: 'MONTH' },
        'STAGE_COUNT',
        'CONTACTED',
      );
      await resolver.getCrmAnalyticsTrends(WORKSPACE, {}, 'TOTAL_CONTACTS');
      await resolver.getCrmAnalyticsReport(WORKSPACE, 'MONTH', '2026-11-01');

      expect(metricsService.getOverview).toHaveBeenCalledWith({
        workspaceId: 'workspace-id',
        filter: PARSED_DEFAULT_FILTER,
      });
      expect(metricsService.getFunnel).toHaveBeenCalledWith({
        workspaceId: 'workspace-id',
        filter: {
          ...PARSED_DEFAULT_FILTER,
          dateFrom: '2026-11-01',
          status: 'ACTIVE',
        },
      });
      expect(metricsService.getCategories).toHaveBeenCalledWith({
        workspaceId: 'workspace-id',
        filter: PARSED_DEFAULT_FILTER,
        groupBy: 'SOURCE',
      });
      expect(metricsService.getTrends).toHaveBeenNthCalledWith(1, {
        workspaceId: 'workspace-id',
        filter: { ...PARSED_DEFAULT_FILTER, period: 'MONTH' },
        metric: 'STAGE_COUNT',
        stageKey: 'CONTACTED',
      });
      expect(metricsService.getTrends).toHaveBeenNthCalledWith(2, {
        workspaceId: 'workspace-id',
        filter: PARSED_DEFAULT_FILTER,
        metric: 'TOTAL_CONTACTS',
        stageKey: null,
      });
      expect(reportService.getReport).toHaveBeenCalledWith({
        workspaceId: 'workspace-id',
        periodType: 'MONTH',
        periodStart: '2026-11-01',
      });
    });
  });

  describe('payloads', () => {
    it('wraps each service result in one payload field', async () => {
      const { resolver } = setup();

      await expect(resolver.getCrmAnalyticsMeta(WORKSPACE)).resolves.toEqual({
        payload: { state: 'READY' },
      });
      await expect(
        resolver.getCrmAnalyticsOverview(WORKSPACE, {}),
      ).resolves.toEqual({ payload: { view: 'overview' } });
      await expect(resolver.getCrmAnalyticsReports(WORKSPACE)).resolves.toEqual(
        { payload: [{ periodType: 'WEEK' }] },
      );
    });

    it('passes a switched-off null straight through', async () => {
      const { resolver, metricsService } = setup();

      metricsService.getFunnel.mockResolvedValueOnce(
        null as unknown as { view: string },
      );

      await expect(
        resolver.getCrmAnalyticsFunnel(WORKSPACE, {}),
      ).resolves.toEqual({ payload: null });
    });
  });
});
