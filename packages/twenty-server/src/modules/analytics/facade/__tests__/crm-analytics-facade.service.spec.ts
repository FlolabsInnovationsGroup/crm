import { TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER } from 'twenty-shared/application';
import { FieldMetadataType, RelationType } from 'twenty-shared/types';
import { WorkspaceActivationStatus } from 'twenty-shared/workspace';
import { type Repository } from 'typeorm';

import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { type WorkspaceManyOrAllFlatEntityMapsCacheService } from 'src/engine/metadata-modules/flat-entity/services/workspace-many-or-all-flat-entity-maps-cache.service';
import { getFlatFieldMetadataMock } from 'src/engine/metadata-modules/flat-field-metadata/__mocks__/get-flat-field-metadata.mock';
import { getFlatObjectMetadataMock } from 'src/engine/metadata-modules/flat-object-metadata/__mocks__/get-flat-object-metadata.mock';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { CrmAnalyticsFacadeService } from 'src/modules/analytics/facade/crm-analytics-facade.service';
import { type CrmAnalyticsCrmState } from 'src/modules/analytics/types/crm-analytics-crm-state.type';

const WORKSPACE_ID = '20202020-0000-4000-8000-000000000001';
const SCHEMA_NAME = getWorkspaceSchemaName(WORKSPACE_ID);

type FakeField = {
  name: string;
  type: FieldMetadataType;
  isAuditLogged?: boolean;
  options?: { value: string; label: string; position: number; color: 'gray' }[];
};

type FakeObject = {
  nameSingular: string;
  isStandard?: boolean;
  fields?: FakeField[];
};

const buildFlatMaps = (objects: FakeObject[]) => {
  const flatObjectMetadataMaps = {
    byUniversalIdentifier: {} as Record<string, unknown>,
    universalIdentifierById: {} as Record<string, string>,
    universalIdentifiersByApplicationId: {},
  };
  const flatFieldMetadataMaps = {
    byUniversalIdentifier: {} as Record<string, unknown>,
    universalIdentifierById: {} as Record<string, string>,
    universalIdentifiersByApplicationId: {},
  };

  for (const { nameSingular, isStandard, fields = [] } of objects) {
    const objectId = `${nameSingular}-id`;

    const flatFields = fields.map(({ name, type, isAuditLogged, options }) =>
      getFlatFieldMetadataMock({
        id: `${nameSingular}-${name}-id`,
        universalIdentifier: `${nameSingular}-${name}-universal-identifier`,
        objectMetadataId: objectId,
        name,
        type,
        isAuditLogged: isAuditLogged ?? true,
        options: options ?? null,
        settings:
          type === FieldMetadataType.RELATION
            ? { relationType: RelationType.MANY_TO_ONE }
            : null,
      }),
    );

    for (const flatField of flatFields) {
      flatFieldMetadataMaps.byUniversalIdentifier[
        flatField.universalIdentifier
      ] = flatField;
      flatFieldMetadataMaps.universalIdentifierById[flatField.id] =
        flatField.universalIdentifier;
    }

    const universalIdentifier = `${nameSingular}-universal-identifier`;

    flatObjectMetadataMaps.byUniversalIdentifier[universalIdentifier] =
      getFlatObjectMetadataMock({
        id: objectId,
        universalIdentifier,
        nameSingular,
        namePlural: `${nameSingular}Plural`,
        fieldIds: flatFields.map((flatField) => flatField.id),
        applicationUniversalIdentifier: isStandard
          ? TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER
          : 'custom-application-universal-identifier',
      });
    flatObjectMetadataMaps.universalIdentifierById[objectId] =
      universalIdentifier;
  }

  return { flatObjectMetadataMaps, flatFieldMetadataMaps };
};

const buildFacade = (
  objects: FakeObject[] = [],
  find: jest.Mock = jest.fn(),
) =>
  new CrmAnalyticsFacadeService(
    { find } as unknown as Repository<WorkspaceEntity>,
    {
      getOrRecomputeManyOrAllFlatEntityMaps: jest
        .fn()
        .mockResolvedValue(buildFlatMaps(objects)),
    } as unknown as WorkspaceManyOrAllFlatEntityMapsCacheService,
  );

const STAGE_OPTIONS = [
  { value: 'NEW', label: 'New', position: 0, color: 'gray' as const },
  { value: 'CONTACTED', label: 'Contacted', position: 1, color: 'gray' as const },
];

const PERSON_WITH_ALL_FIELDS: FakeObject = {
  nameSingular: 'person',
  isStandard: true,
  fields: [
    { name: 'stage', type: FieldMetadataType.SELECT, options: STAGE_OPTIONS },
    {
      name: 'positionsAppliedFor',
      type: FieldMetadataType.MULTI_SELECT,
      options: STAGE_OPTIONS,
    },
    { name: 'applicantSource', type: FieldMetadataType.TEXT },
  ],
};

const FORM_SUBMISSION_OBJECT: FakeObject = {
  nameSingular: 'formSubmission',
  fields: [
    { name: 'submittedAt', type: FieldMetadataType.DATE_TIME },
    { name: 'person', type: FieldMetadataType.RELATION },
    { name: 'form', type: FieldMetadataType.RELATION },
  ],
};

const CRM_FORM_OBJECT: FakeObject = {
  nameSingular: 'crmForm',
  fields: [{ name: 'name', type: FieldMetadataType.TEXT }],
};

const withoutField = (object: FakeObject, fieldName: string): FakeObject => ({
  ...object,
  fields: object.fields?.filter((field) => field.name !== fieldName),
});

const ABSENT_FIELDS_STATE: CrmAnalyticsCrmState = {
  workspaceId: WORKSPACE_ID,
  stage: { status: 'MISSING', isAuditLogged: false, options: [] },
  positionsAppliedFor: { status: 'MISSING', options: [] },
  applicantSource: { status: 'MISSING', options: [] },
  hasFormSubmissionObject: false,
  hasApplicationObject: false,
};

const FULL_STATE: CrmAnalyticsCrmState = {
  workspaceId: WORKSPACE_ID,
  stage: { status: 'OK', isAuditLogged: true, options: [] },
  positionsAppliedFor: { status: 'OK', options: [] },
  applicantSource: { status: 'OK', options: [] },
  hasFormSubmissionObject: true,
  hasApplicationObject: true,
};

describe('CrmAnalyticsFacadeService', () => {
  describe('listActiveWorkspaceIds', () => {
    it('reads active workspaces only and returns their ids', async () => {
      const find = jest
        .fn()
        .mockResolvedValue([{ id: 'workspace-a' }, { id: 'workspace-b' }]);

      await expect(buildFacade([], find).listActiveWorkspaceIds()).resolves.toEqual(
        ['workspace-a', 'workspace-b'],
      );
      expect(find).toHaveBeenCalledWith({
        where: { activationStatus: WorkspaceActivationStatus.ACTIVE },
        select: ['id'],
        order: { id: 'ASC' },
      });
    });
  });

  describe('getCrmState', () => {
    it('reports MISSING without throwing when the fields are absent', async () => {
      await expect(
        buildFacade([{ nameSingular: 'person', isStandard: true }]).getCrmState(
          WORKSPACE_ID,
        ),
      ).resolves.toEqual(ABSENT_FIELDS_STATE);
    });

    it('reports MISSING without throwing when the person object is absent', async () => {
      await expect(buildFacade().getCrmState(WORKSPACE_ID)).resolves.toEqual(
        ABSENT_FIELDS_STATE,
      );
    });

    it('reports WRONG_TYPE and treats the field as having no options', async () => {
      const state = await buildFacade([
        {
          nameSingular: 'person',
          isStandard: true,
          fields: [
            { name: 'stage', type: FieldMetadataType.NUMBER },
            {
              name: 'positionsAppliedFor',
              type: FieldMetadataType.SELECT,
              options: STAGE_OPTIONS,
            },
            { name: 'applicantSource', type: FieldMetadataType.BOOLEAN },
          ],
        },
      ]).getCrmState(WORKSPACE_ID);

      expect(state.stage).toEqual({
        status: 'WRONG_TYPE',
        isAuditLogged: false,
        options: [],
      });
      expect(state.positionsAppliedFor).toEqual({
        status: 'WRONG_TYPE',
        options: [],
      });
      expect(state.applicantSource).toEqual({
        status: 'WRONG_TYPE',
        options: [],
      });
    });

    it('accepts SELECT and TEXT for stage and source, MULTI_SELECT for positions', async () => {
      const state = await buildFacade([PERSON_WITH_ALL_FIELDS]).getCrmState(
        WORKSPACE_ID,
      );

      expect(state.stage.status).toBe('OK');
      expect(state.positionsAppliedFor.status).toBe('OK');
      expect(state.applicantSource).toEqual({ status: 'OK', options: [] });

      const textStageState = await buildFacade([
        {
          nameSingular: 'person',
          isStandard: true,
          fields: [{ name: 'stage', type: FieldMetadataType.TEXT }],
        },
      ]).getCrmState(WORKSPACE_ID);

      expect(textStageState.stage.status).toBe('OK');
    });

    it('returns option values and labels only', async () => {
      const state = await buildFacade([PERSON_WITH_ALL_FIELDS]).getCrmState(
        WORKSPACE_ID,
      );

      expect(state.stage.options).toEqual([
        { value: 'NEW', label: 'New' },
        { value: 'CONTACTED', label: 'Contacted' },
      ]);
    });

    it('reads the audit flag from the stage field', async () => {
      const state = await buildFacade([
        {
          nameSingular: 'person',
          isStandard: true,
          fields: [
            {
              name: 'stage',
              type: FieldMetadataType.SELECT,
              isAuditLogged: false,
            },
          ],
        },
      ]).getCrmState(WORKSPACE_ID);

      expect(state.stage).toMatchObject({ status: 'OK', isAuditLogged: false });
    });

    it('treats form objects as absent when a required field has the wrong type', async () => {
      const { hasFormSubmissionObject } = await buildFacade([
        {
          ...FORM_SUBMISSION_OBJECT,
          fields: [
            { name: 'submittedAt', type: FieldMetadataType.DATE_TIME },
            { name: 'person', type: FieldMetadataType.TEXT },
            { name: 'form', type: FieldMetadataType.RELATION },
          ],
        },
        CRM_FORM_OBJECT,
      ]).getCrmState(WORKSPACE_ID);

      expect(hasFormSubmissionObject).toBe(false);
    });

    it('needs both form objects before reporting form submissions', async () => {
      const { hasFormSubmissionObject: withBoth } = await buildFacade([
        FORM_SUBMISSION_OBJECT,
        CRM_FORM_OBJECT,
      ]).getCrmState(WORKSPACE_ID);
      const { hasFormSubmissionObject: withoutForm } = await buildFacade([
        FORM_SUBMISSION_OBJECT,
      ]).getCrmState(WORKSPACE_ID);
      const { hasFormSubmissionObject: withoutSubmission } = await buildFacade([
        CRM_FORM_OBJECT,
      ]).getCrmState(WORKSPACE_ID);

      expect(withBoth).toBe(true);
      expect(withoutForm).toBe(false);
      expect(withoutSubmission).toBe(false);
    });

    it.each([
      ['formSubmission.submittedAt', 'submittedAt', 'submission'],
      ['formSubmission.form', 'form', 'submission'],
      ['formSubmission.person', 'person', 'submission'],
      ['crmForm.name', 'name', 'form'],
    ])(
      'treats form objects as absent without %s',
      async (_fieldPath, fieldName, objectKind) => {
        const facade = buildFacade(
          objectKind === 'submission'
            ? [withoutField(FORM_SUBMISSION_OBJECT, fieldName), CRM_FORM_OBJECT]
            : [FORM_SUBMISSION_OBJECT, withoutField(CRM_FORM_OBJECT, fieldName)],
        );

        const state = await facade.getCrmState(WORKSPACE_ID);

        expect(state.hasFormSubmissionObject).toBe(false);
        expect(facade.buildApplicationSubmissionRelationSql(state)).toBeNull();
      },
    );

    it('treats form objects stored under another table name as absent', async () => {
      const { hasFormSubmissionObject } = await buildFacade([
        { ...FORM_SUBMISSION_OBJECT, isStandard: true },
        CRM_FORM_OBJECT,
      ]).getCrmState(WORKSPACE_ID);

      expect(hasFormSubmissionObject).toBe(false);
    });

    it('reads whether a form has the configured name', async () => {
      const facade = buildFacade([]);
      const run: jest.MockedFunction<CrmAnalyticsSqlRunner> = jest.fn(
        async () => [{ has_form: false }],
      );

      expect(
        await facade.hasApplicationForm({ state: FULL_STATE, run }),
      ).toBe(false);
      expect(run.mock.calls[0]?.[0]).toContain(
        `f.name IN ('Internship Application')`,
      );
      expect(
        await facade.hasApplicationForm({
          state: ABSENT_FIELDS_STATE,
          run,
        }),
      ).toBe(false);
      expect(run).toHaveBeenCalledTimes(1);
    });

    it('detects the applications object', async () => {
      const { hasApplicationObject } = await buildFacade([
        { nameSingular: 'application' },
      ]).getCrmState(WORKSPACE_ID);

      expect(hasApplicationObject).toBe(true);
    });
  });

  describe('relation SQL', () => {
    it('always starts with SELECT', () => {
      const facade = buildFacade();

      const relations = [
        facade.buildPersonRelationSql(FULL_STATE),
        facade.buildPersonRelationSql(ABSENT_FIELDS_STATE),
        facade.buildStageChangeRelationSql({
          state: FULL_STATE,
          updatedSinceParameter: '$2',
          happenedSinceParameter: '$3',
        }),
        facade.buildApplicationSubmissionRelationSql(FULL_STATE) ?? '',
      ];

      for (const relationSql of relations) {
        expect(relationSql).toMatch(/^SELECT\b/);
      }
    });
  });

  describe('buildPersonRelationSql', () => {
    it('reads the fields that exist', () => {
      const sql = buildFacade().buildPersonRelationSql(FULL_STATE);

      expect(sql).toContain('p."stage"::text AS raw_stage');
      expect(sql).toContain(
        `COALESCE(p."positionsAppliedFor"::text[], '{}'::text[]) AS positions`,
      );
      expect(sql).toContain('p."applicantSource"::text AS source');
      expect(sql).toContain(`FROM "${SCHEMA_NAME}"."person" p`);
      expect(sql).toContain('p."deletedAt" IS NULL');
    });

    it('substitutes NULL and an empty array for absent fields', () => {
      const sql = buildFacade().buildPersonRelationSql(ABSENT_FIELDS_STATE);

      expect(sql).toContain('NULL::text AS raw_stage');
      expect(sql).toContain(`'{}'::text[] AS positions`);
      expect(sql).toContain('NULL::text AS source');
      expect(sql).not.toContain('"stage"');
      expect(sql).not.toContain('"positionsAppliedFor"');
      expect(sql).not.toContain('"applicantSource"');
    });

    it('substitutes for wrong-typed fields as well', () => {
      const sql = buildFacade().buildPersonRelationSql({
        ...FULL_STATE,
        stage: { status: 'WRONG_TYPE', isAuditLogged: false, options: [] },
        positionsAppliedFor: { status: 'WRONG_TYPE', options: [] },
      });

      expect(sql).toContain('NULL::text AS raw_stage');
      expect(sql).toContain(`'{}'::text[] AS positions`);
      expect(sql).toContain('p."applicantSource"::text AS source');
    });
  });

  describe('buildStageChangeRelationSql', () => {
    const sql = buildFacade().buildStageChangeRelationSql({
      state: FULL_STATE,
      updatedSinceParameter: '$2',
      happenedSinceParameter: '$3',
    });

    it('reads the timeline of the workspace', () => {
      expect(sql).toContain(`FROM "${SCHEMA_NAME}"."timelineActivity" t`);
    });

    it('takes both lower bounds as parameters', () => {
      expect(sql).toContain('t."updatedAt" >= $2');
      expect(sql).toContain('t."happensAt" >= $3');
    });

    it('keeps only the stage changes of the person itself', () => {
      expect(sql).toContain('t."targetPersonId" IS NOT NULL');
      expect(sql).toContain('t."linkedRecordId" IS NULL');
      expect(sql).toContain(`t.properties->'diff' ? 'stage'`);
    });

    it('selects before and after from the diff', () => {
      expect(sql).toContain(
        `t.properties->'diff'->'stage'->>'before' AS from_stage`,
      );
      expect(sql).toContain(
        `t.properties->'diff'->'stage'->>'after' AS to_stage`,
      );
    });
  });

  describe('buildApplicationSubmissionRelationSql', () => {
    it('returns null when the form objects are absent', () => {
      expect(
        buildFacade().buildApplicationSubmissionRelationSql(
          ABSENT_FIELDS_STATE,
        ),
      ).toBeNull();
    });

    it('reads custom tables, filtered on the application forms', () => {
      const sql =
        buildFacade().buildApplicationSubmissionRelationSql(FULL_STATE);

      expect(sql).toContain(`"${SCHEMA_NAME}"."_formSubmission" s`);
      expect(sql).toContain(
        `JOIN "${SCHEMA_NAME}"."_crmForm" f ON f.id = s."formId"`,
      );
      expect(sql).toContain('s."deletedAt" IS NULL');
      expect(sql).toContain(`f.name IN ('Internship Application')`);
    });

    it('drops a soft-deleted person and keeps an application with no person', () => {
      const sql =
        buildFacade().buildApplicationSubmissionRelationSql(FULL_STATE);

      expect(sql).toContain(
        `LEFT JOIN "${SCHEMA_NAME}"."person" p ON p.id = s."personId"`,
      );
      expect(sql).toContain(`(s."personId" IS NULL OR p."deletedAt" IS NULL)`);
    });
  });

  describe('countImportedApplications', () => {
    it('returns null without a query when the object is absent', async () => {
      const run = jest.fn();

      await expect(
        buildFacade().countImportedApplications({
          state: ABSENT_FIELDS_STATE,
          run,
        }),
      ).resolves.toBeNull();
      expect(run).not.toHaveBeenCalled();
    });

    it('counts live rows of the custom table', async () => {
      const run = jest.fn().mockResolvedValue([{ total: 42371 }]);

      await expect(
        buildFacade().countImportedApplications({ state: FULL_STATE, run }),
      ).resolves.toBe(42371);
      expect(run.mock.calls[0][0]).toContain(
        `"${SCHEMA_NAME}"."_application"`,
      );
      expect(run.mock.calls[0][0]).toContain('"deletedAt" IS NULL');
    });
  });

  describe('getPersonDisplayNames', () => {
    it('runs no query for an empty list', async () => {
      const run = jest.fn();

      await expect(
        buildFacade().getPersonDisplayNames({
          state: FULL_STATE,
          personIds: [],
          run,
        }),
      ).resolves.toEqual(new Map());
      expect(run).not.toHaveBeenCalled();
    });

    it('asks for at most 100 people, bound as a parameter', async () => {
      const run = jest.fn().mockResolvedValue([]);
      const personIds = Array.from(
        { length: 150 },
        (_value, index) => `person-${index}`,
      );

      await buildFacade().getPersonDisplayNames({
        state: FULL_STATE,
        personIds,
        run,
      });

      const [sql, parameters] = run.mock.calls[0];

      expect(parameters[0]).toHaveLength(100);
      expect(parameters[0]).toEqual(personIds.slice(0, 100));
      expect(sql).toContain('p.id = ANY($1::uuid[])');
      expect(sql).toContain(`"${SCHEMA_NAME}"."person"`);
    });

    it('joins first and last name, and tolerates either being empty', async () => {
      const run = jest.fn().mockResolvedValue([
        { id: 'person-a', first_name: 'Ada', last_name: 'Lovelace' },
        { id: 'person-b', first_name: 'Grace', last_name: '' },
        { id: 'person-c', first_name: null, last_name: null },
      ]);

      const names = await buildFacade().getPersonDisplayNames({
        state: FULL_STATE,
        personIds: ['person-a', 'person-b', 'person-c'],
        run,
      });

      expect(names.get('person-a')).toBe('Ada Lovelace');
      expect(names.get('person-b')).toBe('Grace');
      expect(names.get('person-c')).toBe('');
    });
  });
});
