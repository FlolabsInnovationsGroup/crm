import { MODULE_METADATA } from '@nestjs/common/constants';
import { type Provider, type Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { UserVarsModule } from 'src/engine/core-modules/user/user-vars/user-vars.module';
import { WorkspaceManyOrAllFlatEntityMapsCacheModule } from 'src/engine/metadata-modules/flat-entity/services/workspace-many-or-all-flat-entity-maps-cache.module';
import { PermissionsModule } from 'src/engine/metadata-modules/permissions/permissions.module';
import { CrmAnalyticsCronCommand } from 'src/modules/analytics/crons/commands/crm-analytics.cron.command';
import { CrmAnalyticsModule } from 'src/modules/analytics/crm-analytics.module';

// It reaches a build output, twenty-client-sdk, that jest here does not have.
jest.mock('src/engine/metadata-modules/permissions/permissions.module', () => ({
  PermissionsModule: class PermissionsModule {},
}));

// This module loads in the server, the worker and the schema build, so a provider Nest
// cannot build stops the whole CRM. A mistake such as `import { type Service }` on a
// constructor parameter compiles and only fails at boot, which this catches earlier.
const readModule = <TValue>(key: string, moduleClass: Type<unknown>): TValue[] =>
  Reflect.getMetadata(key, moduleClass) ?? [];

const nameOf = (token: unknown) =>
  typeof token === 'function' ? token.name : String(token);

const SECTION_2_CLASSES = [
  'CrmAnalyticsCronCommand',
  'CrmAnalyticsDailyCronJob',
  'CrmAnalyticsDatabaseService',
  'CrmAnalyticsFacadeService',
  'CrmAnalyticsMetaService',
  'CrmAnalyticsMetricsService',
  'CrmAnalyticsReportService',
  'CrmAnalyticsResolver',
  'CrmAnalyticsRunCommand',
  'CrmAnalyticsSettingsService',
  'CrmAnalyticsSnapshotService',
  'CrmAnalyticsSyncCronJob',
  'CrmAnalyticsSyncService',
  'CrmAnalyticsWorkspaceDailyJob',
  'CrmAnalyticsWorkspaceSyncJob',
];

// Each one needs a module imported above or a global one. A new name here is a new way
// to stop the CRM from booting, so check where it comes from before adding it.
const FROM_READABLE_IMPORTED_MODULES = [
  'UserVarsService',
  'WorkspaceManyOrAllFlatEntityMapsCacheService',
];
const FROM_PERMISSIONS_MODULE = ['PermissionsService'];
const FROM_TYPEORM_FOR_FEATURE = ['WorkspaceEntityRepository'];
const FROM_GLOBAL_MODULES = [
  'DataSource',
  'ExceptionHandlerService',
  'MESSAGE_QUEUE_cron-queue',
  'MESSAGE_QUEUE_workspace-queue',
  'WorkspaceOrmManager',
];

// Nest itself reads these from anything it holds, so reading them means nothing.
const READ_BY_NEST = new Set([
  'then',
  'constructor',
  'onModuleInit',
  'onApplicationBootstrap',
  'onModuleDestroy',
  'beforeApplicationShutdown',
  'onApplicationShutdown',
]);

// An empty object hid a provider that only reads a dependency while it is built: the read
// gave undefined and the build went on. This one reports every read.
const watchedDependency = (token: unknown, touched: string[]) =>
  new Proxy(
    {},
    {
      get: (_target, property) => {
        if (typeof property === 'string' && !READ_BY_NEST.has(property)) {
          touched.push(`${nameOf(token)}.${property}`);
        }

        return undefined;
      },
    },
  );

describe('CrmAnalyticsModule', () => {
  const providers = readModule<Provider>(
    MODULE_METADATA.PROVIDERS,
    CrmAnalyticsModule,
  );

  it('provides every class of contract section 2 and nothing else', () => {
    expect(providers.map(nameOf).sort()).toEqual(SECTION_2_CLASSES);
  });

  it('exports only the cron command, for the register-all command', () => {
    expect(
      readModule(MODULE_METADATA.EXPORTS, CrmAnalyticsModule),
    ).toEqual([CrmAnalyticsCronCommand]);
  });

  it('imports the modules of contract section 2', () => {
    const imported = readModule<unknown>(
      MODULE_METADATA.IMPORTS,
      CrmAnalyticsModule,
    );

    expect(imported).toEqual(
      expect.arrayContaining([
        PermissionsModule,
        UserVarsModule,
        WorkspaceManyOrAllFlatEntityMapsCacheModule,
      ]),
    );
    expect(imported).toHaveLength(4);

    const typeOrmFeature = imported.find(
      (candidate) =>
        typeof candidate === 'object' &&
        nameOf((candidate as { module: unknown }).module) === 'TypeOrmModule',
    ) as { providers: { provide: unknown }[] };

    expect(typeOrmFeature.providers.map(({ provide }) => nameOf(provide))).toEqual(
      FROM_TYPEORM_FOR_FEATURE,
    );
  });

  it('the imported modules export what it needs from them', () => {
    const exported = [
      UserVarsModule,
      WorkspaceManyOrAllFlatEntityMapsCacheModule,
    ].flatMap((moduleClass) =>
      readModule<unknown>(MODULE_METADATA.EXPORTS, moduleClass).map(nameOf),
    );

    expect(exported).toEqual(
      expect.arrayContaining(FROM_READABLE_IMPORTED_MODULES),
    );
  });

  it('Nest can build every provider, and needs nothing unexpected from outside', async () => {
    const asked = new Set<string>();

    await Test.createTestingModule({ providers })
      .useMocker((token) => {
        asked.add(nameOf(token));

        return watchedDependency(token, []);
      })
      .compile();

    expect([...asked].sort()).toEqual(
      [
        ...FROM_READABLE_IMPORTED_MODULES,
        ...FROM_PERMISSIONS_MODULE,
        ...FROM_TYPEORM_FOR_FEATURE,
        ...FROM_GLOBAL_MODULES,
      ].sort(),
    );
  });

  // Building these runs in the server, the worker and the schema build, before any
  // request. A provider that reads a dependency that early can stop all three when that
  // dependency is not ready, and only a real boot would show it (boot/boot-checks.mjs).
  it('no provider touches a dependency while it is built or started', async () => {
    const touched: string[] = [];
    const testingModule = await Test.createTestingModule({ providers })
      .useMocker((token) => watchedDependency(token, touched))
      .compile();

    await testingModule.init();

    expect(touched).toEqual([]);

    await testingModule.close();
  });

  it('every provider is really constructed, with every dependency filled in', async () => {
    const testingModule = await Test.createTestingModule({ providers })
      .useMocker((token) => watchedDependency(token, []))
      .compile();

    for (const provider of providers as Type<unknown>[]) {
      const instance = testingModule.get(provider, { strict: false });

      expect(instance).toBeInstanceOf(provider);

      const parameterTypes: unknown[] =
        Reflect.getMetadata('design:paramtypes', provider) ?? [];

      // A type-only import compiles, and leaves this undefined only at boot.
      expect(parameterTypes).not.toContain(undefined);

      for (const [name, value] of Object.entries(instance as object)) {
        expect(`${provider.name}.${name}: ${value === undefined}`).toBe(
          `${provider.name}.${name}: false`,
        );
      }
    }
  });
});
