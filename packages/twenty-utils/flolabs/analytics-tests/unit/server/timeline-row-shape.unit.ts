// The integration and seed layers write their timeline rows by hand. This runs the CRM's
// real write path, event to row, and compares, so a shape change cannot go unseen there.
// live/timeline-checks.test.mjs is the same question against a running CRM.
import { type ObjectRecordBaseEvent } from 'twenty-shared/database-events';
import { FieldMetadataType } from 'twenty-shared/types';
import { type TimelineActivityTypeSnapshot } from 'twenty-shared/timeline';

import { objectRecordChangedValues } from 'src/engine/core-modules/event-emitter/utils/object-record-changed-values';
import { objectRecordDiffMerge } from 'src/engine/core-modules/event-emitter/utils/object-record-diff-merge';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { getFlatFieldMetadataMock } from 'src/engine/metadata-modules/flat-field-metadata/__mocks__/get-flat-field-metadata.mock';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { getFlatObjectMetadataMock } from 'src/engine/metadata-modules/flat-object-metadata/__mocks__/get-flat-object-metadata.mock';
import { type WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { CrmAnalyticsFacadeService } from 'src/modules/analytics/facade/crm-analytics-facade.service';
import { TimelineActivityRepository } from 'src/modules/timeline/repositories/timeline-activity.repository';
import { type TimelineActivityRoutingPlanService } from 'src/modules/timeline/services/timeline-activity-routing-plan.service';
import { type TimelineActivityTargetQueryService } from 'src/modules/timeline/services/timeline-activity-target-query.service';
import { TimelineActivityService } from 'src/modules/timeline/services/timeline-activity.service';
import { buildTimelineActivitySelfRule } from 'src/modules/timeline/utils/build-timeline-activity-self-rule.util';

import { createFixtures } from '../../integration/lib/crm-tables.cjs';

const WORKSPACE_ID = '20202020-0000-4000-8000-000000000001';
const MEMBER_ID = '20202020-0000-4000-8000-000000000002';
const TYPE_ID = '20202020-0000-4000-8000-000000000003';
const PERSON_A = '20202020-0000-4000-8000-00000000000a';
const PERSON_B = '20202020-0000-4000-8000-00000000000b';
const PERSON_C = '20202020-0000-4000-8000-00000000000c';
const RECENT_ROW_ID = '20202020-0000-4000-8000-0000000000aa';
const CHANGED_AT = '2026-11-01T10:00:00.000Z';

const stageField = getFlatFieldMetadataMock({
  id: 'stage-field-id',
  universalIdentifier: 'stage-field-universal-identifier',
  objectMetadataId: 'person-object-id',
  name: 'stage',
  type: FieldMetadataType.SELECT,
});

const flatPerson = getFlatObjectMetadataMock({
  id: 'person-object-id',
  universalIdentifier: 'person-object-universal-identifier',
  nameSingular: 'person',
  namePlural: 'people',
  fieldIds: [stageField.id],
  isAuditLogged: true,
  isSystem: false,
});

const flatFieldMetadataMaps: FlatEntityMaps<FlatFieldMetadata> = {
  byUniversalIdentifier: { [stageField.universalIdentifier]: stageField },
  universalIdentifierById: {
    [stageField.id]: stageField.universalIdentifier,
  },
  universalIdentifiersByApplicationId: {},
};

const TYPE_SNAPSHOT: TimelineActivityTypeSnapshot = {
  id: TYPE_ID,
  universalIdentifier: '20202020-0000-4000-8000-000000000004',
  name: 'recordUpdated',
  label: 'was updated by',
  action: 'updated',
  icon: 'IconPencil',
  objectUniversalIdentifier: null,
  frontComponentUniversalIdentifier: null,
};

// What the CRM's query runner emits for an update, with the real diff.
const buildUpdateEvent = ({
  personId = PERSON_A,
  before,
  after,
  isFromApiKey = false,
}: {
  personId?: string;
  before: string | null;
  after: string | null;
  isFromApiKey?: boolean;
}) =>
  ({
    recordId: personId,
    workspaceMemberId: isFromApiKey ? undefined : MEMBER_ID,
    properties: {
      before: { id: personId, stage: before, updatedAt: '2026-11-01T09:00:00.000Z' },
      after: { id: personId, stage: after, updatedAt: CHANGED_AT },
      updatedFields: ['stage'],
      diff: objectRecordChangedValues(
        { stage: before },
        { stage: after },
        flatPerson,
        flatFieldMetadataMaps,
      ),
    },
  }) as unknown as ObjectRecordBaseEvent;

const buildCreateEvent = ({ personId, stage }: { personId: string; stage: string }) =>
  ({
    recordId: personId,
    workspaceMemberId: MEMBER_ID,
    properties: {
      after: { id: personId, stage, createdAt: CHANGED_AT, updatedAt: CHANGED_AT },
    },
  }) as unknown as ObjectRecordBaseEvent;

const buildTimelineWriter = ({
  recentRows = [],
  nonAuditLoggedFieldNames = new Set<string>(),
}: {
  recentRows?: Record<string, unknown>[];
  nonAuditLoggedFieldNames?: ReadonlySet<string>;
} = {}) => {
  const update = jest.fn().mockResolvedValue(undefined);
  const insert = jest.fn().mockResolvedValue(undefined);
  const repository = {
    find: jest.fn().mockResolvedValue(recentRows),
    update,
    insert,
  };
  const workspaceOrmManager = {
    executeInWorkspaceContext: jest.fn(async (work: () => Promise<unknown>) => work()),
    runInWorkspaceTransaction: jest.fn(
      async (
        work: (scope: {
          getRepository: () => typeof repository;
          executeRawQuery: () => Promise<never[]>;
        }) => Promise<void>,
      ) =>
        work({
          getRepository: () => repository,
          executeRawQuery: jest.fn().mockResolvedValue([]),
        }),
    ),
    getRepository: jest.fn(() => repository),
  } as unknown as WorkspaceOrmManager;

  const selfRule = buildTimelineActivitySelfRule({
    flatObjectMetadata: flatPerson,
    timelineActivityTypes: [],
  });

  const routingPlanService = {
    getRulesForEventBatch: jest.fn().mockResolvedValue({
      sourceRules: [selfRule],
      junctionRules: [],
      nonAuditLoggedFieldNames,
      flatFieldMetadataMaps,
      resolveTimelineActivityType: () => ({ id: TYPE_ID, snapshot: TYPE_SNAPSHOT }),
    }),
  } as unknown as TimelineActivityRoutingPlanService;

  const service = new TimelineActivityService(
    new TimelineActivityRepository(workspaceOrmManager),
    workspaceOrmManager,
    routingPlanService,
    {} as TimelineActivityTargetQueryService,
  );

  const write = (action: 'updated' | 'created', events: ObjectRecordBaseEvent[]) =>
    service.upsertEvents({
      name: `person.${action}`,
      workspaceId: WORKSPACE_ID,
      objectMetadata: flatPerson,
      events,
    } as unknown as Parameters<TimelineActivityService['upsertEvents']>[0]);

  return { write, insert, update, repository };
};

const insertedRows = (insert: jest.Mock) => insert.mock.calls.flatMap(([rows]) => rows);

// The rows the integration and seed layers put in the table, captured instead of sent.
const captureFixtureWrites = () => {
  const statements: { sql: string; parameters: unknown[] }[] = [];
  const fixtures = createFixtures({
    query: async (sql: string, parameters: unknown[]) => {
      statements.push({ sql, parameters });

      return sql.startsWith('SELECT properties')
        ? [{ properties: { diff: { stage: { before: 'NEW', after: 'CONTACTED' } } } }]
        : [{ id: RECENT_ROW_ID }];
    },
    workspace: {
      schemaName: 'workspace_test',
      table: (tableName: string) => `"workspace_test"."${tableName}"`,
    },
    objectRecordDiffMerge,
  });

  return { fixtures, statements };
};

const columnsOf = (insertSql: string) =>
  [...insertSql.slice(insertSql.indexOf('('), insertSql.indexOf(')')).matchAll(/[A-Za-z]+/g)].map(
    ([column]) => column,
  );

describe('a real stage change, event to row', () => {
  it('writes the row shape the sync reads (T1)', async () => {
    const { write, insert, update } = buildTimelineWriter();

    await write('updated', [buildUpdateEvent({ before: 'NEW', after: 'CONTACTED' })]);

    expect(update).not.toHaveBeenCalled();
    expect(insertedRows(insert)).toHaveLength(1);

    const [row] = insertedRows(insert);

    expect(row.properties).toEqual({
      diff: { stage: { before: 'NEW', after: 'CONTACTED' } },
    });
    expect(row.targetPersonId).toBe(PERSON_A);
    expect(row.workspaceMemberId).toBe(MEMBER_ID);
    expect(row.linkedRecordId).toBeUndefined();
    expect(row.happensAt).toEqual(new Date(CHANGED_AT));
  });

  it('matches what the integration fixture writes, field by field', async () => {
    const { write, insert } = buildTimelineWriter();

    await write('updated', [buildUpdateEvent({ before: 'NEW', after: 'CONTACTED' })]);

    const [realRow] = insertedRows(insert);
    const { fixtures, statements } = captureFixtureWrites();

    await fixtures.insertStageChange({
      personId: PERSON_A,
      before: 'NEW',
      after: 'CONTACTED',
      happensAt: CHANGED_AT,
    });

    const [{ sql, parameters }] = statements;
    const columns = columnsOf(sql.slice(sql.indexOf('"timelineActivity"') + 18));
    const fixtureRow = Object.fromEntries(
      columns.map((column, index) => [column, parameters[index]]),
    );

    expect(JSON.parse(fixtureRow.properties as string)).toEqual(realRow.properties);
    expect(fixtureRow.targetPersonId).toBe(realRow.targetPersonId);
    expect(fixtureRow.linkedRecordId ?? null).toBe(realRow.linkedRecordId ?? null);
    expect(new Date(fixtureRow.happensAt as string)).toEqual(realRow.happensAt);

    // createdAt and updatedAt are not in the insert: the CRM's query builder sets them.
    const realColumns = [...Object.keys(realRow), 'createdAt', 'updatedAt'];

    for (const column of columns) {
      expect(realColumns).toContain(column);
    }
  });

  it('merges a second change into the same row, as the fixture does (T2)', async () => {
    const recentRow = {
      id: RECENT_ROW_ID,
      targetPersonId: PERSON_A,
      workspaceMemberId: MEMBER_ID,
      timelineActivityTypeId: TYPE_ID,
      timelineActivityTypeSnapshot: TYPE_SNAPSHOT,
      linkedRecordId: null,
      properties: { diff: { stage: { before: 'NEW', after: 'CONTACTED' } } },
    };
    const { write, insert, update } = buildTimelineWriter({ recentRows: [recentRow] });

    await write('updated', [buildUpdateEvent({ before: 'CONTACTED', after: 'ATTENDED' })]);

    expect(insert).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);

    const [rowId, changes] = update.mock.calls[0];

    expect(rowId).toBe(RECENT_ROW_ID);
    expect(changes.properties).toEqual({
      diff: { stage: { before: 'NEW', after: 'ATTENDED' } },
    });
    // The merge leaves happensAt alone, which is why a merged move takes source_updated_at.
    expect(changes).not.toHaveProperty('happensAt');

    const { fixtures, statements } = captureFixtureWrites();

    await fixtures.mergeStageChange({
      rowId: RECENT_ROW_ID,
      after: 'ATTENDED',
      updatedAt: CHANGED_AT,
    });

    expect(JSON.parse(statements[1].parameters[1] as string)).toEqual(changes.properties);
    expect(statements[1].sql).toMatch(/SET properties = .*"updatedAt" = /s);
    expect(statements[1].sql).not.toContain('happensAt');
  });

  it('keeps a change that went back on itself as before equal to after (T3)', async () => {
    const recentRow = {
      id: RECENT_ROW_ID,
      targetPersonId: PERSON_A,
      workspaceMemberId: MEMBER_ID,
      timelineActivityTypeId: TYPE_ID,
      timelineActivityTypeSnapshot: TYPE_SNAPSHOT,
      linkedRecordId: null,
      properties: { diff: { stage: { before: 'NEW', after: 'CONTACTED' } } },
    };
    const { write, update } = buildTimelineWriter({ recentRows: [recentRow] });

    await write('updated', [buildUpdateEvent({ before: 'CONTACTED', after: 'NEW' })]);

    expect(update.mock.calls[0][1].properties).toEqual({
      diff: { stage: { before: 'NEW', after: 'NEW' } },
    });
  });

  it('does not merge an API key change into a member row (T5)', async () => {
    const memberRow = {
      id: RECENT_ROW_ID,
      targetPersonId: PERSON_A,
      workspaceMemberId: MEMBER_ID,
      timelineActivityTypeId: TYPE_ID,
      timelineActivityTypeSnapshot: TYPE_SNAPSHOT,
      linkedRecordId: null,
      properties: { diff: { stage: { before: 'NEW', after: 'CONTACTED' } } },
    };
    const { write, insert, update } = buildTimelineWriter({ recentRows: [memberRow] });

    await write('updated', [
      buildUpdateEvent({
        before: 'CONTACTED',
        after: 'ATTENDED',
        isFromApiKey: true,
      }),
    ]);

    expect(update).not.toHaveBeenCalled();
    expect(insertedRows(insert)).toHaveLength(1);
    expect(insertedRows(insert)[0].workspaceMemberId).toBeUndefined();
    expect(insertedRows(insert)[0].properties.diff.stage).toEqual({
      before: 'CONTACTED',
      after: 'ATTENDED',
    });
  });

  it('writes one row per person for a bulk update (T6)', async () => {
    const { write, insert } = buildTimelineWriter();

    await write(
      'updated',
      [PERSON_A, PERSON_B, PERSON_C].map((personId) =>
        buildUpdateEvent({ personId, before: 'NEW', after: 'CONTACTED' }),
      ),
    );

    expect(insertedRows(insert).map((row) => row.targetPersonId).sort()).toEqual([
      PERSON_A,
      PERSON_B,
      PERSON_C,
    ]);
  });

  it('stores nothing a creation row could be read from (T9)', async () => {
    const { write, insert } = buildTimelineWriter();

    await write('created', [buildCreateEvent({ personId: PERSON_A, stage: 'NEW' })]);

    expect(insertedRows(insert)).toHaveLength(1);
    expect(insertedRows(insert)[0].properties).toEqual({});
  });

  // The stop rule in contract section 9: with stage not audit logged, the funnel has no rows.
  it('writes no row when stage is not audit logged', async () => {
    const { write, insert, update } = buildTimelineWriter({
      nonAuditLoggedFieldNames: new Set(['stage']),
    });

    await write('updated', [buildUpdateEvent({ before: 'NEW', after: 'CONTACTED' })]);

    expect(insert).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});

describe('the facade reads what the CRM writes', () => {
  const sql = new CrmAnalyticsFacadeService(
    {} as never,
    {} as never,
  ).buildStageChangeRelationSql({
    state: { workspaceId: WORKSPACE_ID } as never,
    updatedSinceParameter: '$2',
    happenedSinceParameter: '$3',
  });

  it('selects by the same columns and JSON path the real row carries', async () => {
    const { write, insert } = buildTimelineWriter();

    await write('updated', [buildUpdateEvent({ before: 'NEW', after: 'CONTACTED' })]);

    const [row] = insertedRows(insert);

    expect(sql).toContain(`t."targetPersonId" IS NOT NULL`);
    expect(row.targetPersonId).not.toBeUndefined();
    expect(sql).toContain(`t."linkedRecordId" IS NULL`);
    expect(row.linkedRecordId ?? null).toBeNull();
    expect(sql).toContain(`t.properties->'diff' ? 'stage'`);
    expect(Object.keys(row.properties.diff)).toContain('stage');
    expect(sql).toContain(`t.properties->'diff'->'stage'->>'before'`);
    expect(sql).toContain(`t.properties->'diff'->'stage'->>'after'`);
    expect(Object.keys(row.properties.diff.stage).sort()).toEqual(['after', 'before']);
  });

  it('skips a creation row, whose properties hold no diff', async () => {
    const { write, insert } = buildTimelineWriter();

    await write('created', [buildCreateEvent({ personId: PERSON_A, stage: 'NEW' })]);

    expect(insertedRows(insert)[0].properties).not.toHaveProperty('diff');
  });
});
